/**
 * A booking has one line per tax rate, as the document breaks it down, all
 * under one document number. One tax key cannot describe 7 % and 19 % at once,
 * and the old record derived a single key from total VAT / total net, which
 * for a mixed invoice named no real rate at all (ADR-053).
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { testDeps } from "../../test-support/db.js";
import { buildInvoiceXml } from "../../test-support/invoice-xml.js";
import { handleUpload } from "../intake/intake.js";
import { SYSTEM, human } from "../workflow/transitions.js";
import { USERS } from "../../test-support/db.js";
import { buildBookingLines, createAccountingRecord, exportAccountingCsv } from "./accounting.js";
import { getInvoiceDetail } from "../invoice/queries.js";

let deps;
let counter = 0;
const finance = human(USERS.finance);

before(async () => {
  deps = await testDeps();
});
after(async () => {
  await deps.pool.end();
});
beforeEach(async () => {
  await deps.pool.query("delete from finops.invoices");
});

/** Auto-approved (under 500 EUR) and booked. */
async function booked(options) {
  const xml = buildInvoiceXml({
    number: `RE-TAX-${(counter += 1)}`,
    po: "PO-2026-0201",
    supplierName: "Havel Logistik GmbH",
    supplierVat: "DE234567890",
    iban: "DE02120300000000202051",
    ...options,
  });
  const { id } = await handleUpload(deps, {
    buffer: Buffer.from(xml, "utf8"),
    originalFilename: "x.xml",
    sourceChannel: "EMAIL",
    actor: SYSTEM,
  });
  await createAccountingRecord(deps, { invoiceId: id, actor: finance });
  return id;
}

const lines = async (id) =>
  (
    await deps.pool.query(
      "select document_no, tax_key, net_amount, vat_amount, gross_amount from finops.accounting_records where invoice_id = $1 order by tax_key",
      [id],
    )
  ).rows;

const subtotals = [
  { category: "S", percent: "19", taxable: "200.00", amount: "38.00" },
  { category: "S", percent: "7", taxable: "100.00", amount: "7.00" },
];
const invoiceRow = (documentType) => ({
  document_type: documentType,
  supplier_no: "S-1001",
  invoice_number: "RE-1",
  currency: "EUR",
  parsed: { taxSubtotals: subtotals },
});

test("one line per rate, each with its own tax key", () => {
  const result = buildBookingLines(invoiceRow("INVOICE"), { documentNo: "BELEG-1", bookingDate: "2026-09-18" });
  assert.deepEqual(
    result.map((l) => [l.document_no, l.tax_key, l.net_amount, l.vat_amount, l.gross_amount]),
    [
      ["BELEG-1", "9", "200.00", "38.00", "238.00"],
      ["BELEG-1", "8", "100.00", "7.00", "107.00"],
    ],
  );
});

test("a credit note's lines carry the sign", () => {
  const result = buildBookingLines(invoiceRow("CREDIT_NOTE"), { documentNo: "BELEG-1", bookingDate: "2026-09-18" });
  assert.deepEqual(
    result.map((l) => [l.net_amount, l.vat_amount, l.gross_amount]),
    [
      ["-200.00", "-38.00", "-238.00"],
      ["-100.00", "-7.00", "-107.00"],
    ],
  );
});

test("a mixed-rate invoice is booked as two lines under one document number", async () => {
  const id = await booked({ netCents: 20000, reducedNetCents: 10000 });
  const rows = await lines(id);
  assert.deepEqual(
    rows.map((r) => [r.tax_key, r.net_amount, r.vat_amount]),
    [
      ["8", "100.00", "7.00"],
      ["9", "200.00", "38.00"],
    ],
  );
  assert.equal(new Set(rows.map((r) => r.document_no)).size, 1);
});

test("the invoice detail carries every booking line", async () => {
  const id = await booked({ netCents: 20000, reducedNetCents: 10000 });
  const detail = await getInvoiceDetail(deps.pool, id);
  assert.deepEqual(
    detail.accounting_lines.map((l) => l.tax_key),
    ["8", "9"],
  );
  assert.equal(detail.accounting_record.document_no, detail.accounting_lines[0].document_no);
});

test("the export has a row per line", async () => {
  const id = await booked({ netCents: 20000, reducedNetCents: 10000 });
  const [row] = await lines(id);
  const csv = await exportAccountingCsv(deps);
  assert.equal(csv.split("\n").filter((l) => l.startsWith(`${row.document_no};`)).length, 2);
});

test("an invoice parsed before the breakdown was read is booked from its stored original", async () => {
  // Approved before ADR-053: its stored parse has no taxSubtotals. The
  // document cannot have changed, so it is read again rather than guessed.
  const xml = buildInvoiceXml({
    number: `RE-OLD-${(counter += 1)}`,
    netCents: 20000,
    reducedNetCents: 10000,
    po: "PO-2026-0201",
    supplierName: "Havel Logistik GmbH",
    supplierVat: "DE234567890",
    iban: "DE02120300000000202051",
  });
  const { id } = await handleUpload(deps, {
    buffer: Buffer.from(xml, "utf8"),
    originalFilename: "x.xml",
    sourceChannel: "EMAIL",
    actor: SYSTEM,
  });
  await deps.pool.query("update finops.invoices set parsed = parsed - 'taxSubtotals' where id = $1", [id]);
  await createAccountingRecord(deps, { invoiceId: id, actor: finance });
  assert.deepEqual(
    (await lines(id)).map((r) => r.tax_key),
    ["8", "9"],
  );
});

test("a breakdown that cannot be booked is refused at the handoff too", async () => {
  // Validation stops it first; this is the handoff not trusting that.
  const xml = buildInvoiceXml({
    number: `RE-BAD-${(counter += 1)}`,
    netCents: 20000,
    po: "PO-2026-0201",
    supplierName: "Havel Logistik GmbH",
    supplierVat: "DE234567890",
    iban: "DE02120300000000202051",
  });
  const { id } = await handleUpload(deps, {
    buffer: Buffer.from(xml, "utf8"),
    originalFilename: "x.xml",
    sourceChannel: "EMAIL",
    actor: SYSTEM,
  });
  await deps.pool.query(`update finops.invoices set parsed = jsonb_set(parsed, '{taxSubtotals,0,percent}', '"16"') where id = $1`, [id]);
  await assert.rejects(
    () => createAccountingRecord(deps, { invoiceId: id, actor: finance }),
    (error) => error.code === "TAX_BREAKDOWN_NOT_BOOKABLE",
  );
  assert.deepEqual(await lines(id), []);
});
