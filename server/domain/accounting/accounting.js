import { withTransaction } from "../../db.js";
import { NotFoundError, TransitionError, transition } from "../workflow/transitions.js";
import { RuleError } from "../approvals/approvals.js";
import { bindingDrift, bindingOf, latestRunNo } from "../approvals/binding.js";
import { centsToDecimal, toCents } from "../money.js";

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
const TAX_KEY_BY_RATE = { 19: "9", 7: "8", 0: "0" };

/** Vendor-neutral booking record. A DATEV or SAP adapter formats this. */
export function buildAccountingRecord(invoice, { documentNo, bookingDate }) {
  const netCents = toCents(invoice.net_amount);
  const vatCents = toCents(invoice.vat_amount);
  const grossCents = toCents(invoice.gross_amount);
  if (netCents === null || vatCents === null || grossCents === null) {
    throw new RuleError(422, "Beträge der Rechnung sind unvollständig, Buchungssatz nicht erzeugbar");
  }
  const ratePercent = netCents === 0 ? 0 : Math.round((vatCents / netCents) * 100);
  const costCenter = invoice.po_cost_center ?? invoice.default_cost_center ?? null;

  return {
    document_no: documentNo,
    booking_date: bookingDate,
    supplier_no: invoice.supplier_no,
    creditor_account: `70${String(invoice.supplier_no ?? "").replace(/\D/g, "").padStart(3, "0").slice(-3)}`,
    expense_account: EXPENSE_ACCOUNT_BY_COST_CENTER[costCenter] ?? DEFAULT_EXPENSE_ACCOUNT,
    cost_center: costCenter,
    tax_key: TAX_KEY_BY_RATE[ratePercent] ?? "0",
    net_amount: centsToDecimal(netCents),
    vat_amount: centsToDecimal(vatCents),
    gross_amount: centsToDecimal(grossCents),
    currency: invoice.currency ?? "EUR",
    reference: invoice.invoice_number,
  };
}

/** APPROVED to ACCOUNTING_READY, creating exactly one booking record. */
export async function createAccountingRecord({ pool }, { invoiceId, actor }) {
  return withTransaction(pool, async (client) => {
    // Lock the invoice row on its own: Postgres refuses FOR UPDATE on a query
    // whose outer joins may produce null rows.
    const locked = await client.query("select 1 from finops.invoices where id = $1 for update", [invoiceId]);
    if (locked.rowCount === 0) throw new NotFoundError("Rechnung nicht gefunden");
    const { rows: [invoice] } = await client.query(
      `select i.*, s.supplier_no, s.default_cost_center, p.cost_center as po_cost_center
       from finops.invoices i
       left join finops.suppliers s on s.id = i.supplier_id
       left join finops.purchase_orders p on p.id = i.purchase_order_id
       where i.id = $1`,
      [invoiceId],
    );
    if (invoice.state !== "APPROVED") {
      throw new TransitionError(`Rechnung im Status ${invoice.state} ist nicht buchungsreif`, { state: invoice.state });
    }

    // The booking must be of the invoice that was approved, not of whatever
    // the row says now.
    const { rows: approved } = await client.query(
      "select * from finops.approval_steps where invoice_id = $1 and status = 'APPROVED'", [invoiceId],
    );
    const drift = bindingDrift(bindingOf(invoice, await latestRunNo(client, invoiceId)), approved);
    if (drift.length) {
      throw new RuleError(409, "Rechnung hat sich seit der Freigabe geändert und kann nicht gebucht werden", { drift });
    }

    const { rows: [seq] } = await client.query("select nextval('finops.accounting_document_seq') as n");
    const documentNo = `BELEG-${new Date().getUTCFullYear()}-${String(seq.n).padStart(5, "0")}`;
    const record = buildAccountingRecord(invoice, { documentNo, bookingDate: new Date().toISOString().slice(0, 10) });

    await client.query(
      `insert into finops.accounting_records
         (invoice_id, document_no, booking_date, supplier_no, creditor_account, expense_account,
          cost_center, tax_key, net_amount, vat_amount, gross_amount, currency, reference)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [invoiceId, record.document_no, record.booking_date, record.supplier_no, record.creditor_account,
        record.expense_account, record.cost_center, record.tax_key, record.net_amount, record.vat_amount,
        record.gross_amount, record.currency, record.reference],
    );

    await transition(client, {
      invoiceId, to: "ACCOUNTING_READY", actor, action: "accounting_record_created",
      reason: `Buchungssatz ${record.document_no}`,
      evidence: { document_no: record.document_no, creditor_account: record.creditor_account, expense_account: record.expense_account, tax_key: record.tax_key },
    });
    return record;
  });
}

const CSV_COLUMNS = [
  "document_no", "booking_date", "supplier_no", "creditor_account", "expense_account",
  "cost_center", "tax_key", "net_amount", "vat_amount", "gross_amount", "currency", "reference",
];

const csvCell = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Neutral CSV handoff. A vendor adapter would replace this formatter only. */
export async function exportAccountingCsv({ pool }) {
  const { rows } = await pool.query(
    `select ${CSV_COLUMNS.join(", ")} from finops.accounting_records order by document_no`,
  );
  const lines = [CSV_COLUMNS.join(";")];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(row[c])).join(";"));
  return lines.join("\n") + "\n";
}
