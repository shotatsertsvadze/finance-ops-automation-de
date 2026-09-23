import { withTransaction } from "../../db.js";
import { NotFoundError, TransitionError, transition } from "../workflow/transitions.js";
import { RuleError } from "../approvals/approvals.js";
import { bindingDrift, bindingOf, latestRunNo } from "../approvals/binding.js";
import { centsToDecimal, toCents } from "../money.js";
import { taxKeyFor } from "../../config/tax-keys.js";
import { checkTaxBreakdown } from "../validation/tax-breakdown.js";
import { parseInvoiceXml } from "../invoice/parse-xrechnung.js";

/**
 * Demo account assignments. A real installation maps these from its own chart
 * of accounts; these values are illustrative and are not an SKR mapping.
 */
const EXPENSE_ACCOUNT_BY_COST_CENTER = {
  "CC-100": "6815",
  "CC-200": "6837",
  "CC-300": "6740",
  "CC-400": "6820",
};
const DEFAULT_EXPENSE_ACCOUNT = "6300";

/**
 * Vendor-neutral booking lines, one per tax rate, under one document number.
 * A DATEV or SAP adapter formats these. The amounts are the document's own
 * breakdown, so each line's tax key names a rate the document states rather
 * than one inferred from its totals (ADR-053).
 */
export function buildBookingLines(invoice, { documentNo, bookingDate }) {
  // The document states positive amounts either way; the booking is where the
  // direction belongs, because that is what accounting reads.
  const sign = invoice.document_type === "CREDIT_NOTE" ? -1 : 1;
  const costCenter = invoice.po_cost_center ?? invoice.default_cost_center ?? null;
  return invoice.parsed.taxSubtotals.map((subtotal) => {
    const net = toCents(subtotal.taxable);
    const vat = toCents(subtotal.amount);
    return {
      document_no: documentNo,
      booking_date: bookingDate,
      supplier_no: invoice.supplier_no,
      creditor_account: `70${String(invoice.supplier_no ?? "").replace(/\D/g, "").padStart(3, "0").slice(-3)}`,
      expense_account: EXPENSE_ACCOUNT_BY_COST_CENTER[costCenter] ?? DEFAULT_EXPENSE_ACCOUNT,
      cost_center: costCenter,
      tax_key: taxKeyFor(subtotal.category, subtotal.percent),
      net_amount: centsToDecimal(sign * net),
      vat_amount: centsToDecimal(sign * vat),
      gross_amount: centsToDecimal(sign * (net + vat)),
      currency: invoice.currency ?? "EUR",
      reference: invoice.invoice_number,
    };
  });
}

/** APPROVED to ACCOUNTING_READY, creating one booking line per tax rate. */
export async function createAccountingRecord({ pool, storage, policy }, { invoiceId, actor }) {
  return withTransaction(pool, async (client) => {
    // Lock the invoice row on its own: Postgres refuses FOR UPDATE on a query
    // whose outer joins may produce null rows.
    const locked = await client.query("select 1 from finops.invoices where id = $1 for update", [invoiceId]);
    if (locked.rowCount === 0) throw new NotFoundError("INVOICE_NOT_FOUND", "Rechnung nicht gefunden");
    const { rows: [invoice] } = await client.query(
      `select i.*, s.supplier_no, s.default_cost_center, p.cost_center as po_cost_center
       from finops.invoices i
       left join finops.suppliers s on s.id = i.supplier_id
       left join finops.purchase_orders p on p.id = i.purchase_order_id
       where i.id = $1`,
      [invoiceId],
    );
    if (invoice.state !== "APPROVED") {
      throw new TransitionError("NOT_READY_TO_BOOK", `Rechnung im Status ${invoice.state} ist nicht buchungsreif`, { state: invoice.state });
    }

    // The booking must be of the invoice that was approved, not of whatever
    // the row says now.
    const { rows: approved } = await client.query(
      "select * from finops.approval_steps where invoice_id = $1 and status = 'APPROVED'", [invoiceId],
    );
    const drift = bindingDrift(bindingOf(invoice, await latestRunNo(client, invoiceId)), approved);
    if (drift.length) {
      throw new RuleError(409, "CHANGED_SINCE_APPROVAL", "Rechnung hat sich seit der Freigabe geändert und kann nicht gebucht werden", { drift });
    }

    const parsed = await withTaxBreakdown(invoice, storage);
    const check = checkTaxBreakdown(parsed, policy);
    if (check.status !== "PASSED") {
      throw new RuleError(422, "TAX_BREAKDOWN_NOT_BOOKABLE", "Steueraufschlüsselung ist nicht buchbar, kein Buchungssatz erzeugt", { reason: check.reason });
    }

    const documentNo = await nextDocumentNo(client);
    const lines = buildBookingLines({ ...invoice, parsed }, { documentNo, bookingDate: today() });
    for (const line of lines) await insertLine(client, invoiceId, line);

    await transition(client, {
      invoiceId, to: "ACCOUNTING_READY", actor, action: "accounting_record_created",
      reason: `Buchungssatz ${documentNo}`,
      evidence: {
        document_no: documentNo, creditor_account: lines[0].creditor_account, expense_account: lines[0].expense_account,
        tax_keys: lines.map((l) => l.tax_key),
      },
    });
    return lines;
  });
}

