/**
 * Reconciliation over the real API: what happens to the bank evidence, not
 * just to the invoice.
 *
 * The defect these cover: closing an exception moved the invoice to RECONCILED
 * and left its transaction sitting at EXCEPTION. The next run then reset that
 * transaction to UNMATCHED, cleared its reason but kept the old invoice link,
 * and left it free to attach itself to a later invoice of the same amount.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../app.js";
import { loginAs, testDeps } from "../../test-support/db.js";
import { buildInvoiceXml } from "../../test-support/invoice-xml.js";

let deps, server, base, clients;

const SUPPLIER_IBAN = "DE89370400440532013000";
let counter = 0;

/** Drives one invoice all the way to PAID through the real endpoints. */
async function paidInvoice(netCents, number = `REC-${Date.now()}-${(counter += 1)}`) {
  const xml = buildInvoiceXml({ number, netCents, po: "PO-2026-0101" });
  const res = await clients.clerk.upload(xml, `${number}.xml`);
  assert.equal(res.status, 201, `upload ${number}`);
  const invoice = await res.json();

  const step = invoice.approval_steps?.find((s) => s.status === "PENDING");
  if (step) {
    const approved = await clients.manager.post(`/api/invoices/${invoice.id}/approvals/${step.step_no}/approve`, {});
    assert.equal(approved.status, 200, "approval");
  }
  for (const stage of ["accounting-record", "payment", "payment/confirm"]) {
    const staged = await clients.finance.post(`/api/invoices/${invoice.id}/${stage}`, {});
    assert.equal(staged.status, 200, stage);
  }
  const detail = await get(invoice.id);
  assert.equal(detail.state, "PAID", `${number} reached PAID`);
  return { id: invoice.id, number, gross: detail.gross_amount };
}

const get = (id) => clients.clerk.get(`/api/invoices/${id}`).then((r) => r.json());

// The route treats the request body as the statement itself.
const importTx = (tx) =>
  clients.finance.post("/api/bank/import", {
    transactions: [{ currency: "EUR", counterparty_iban: SUPPLIER_IBAN, value_date: "2026-09-20", ...tx }],
  });

const run = () => clients.finance.post("/api/reconciliation/run", {}).then((r) => r.json());

const txRow = async (externalId) => {
  const { rows: [row] } = await deps.pool.query(
    "select * from finops.bank_transactions where external_id = $1", [externalId],
  );
  return row;
};

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  clients = {
    clerk: await loginAs(base, "clerk"),
    manager: await loginAs(base, "manager"),
    finance: await loginAs(base, "finance"),
  };
});
after(async () => {
  server.close();
  await deps.pool.end();
});
beforeEach(async () => {
  await deps.pool.query("delete from finops.bank_transactions");
  await deps.pool.query("delete from finops.invoices");
});

test("a clean payment reconciles the invoice and consumes the transaction", async () => {
  const invoice = await paidInvoice(10000);
  await importTx({ external_id: "TX-CLEAN", amount: `-${invoice.gross}`, reference: `Rechnung ${invoice.number}` });

  const summary = await run();
  assert.equal(summary.matched, 1, JSON.stringify(summary));
  assert.equal((await get(invoice.id)).state, "RECONCILED");
  assert.equal((await txRow("TX-CLEAN")).status, "MATCHED");
});

test("closing an exception by hand also closes its bank evidence", async () => {
  const invoice = await paidInvoice(10000);
  // A short payment: the reference names the invoice, the amount does not agree.
  await importTx({ external_id: "TX-SHORT", amount: "-100.00", reference: `Rechnung ${invoice.number}` });

  await run();
  assert.equal((await get(invoice.id)).state, "RECONCILIATION_EXCEPTION");
  assert.equal((await txRow("TX-SHORT")).status, "EXCEPTION");

  const resolved = await clients.finance.post(`/api/invoices/${invoice.id}/reconciliation/resolve`, {
    comment: "Restbetrag mit dem Lieferanten verrechnet",
  });
  assert.equal(resolved.status, 200);
  assert.equal((await get(invoice.id)).state, "RECONCILED");
  assert.equal((await txRow("TX-SHORT")).status, "RESOLVED", "the evidence is consumed, not left open");
});

test("resolved evidence does not come back in the next run", async () => {
  const invoice = await paidInvoice(10000);
  await importTx({ external_id: "TX-SHORT", amount: "-100.00", reference: `Rechnung ${invoice.number}` });
  await run();
  await clients.finance.post(`/api/invoices/${invoice.id}/reconciliation/resolve`, { comment: "geklärt" });

  await run();
  const row = await txRow("TX-SHORT");
  assert.equal(row.status, "RESOLVED", "a second run must not reopen it");
  assert.equal(row.matched_invoice_id, invoice.id, "and it still names the invoice it was resolved against");
});

