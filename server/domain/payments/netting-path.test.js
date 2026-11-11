/**
 * A booked credit note reducing the next payment to the same supplier.
 *
 * The money that leaves the bank is the invoice less the credits applied to
 * it, and which credits those were is recorded rather than inferred. The
 * reconciliation side needs no change: it has always compared a bank line with
 * the payment instruction rather than the invoice, which is exactly the case
 * where the two stop agreeing (ADR-050).
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { testDeps, USERS } from "../../test-support/db.js";
import { handleUpload } from "../intake/intake.js";
import { SYSTEM, human } from "../workflow/transitions.js";
import { buildInvoiceXml } from "../../test-support/invoice-xml.js";
import { createAccountingRecord } from "../accounting/accounting.js";
import { decideApprovalStep } from "../approvals/approvals.js";
import { bookCredit } from "../accounting/credit-notes.js";
import { createPaymentInstruction } from "./payments.js";
import { settleByCredit } from "../accounting/netting.js";
import { getInvoiceDetail } from "../invoice/queries.js";

let deps;
let counter = 0;
const finance = () => human(USERS.finance);

const upload = (xml) =>
  handleUpload(deps, { buffer: Buffer.from(xml, "utf8"), originalFilename: "doc.xml", sourceChannel: "EMAIL", actor: SYSTEM });

const stateOf = async (id) => (await deps.pool.query("select state from finops.invoices where id = $1", [id])).rows[0].state;

/** Takes whatever signatures the amount policy asks for. */
async function approveAll(invoiceId) {
  const { rows: steps } = await deps.pool.query(
    "select step_no, required_role from finops.approval_steps where invoice_id = $1 and status = 'PENDING' order by step_no",
    [invoiceId],
  );
  const approver = { MANAGER: USERS.manager, FINANCE: USERS.finance, CFO: USERS.cfo };
  for (const step of steps) {
    await decideApprovalStep(deps, {
      invoiceId,
      stepNo: step.step_no,
      action: "approve",
      actor: human(approver[step.required_role]),
      user: { role: step.required_role },
      comment: null,
    });
  }
}

/** A credit note for this supplier, booked and open. */
async function bookedCredit(netCents, options = {}) {
  const note = await upload(
    buildInvoiceXml({
      number: `GS-${Date.now()}-${(counter += 1)}`,
      netCents,
      creditNote: true,
      credits: "RE-2026-0001",
      po: "PO-2026-0102",
      ...options,
    }),
  );
  await approveAll(note.id);
  await createAccountingRecord(deps, { invoiceId: note.id, actor: finance() });
  await bookCredit(deps, { invoiceId: note.id, actor: finance() });
  return note;
}

/** An invoice for the same supplier, approved if it needs a signature, then booked. */
async function readyToPay(netCents, options = {}) {
  const invoice = await upload(
    buildInvoiceXml({
      number: `RE-${Date.now()}-${(counter += 1)}`,
      netCents,
      po: "PO-2026-0102",
      ...options,
    }),
  );
  await approveAll(invoice.id);
  await createAccountingRecord(deps, { invoiceId: invoice.id, actor: finance() });
  return invoice;
}

const instruction = async (invoiceId) =>
  (await deps.pool.query("select amount, reference from finops.payment_instructions where invoice_id = $1", [invoiceId])).rows[0];
const applications = async (invoiceId) =>
  (await deps.pool.query("select amount from finops.credit_applications where invoice_id = $1 order by amount", [invoiceId])).rows;

before(async () => {
  deps = await testDeps();
});
after(async () => {
  await deps.pool.end();
});
beforeEach(async () => {
  await deps.pool.query("delete from finops.invoices");
});

test("with no open credit the payment is the invoice", async () => {
  const invoice = await readyToPay(20000);
  await createPaymentInstruction(deps, { invoiceId: invoice.id, actor: finance() });
  assert.equal((await instruction(invoice.id)).amount, "238.00");
  assert.deepEqual(await applications(invoice.id), []);
});