/**
 * Reverses an invoice's booking: the same lines with the sign turned, under a
 * new document number that names the one it reverses. Called inside the
 * caller's transaction, with the invoice row locked (ADR-054).
 */
export async function reverseBooking(client, invoiceId) {
  const { rows: lines } = await client.query(
    "select * from finops.accounting_records where invoice_id = $1 and reverses_document_no is null order by tax_key",
    [invoiceId],
  );
  if (lines.length === 0) return null;
  const documentNo = await nextDocumentNo(client);
  const negate = (amount) => centsToDecimal(-toCents(amount));
  for (const line of lines) {
    await insertLine(client, invoiceId, {
      ...line, document_no: documentNo, booking_date: today(), reverses_document_no: line.document_no,
      net_amount: negate(line.net_amount), vat_amount: negate(line.vat_amount), gross_amount: negate(line.gross_amount),
    });
  }
  return { documentNo, reverses: lines[0].document_no };
}

const today = () => new Date().toISOString().slice(0, 10);

async function nextDocumentNo(client) {
  const { rows: [seq] } = await client.query("select nextval('finops.accounting_document_seq') as n");
  return `BELEG-${new Date().getUTCFullYear()}-${String(seq.n).padStart(5, "0")}`;
}

function insertLine(client, invoiceId, line) {
  return client.query(
    `insert into finops.accounting_records
       (invoice_id, document_no, booking_date, supplier_no, creditor_account, expense_account,
        cost_center, tax_key, net_amount, vat_amount, gross_amount, currency, reference, reverses_document_no)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [invoiceId, line.document_no, line.booking_date, line.supplier_no, line.creditor_account,
      line.expense_account, line.cost_center, line.tax_key, line.net_amount, line.vat_amount,
      line.gross_amount, line.currency, line.reference, line.reverses_document_no ?? null],
  );
}

/**
 * The parse with its tax breakdown. An invoice parsed before the breakdown was
 * read has none stored; the original is an intake fact and cannot have
 * changed, so it is read again rather than the breakdown being guessed.
 */
async function withTaxBreakdown(invoice, storage) {
  if (invoice.parsed?.taxSubtotals) return invoice.parsed;
  const original = await storage.read(invoice.file_path);
  return { ...invoice.parsed, taxSubtotals: parseInvoiceXml(original.toString("utf8")).taxSubtotals };
}

const CSV_COLUMNS = [
  "document_no", "booking_date", "supplier_no", "creditor_account", "expense_account",
  "cost_center", "tax_key", "net_amount", "vat_amount", "gross_amount", "currency", "reference",
];

/**
 * One CSV cell, for a stated consumer.
 *
 * `machine` returns the value as it arrived: a bookkeeping import matching on
 * an invoice number must see that number and nothing else. `spreadsheet`
 * additionally prefixes a cell that Excel, LibreOffice or Sheets would execute
 * — one opening with `=`, `+`, `-`, `@` or a control character — with an
 * apostrophe, which those applications read as "this is text".
 *
 * A well-formed number is never prefixed, or every credit amount would be
 * mangled to defend against a leading minus. Quoting is applied for both: it
 * keeps a value inside its column, which is a different problem.
 */
export const csvCell = (value, profile = "machine") => {
  const text = value === null || value === undefined ? "" : String(value);
  const executable = profile === "spreadsheet"
    && /^[=+\-@\t\r]/.test(text)
    && !/^-?\d+(\.\d+)?$/.test(text);
  const cell = executable ? `'${text}` : text;
  return /[",;\n\r\t]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
};

export const EXPORT_PROFILES = ["machine", "spreadsheet"];

/** Neutral CSV handoff. A vendor adapter would replace this formatter only. */
export async function exportAccountingCsv({ pool }, profile = "machine") {
  const { rows } = await pool.query(
    `select ${CSV_COLUMNS.join(", ")} from finops.accounting_records order by document_no, tax_key`,
  );
  const lines = [CSV_COLUMNS.join(";")];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(row[c], profile)).join(";"));
  return lines.join("\n") + "\n";
}