test("resolved evidence cannot attach itself to a later invoice", async () => {
  // The defect: after manual resolution the transaction returned to the pool
  // and matched a different invoice that happened to carry the same number.
  const first = await paidInvoice(10000, "REC-SHARED-NUMBER");
  await importTx({ external_id: "TX-REUSE", amount: "-100.00", reference: "Rechnung REC-SHARED-NUMBER" });
  await run();
  await clients.finance.post(`/api/invoices/${first.id}/reconciliation/resolve`, { comment: "geklärt" });

  // A later invoice of exactly the amount that transaction carries.
  const second = await paidInvoice(8403, "REC-SHARED-NUMBER-2");
  assert.equal(second.gross, "100.00", "the second invoice is worth the stray transaction");

  await run();
  assert.equal((await txRow("TX-REUSE")).status, "RESOLVED");
  assert.notEqual((await get(second.id)).state, "RECONCILED", "spent evidence must not close another invoice");
});

test("a transaction that stops matching loses its invoice link", async () => {
  const invoice = await paidInvoice(10000);
  await importTx({ external_id: "TX-STALE", amount: "-100.00", reference: `Rechnung ${invoice.number}` });
  await run();
  assert.equal((await txRow("TX-STALE")).matched_invoice_id, invoice.id);

  // Remove the invoice from the pool the way the product does: resolve it.
  await clients.finance.post(`/api/invoices/${invoice.id}/reconciliation/resolve`, { comment: "geklärt" });
  // A second, unrelated transaction naming nothing must end up clean.
  await importTx({ external_id: "TX-NOTHING", amount: "-77.77", reference: "Sammelzahlung ohne Bezug" });
  await run();

  const row = await txRow("TX-NOTHING");
  assert.equal(row.status, "UNMATCHED");
  assert.equal(row.matched_invoice_id, null, "an unmatched transaction names no invoice");
  assert.equal(row.match_reason, null);
});

test("a payment in the wrong currency does not reconcile the invoice", async () => {
  const invoice = await paidInvoice(10000);
  await importTx({
    external_id: "TX-USD", amount: `-${invoice.gross}`, currency: "USD",
    reference: `Rechnung ${invoice.number}`,
  });

  await run();
  assert.equal((await get(invoice.id)).state, "RECONCILIATION_EXCEPTION");
  assert.equal((await txRow("TX-USD")).match_reason, "CURRENCY_MISMATCH");
});

test("a payment to another supplier's account does not reconcile the invoice", async () => {
  const invoice = await paidInvoice(10000);
  await importTx({
    external_id: "TX-OTHER-IBAN", amount: `-${invoice.gross}`,
    counterparty_iban: "DE02120300000000202051", reference: `Rechnung ${invoice.number}`,
  });

  await run();
  assert.equal((await get(invoice.id)).state, "RECONCILIATION_EXCEPTION");
  assert.equal((await txRow("TX-OTHER-IBAN")).match_reason, "COUNTERPARTY_MISMATCH");
});

test("money arriving does not reconcile a payable", async () => {
  const invoice = await paidInvoice(10000);
  await importTx({ external_id: "TX-INCOMING", amount: invoice.gross, reference: `Rechnung ${invoice.number}` });

  await run();
  assert.equal((await get(invoice.id)).state, "RECONCILIATION_EXCEPTION");
  assert.equal((await txRow("TX-INCOMING")).match_reason, "PAYMENT_DIRECTION");
});

test("the bank line is compared with what was instructed, not with the invoice", async () => {
  // The two agree today, so nothing else in this file can tell which one is
  // read. Moving the invoice out from under its instruction separates them:
  // the bank acted on the instruction, so that is what must be reconciled.
  const invoice = await paidInvoice(10000);
  await deps.pool.query(
    "update finops.invoices set supplier_iban_raw = $2, gross_amount = $3 where id = $1",
    [invoice.id, "DE02120300000000202051", "999.99"],
  );

  await importTx({ external_id: "TX-INSTRUCTED", amount: `-${invoice.gross}`, reference: `Rechnung ${invoice.number}` });
  await run();

  assert.equal((await get(invoice.id)).state, "RECONCILED",
    "matching the instruction still succeeds although the invoice row now disagrees");
  assert.equal((await txRow("TX-INSTRUCTED")).status, "MATCHED");
});

test("an invoice that was never instructed cannot be reconciled", async () => {
  const invoice = await paidInvoice(10000);
  await deps.pool.query("delete from finops.payment_instructions where invoice_id = $1", [invoice.id]);
  await importTx({ external_id: "TX-NO-INSTRUCTION", amount: `-${invoice.gross}`, reference: `Rechnung ${invoice.number}` });

  await run();
  assert.equal((await txRow("TX-NO-INSTRUCTION")).status, "UNMATCHED");
  assert.equal((await get(invoice.id)).state, "PAID", "no instruction, nothing to reconcile against");
});