test("an open credit reduces what is sent to the bank", async () => {
  const note = await bookedCredit(10000); // 119.00 gross
  const invoice = await readyToPay(50000); // 595.00 gross
  await createPaymentInstruction(deps, { invoiceId: invoice.id, actor: finance() });

  assert.equal((await instruction(invoice.id)).amount, "476.00", "595.00 less 119.00");
  assert.deepEqual(
    (await applications(invoice.id)).map((r) => r.amount),
    ["119.00"],
  );
  const {
    rows: [left],
  } = await deps.pool.query(
    `select (i.gross_amount - coalesce(sum(a.amount), 0))::text as open
     from finops.invoices i left join finops.credit_applications a on a.credit_note_id = i.id
     where i.id = $1 group by i.gross_amount`,
    [note.id],
  );
  assert.equal(left.open, "0.00", "the credit is used up");
});

test("the credit note shows what is left of it", async () => {
  // A credit bigger than the invoice is used only as far as the invoice goes,
  // and the invoice is settled against it rather than paid.
  const note = await bookedCredit(50000); // 595.00 gross
  const invoice = await readyToPay(10000); // 119.00 gross
  await settleByCredit(deps, { invoiceId: invoice.id, actor: finance() });
  assert.equal(await stateOf(invoice.id), "SETTLED_BY_CREDIT");

  const {
    rows: [left],
  } = await deps.pool.query(
    `select (i.gross_amount - coalesce(sum(a.amount), 0))::text as open
     from finops.invoices i left join finops.credit_applications a on a.credit_note_id = i.id
     where i.id = $1 group by i.gross_amount`,
    [note.id],
  );
  assert.equal(left.open, "476.00", "595.00 less the 119.00 applied");
});

test("a credit from another supplier is not touched", async () => {
  const other = {
    supplierName: "Havel Logistik GmbH",
    supplierVat: "DE234567890",
    iban: "DE02120300000000202051",
    po: "PO-2026-0201",
  };
  await bookedCredit(10000, other);
  const invoice = await readyToPay(50000);
  await createPaymentInstruction(deps, { invoiceId: invoice.id, actor: finance() });
  assert.equal((await instruction(invoice.id)).amount, "595.00", "one supplier's credit does not pay another's invoice");
});

test("the invoice detail shows the credit the payment would apply, and no other", async () => {
  // The client chooses between "pay" and "settle" from this figure, so it must
  // be the netting's own answer. A credit in another currency is not applied.
  const note = await bookedCredit(10000); // 119.00
  const invoice = await readyToPay(50000);
  assert.equal((await getInvoiceDetail(deps.pool, invoice.id)).open_credit_amount, "119.00");

  await deps.pool.query("update finops.invoices set currency = 'USD' where id = $1", [note.id]);
  assert.equal((await getInvoiceDetail(deps.pool, invoice.id)).open_credit_amount, "0.00");
});

test("a credit note that is only approved is not yet available", async () => {
  // It has to be booked. Until then it is a document under consideration.
  const note = await upload(
    buildInvoiceXml({
      number: `GS-UNBOOKED-${(counter += 1)}`,
      netCents: 10000,
      creditNote: true,
      credits: "RE-1",
      po: "PO-2026-0102",
    }),
  );
  assert.equal(await stateOf(note.id), "APPROVED");
  const invoice = await readyToPay(50000);
  await createPaymentInstruction(deps, { invoiceId: invoice.id, actor: finance() });
  assert.equal((await instruction(invoice.id)).amount, "595.00");
});

test("an invoice a credit covers entirely is not paid at all", async () => {
  // A bank instruction for 0.00 is not a payment. It stops for a person.
  await bookedCredit(50000);
  const invoice = await readyToPay(10000);
  await assert.rejects(
    () => createPaymentInstruction(deps, { invoiceId: invoice.id, actor: finance() }),
    (error) => error.code === "FULLY_CREDITED",
  );
  assert.equal(await instruction(invoice.id), undefined, "nothing was sent");
  assert.deepEqual(await applications(invoice.id), [], "and no credit was consumed");
});

