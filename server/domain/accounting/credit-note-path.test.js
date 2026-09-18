/**
 * What happens to a credit note after it is read.
 *
 * It shares intake, validation, routing and the accounting handoff with an
 * invoice, because the questions are the same ones: is this supplier known, is
 * the document addressed to us, do its totals add up. It parts company at the
 * money: a credit note says the supplier owes us, so paying it would send
 * money in the wrong direction (ADR-049).
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { testDeps, USERS } from "../../test-support/db.js";
import { handleUpload } from "../intake/intake.js";
import { SYSTEM, human } from "../workflow/transitions.js";
import { buildInvoiceXml } from "../../test-support/invoice-xml.js";
import { createAccountingRecord, buildAccountingRecord } from "./accounting.js";
import { createPaymentInstruction } from "../payments/payments.js";
import { bookCredit } from "./credit-notes.js";

let deps;
let counter = 0;

const upload = (xml) =>
  handleUpload(deps, { buffer: Buffer.from(xml, "utf8"), originalFilename: "doc.xml", sourceChannel: "EMAIL", actor: SYSTEM });

const creditNote = (options = {}) =>
  buildInvoiceXml({ number: `GS-${Date.now()}-${(counter += 1)}`, netCents: 20000, creditNote: true, credits: "RE-2026-0001", po: "PO-2026-0102", ...options });

const stateOf = async (id) => (await deps.pool.query("select state from finops.invoices where id = $1", [id])).rows[0].state;
const finance = () => human(USERS.finance);

before(async () => { deps = await testDeps(); });
after(async () => { await deps.pool.end(); });
beforeEach(async () => { await deps.pool.query("delete from finops.invoices"); });

test("a credit note is stored as one, with the invoice it credits", async () => {
  const received = await upload(creditNote());
  const { rows: [row] } = await deps.pool.query(
    "select document_type, credits_invoice_raw, gross_amount from finops.invoices where id = $1", [received.id],
  );
  assert.equal(row.document_type, "CREDIT_NOTE");
  assert.equal(row.credits_invoice_raw, "RE-2026-0001");
  assert.equal(row.gross_amount, "238.00", "positive, as the document states it");
});

test("an ordinary invoice is still an invoice", async () => {
  const received = await upload(buildInvoiceXml({ number: `RE-${(counter += 1)}`, netCents: 20000, po: "PO-2026-0102" }));
  const { rows: [row] } = await deps.pool.query("select document_type, credits_invoice_raw from finops.invoices where id = $1", [received.id]);
  assert.equal(row.document_type, "INVOICE");
  assert.equal(row.credits_invoice_raw, null);
});

test("the booking record carries the sign, so accounting sees a reversal", () => {
  const record = buildAccountingRecord(
    { document_type: "CREDIT_NOTE", net_amount: "200.00", vat_amount: "38.00", gross_amount: "238.00", supplier_no: "S-1001", invoice_number: "GS-1", currency: "EUR" },
    { documentNo: "BELEG-1", bookingDate: "2026-09-18" },
  );
  assert.equal(record.net_amount, "-200.00");
  assert.equal(record.vat_amount, "-38.00");
  assert.equal(record.gross_amount, "-238.00");
});

test("an invoice's booking record is unchanged", () => {
  const record = buildAccountingRecord(
    { document_type: "INVOICE", net_amount: "200.00", vat_amount: "38.00", gross_amount: "238.00", supplier_no: "S-1001", invoice_number: "RE-1", currency: "EUR" },
    { documentNo: "BELEG-1", bookingDate: "2026-09-18" },
  );
  assert.equal(record.net_amount, "200.00");
  assert.equal(record.gross_amount, "238.00");
});

test("a credit note cannot be paid", async () => {
  const received = await upload(creditNote());
  assert.equal(await stateOf(received.id), "APPROVED", "small enough to need no signature");
  await createAccountingRecord(deps, { invoiceId: received.id, actor: finance() });

  await assert.rejects(
    () => createPaymentInstruction(deps, { invoiceId: received.id, actor: finance() }),
    (error) => error.code === "CREDIT_NOTE_NOT_PAYABLE",
    "the payable path is closed to it",
  );
  const { rowCount } = await deps.pool.query("select 1 from finops.payment_instructions where invoice_id = $1", [received.id]);
  assert.equal(rowCount, 0, "and nothing was written before the refusal");
});

test("booking the credit closes it", async () => {
  const received = await upload(creditNote());
  await createAccountingRecord(deps, { invoiceId: received.id, actor: finance() });
  await bookCredit(deps, { invoiceId: received.id, actor: finance() });

  assert.equal(await stateOf(received.id), "CREDITED");
  const { rows } = await deps.pool.query(
    "select action from finops.audit_events where invoice_id = $1 order by occurred_at, id", [received.id],
  );
  assert.ok(rows.map((r) => r.action).includes("credit_booked"), rows.map((r) => r.action).join(", "));
});

test("an invoice cannot be closed as a credit", async () => {
  const received = await upload(buildInvoiceXml({ number: `RE-${(counter += 1)}`, netCents: 20000, po: "PO-2026-0102" }));
  await createAccountingRecord(deps, { invoiceId: received.id, actor: finance() });
  await assert.rejects(
    () => bookCredit(deps, { invoiceId: received.id, actor: finance() }),
    (error) => error.code === "NOT_A_CREDIT_NOTE",
    "otherwise an invoice could be closed without ever being paid",
  );
});

test("a credit note gives capacity back to the purchase order", async () => {
  // The order was spent by the invoice; the credit note un-spends part of it.
  const { rows: [order] } = await deps.pool.query(
    "select id, remaining_amount from finops.purchase_orders where po_number = 'PO-2026-0102'",
  );
  const available = async () => {
    const { rows: [row] } = await deps.pool.query(
      `select (p.remaining_amount - coalesce(sum(c.amount) filter (where c.status = 'ACTIVE'), 0))::text as free
       from finops.purchase_orders p left join finops.po_commitments c on c.purchase_order_id = p.id
       where p.id = $1 group by p.remaining_amount`, [order.id],
    );
    return row.free;
  };
  assert.equal(await available(), order.remaining_amount, "nothing committed yet");

  const note = await upload(creditNote({ netCents: 10000 }));
  assert.equal(await stateOf(note.id), "APPROVED");
  assert.equal(await available(), "600.00", "500.00 on the order plus the 100.00 credited back");

  // And it stays back. Releasing the claim when the credit note is booked
  // would undo the capacity at the moment the credit becomes final.
  await createAccountingRecord(deps, { invoiceId: note.id, actor: finance() });
  await bookCredit(deps, { invoiceId: note.id, actor: finance() });
  assert.equal(await stateOf(note.id), "CREDITED");
  assert.equal(await available(), "600.00", "a booked credit is not an undone one");
});