test("a replayed payment does not consume the credit twice", async () => {
  // The second call is refused by the state, before it reaches the netting.
  // The unique index on (credit_note_id, invoice_id) is the second lock.
  await bookedCredit(10000);
  const invoice = await readyToPay(50000);
  await createPaymentInstruction(deps, { invoiceId: invoice.id, actor: finance() });
  await assert.rejects(
    () => createPaymentInstruction(deps, { invoiceId: invoice.id, actor: finance() }),
    (error) => error.code === "NOT_READY_FOR_PAYMENT",
  );
  assert.deepEqual(
    (await applications(invoice.id)).map((r) => r.amount),
    ["119.00"],
  );
});

test("a credit cannot be applied to the same invoice twice", async () => {
  // Proving the index, not the state guard above: the same plan written twice
  // must fail rather than spend the credit again.
  const note = await bookedCredit(10000);
  const invoice = await readyToPay(50000);
  await createPaymentInstruction(deps, { invoiceId: invoice.id, actor: finance() });
  await assert.rejects(
    () =>
      deps.pool.query("insert into finops.credit_applications (credit_note_id, invoice_id, amount) values ($1, $2, $3)", [
        note.id,
        invoice.id,
        "1.00",
      ]),
    /credit_applications_once_per_pair|duplicate key/,
  );
});

test("a settled invoice keeps its claim on the purchase order", async () => {
  // Settled against a credit is still spent: the goods were delivered. Its
  // claim stays active, as a paid invoice's does.
  await bookedCredit(10000);
  const invoice = await readyToPay(10000);
  await settleByCredit(deps, { invoiceId: invoice.id, actor: finance() });
  const { rows } = await deps.pool.query("select amount from finops.po_commitments where invoice_id = $1 and status = 'ACTIVE'", [
    invoice.id,
  ]);
  assert.deepEqual(
    rows.map((r) => r.amount),
    ["100.00"],
  );
});

test("settling refuses an invoice the credits do not cover", async () => {
  await bookedCredit(10000); // 119.00
  const invoice = await readyToPay(50000); // 595.00
  await assert.rejects(
    () => settleByCredit(deps, { invoiceId: invoice.id, actor: finance() }),
    (error) => error.code === "NOT_FULLY_CREDITED",
    "the rest is money that has to be sent",
  );
  assert.deepEqual(await applications(invoice.id), [], "and nothing was consumed");
});

test("what was applied is on the audit trail, not only in the amount", async () => {
  await bookedCredit(10000);
  const invoice = await readyToPay(50000);
  await createPaymentInstruction(deps, { invoiceId: invoice.id, actor: finance() });

  const {
    rows: [event],
  } = await deps.pool.query("select reason, evidence from finops.audit_events where invoice_id = $1 and action = 'payment_instructed'", [
    invoice.id,
  ]);
  assert.match(event.reason, /476\.00/, "the reason states what was actually sent");
  assert.equal(event.evidence.credit_applied, "119.00");
  assert.equal(event.evidence.gross_amount, "595.00");
});

test("two credits are both applied, oldest first", async () => {
  await bookedCredit(10000, { issueDate: "2026-08-01" });
  await bookedCredit(10000, { issueDate: "2026-09-01" });
  const invoice = await readyToPay(50000);
  await createPaymentInstruction(deps, { invoiceId: invoice.id, actor: finance() });
  assert.equal((await instruction(invoice.id)).amount, "357.00", "595.00 less two credits of 119.00");
  assert.equal((await applications(invoice.id)).length, 2);
});

// --- two at once (ADR-083) ----------------------------------------------------
//
// Two sessions reach the same credit note. The first holds its lock while the
// second waits for it; what the second may use is what is left once the
// first has committed, never the balance it would have read before.

/** Supplier's credit note: its gross amount and everything applied from it. */
async function ledger(note) {
  const {
    rows: [row],
  } = await deps.pool.query(
    `select i.gross_amount, coalesce(sum(a.amount), 0)::numeric(14,2)::text as applied
     from finops.invoices i left join finops.credit_applications a on a.credit_note_id = i.id and a.released_at is null
     where i.id = $1 group by i.gross_amount`,
    [note.id],
  );
  return row;
}

async function lockWaiters() {
  const {
    rows: [row],
  } = await deps.pool.query(
    "select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
  );
  return row.n;
}

async function untilLockWaiters(n) {
  for (let i = 0; i < 250; i += 1) {
    if ((await lockWaiters()) >= n) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`expected ${n} sessions waiting on a lock`);
}

/**
 * Runs `first` until it is about to write its credit applications, holding the
 * credit-note locks it took; starts `second` while it waits; then lets
 * `first` commit. A third session holding the ledger table in SHARE mode is
 * what stops `first` at exactly that point.
 */
async function interleaved(first, second) {
  const blocker = await deps.pool.connect();
  try {
    await blocker.query("begin");
    await blocker.query("lock table finops.credit_applications in share mode");
    const one = first();
    await untilLockWaiters(1);
    const two = second();
    await untilLockWaiters(2);
    await blocker.query("commit");
    return await Promise.allSettled([one, two]);
  } finally {
    blocker.release();
  }
}

const pay = (invoice) => () => createPaymentInstruction(deps, { invoiceId: invoice.id, actor: finance() });
const settle = (invoice) => () => settleByCredit(deps, { invoiceId: invoice.id, actor: finance() });

test("payment against payment: the credit is spent once, and the second payment is the full amount", async () => {
  const note = await bookedCredit(10000); // 119.00
  const a = await readyToPay(20000); // 238.00
  const b = await readyToPay(20000);
  const results = await interleaved(pay(a), pay(b));
  assert.deepEqual(
    results.map((r) => r.status),
    ["fulfilled", "fulfilled"],
  );
  assert.deepEqual([(await instruction(a.id)).amount, (await instruction(b.id)).amount], ["119.00", "238.00"]);
  assert.deepEqual(await ledger(note), { gross_amount: "119.00", applied: "119.00" });
});

test("settlement against payment: the payment uses only the balance the settlement left", async () => {
  const note = await bookedCredit(30000); // 357.00
  const a = await readyToPay(20000); // 238.00, covered
  const b = await readyToPay(20000);
  const results = await interleaved(settle(a), pay(b));
  assert.deepEqual(
    results.map((r) => r.status),
    ["fulfilled", "fulfilled"],
  );
  assert.equal(await stateOf(a.id), "SETTLED_BY_CREDIT");
  assert.equal((await instruction(b.id)).amount, "119.00", "238.00 less the 119.00 left");
  assert.deepEqual(await ledger(note), { gross_amount: "357.00", applied: "357.00" });
});

test("payment against settlement: an invoice the spent credit no longer covers is not settled", async () => {
  const note = await bookedCredit(20000); // 238.00
  const a = await readyToPay(40000); // 476.00
  const b = await readyToPay(20000); // 238.00, covered only before a's payment
  const [paid, settled] = await interleaved(pay(a), settle(b));
  assert.equal(paid.status, "fulfilled");
  assert.equal(settled.status, "rejected");
  assert.equal(settled.reason.code, "NOT_FULLY_CREDITED");
  assert.equal(await stateOf(b.id), "ACCOUNTING_READY");
  assert.equal((await instruction(a.id)).amount, "238.00");
  assert.deepEqual(await applications(b.id), []);
  assert.deepEqual(await ledger(note), { gross_amount: "238.00", applied: "238.00" });
});

test("unforced, repeated: two payments at once never spend more than the credit", async () => {
  for (let run = 0; run < 5; run += 1) {
    await deps.pool.query("delete from finops.invoices");
    const note = await bookedCredit(10000); // 119.00
    const a = await readyToPay(20000); // 238.00
    const b = await readyToPay(20000);
    await Promise.all([pay(a)(), pay(b)()]);
    assert.deepEqual(await ledger(note), { gross_amount: "119.00", applied: "119.00" }, `run ${run}`);
    const amounts = [(await instruction(a.id)).amount, (await instruction(b.id)).amount].sort();
    assert.deepEqual(amounts, ["119.00", "238.00"], `run ${run}: one netted, one in full`);
  }
});
