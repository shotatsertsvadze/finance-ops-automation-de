/**
 * A payment the bank did not carry out (ADR-055). Until now PAYMENT_PENDING
 * could only become PAID: a rejected or returned transfer had no state, and a
 * second attempt was impossible because the instruction was keyed once per
 * invoice.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../../app.js";
import { loginAs, testDeps } from "../../test-support/db.js";
import { buildInvoiceXml } from "../../test-support/invoice-xml.js";

let deps, server, clients;
const fixture = (name) => readFileSync(new URL(`../../../fixtures/xrechnung/${name}`, import.meta.url));

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  clients = { clerk: await loginAs(base, "clerk"), finance: await loginAs(base, "finance") };
});
after(async () => {
  server.close();
  await deps.pool.end();
});
beforeEach(async () => {
  await deps.pool.query("delete from finops.invoices");
});

const get = (id) => clients.finance.get(`/api/invoices/${id}`).then((r) => r.json());
const post = (path, body) => clients.finance.post(path, body);

/** G, 380.00, approved by the system, booked and instructed. */
async function pending() {
  const invoice = await (await clients.clerk.upload(fixture("G_clean_380.xml"), "G.xml")).json();
  await post(`/api/invoices/${invoice.id}/accounting-record`);
  assert.equal((await post(`/api/invoices/${invoice.id}/payment`)).status, 200);
  return invoice;
}

const instructions = async (id) => (await deps.pool.query(
  "select amount, status, idempotency_key from finops.payment_instructions where invoice_id = $1 order by created_at", [id],
)).rows;

test("a payment the bank did not carry out is recorded as failed, with a reason", async () => {
  const invoice = await pending();
  const res = await post(`/api/invoices/${invoice.id}/payment/fail`, { comment: "Rücklastschrift: Konto erloschen" });
  assert.equal(res.status, 200);
  const after = await get(invoice.id);
  assert.equal(after.state, "PAYMENT_FAILED");
  assert.equal(after.audit_events.at(-1).action, "payment_failed");
  assert.equal(after.audit_events.at(-1).reason, "Rücklastschrift: Konto erloschen");
  assert.deepEqual((await instructions(invoice.id)).map((i) => i.status), ["FAILED"]);
});

test("reporting a failure needs a reason, and a payment that is not pending cannot fail", async () => {
  const invoice = await pending();
  const noReason = await post(`/api/invoices/${invoice.id}/payment/fail`, { comment: "" });
  assert.equal(noReason.status, 400);
  assert.equal((await noReason.json()).code, "REASON_REQUIRED");

  await post(`/api/invoices/${invoice.id}/payment/confirm`, { provider_ref: "MOCK-1" });
  const late = await post(`/api/invoices/${invoice.id}/payment/fail`, { comment: "zu spät" });
  assert.equal(late.status, 409);
  assert.equal((await late.json()).code, "NOT_AWAITING_PAYMENT_CONFIRMATION");
});

test("a failed payment is instructed again from the booking, as a new attempt", async () => {
  const invoice = await pending();
  await post(`/api/invoices/${invoice.id}/payment/fail`, { comment: "Bank hat abgelehnt" });
  assert.equal((await post(`/api/invoices/${invoice.id}/payment/retry`)).status, 200);
  assert.equal((await get(invoice.id)).state, "ACCOUNTING_READY");

  assert.equal((await post(`/api/invoices/${invoice.id}/payment`)).status, 200);
  assert.equal((await post(`/api/invoices/${invoice.id}/payment/confirm`, { provider_ref: "MOCK-2" })).status, 200);
  const rows = await instructions(invoice.id);
  assert.deepEqual(rows.map((i) => i.status), ["FAILED", "EXECUTED"]);
  assert.notEqual(rows[0].idempotency_key, rows[1].idempotency_key, "each attempt has its own key");
  const after = await get(invoice.id);
  assert.equal(after.state, "PAID");
  assert.equal(after.payment.status, "EXECUTED", "the detail shows the attempt that counts");
});

test("credits applied to a failed payment are released, and apply again to the next attempt", async () => {
  const note = await (await clients.clerk.upload(
    buildInvoiceXml({ number: "GS-FAIL-1", netCents: 10000, creditNote: true, credits: "INV-X" }), "gs.xml",
  )).json();
  await post(`/api/invoices/${note.id}/accounting-record`);
  await post(`/api/invoices/${note.id}/credit`);

  const invoice = await pending();
  assert.equal((await instructions(invoice.id))[0].amount, "261.00", "380.00 less the 119.00 credit");
  await post(`/api/invoices/${invoice.id}/payment/fail`, { comment: "abgelehnt" });
  assert.equal((await get(invoice.id)).open_credit_amount, "119.00", "the credit is open again");

  await post(`/api/invoices/${invoice.id}/payment/retry`);
  await post(`/api/invoices/${invoice.id}/payment`);
  assert.equal((await instructions(invoice.id))[1].amount, "261.00", "and is applied to the retry");
});

test("a failed payment can be stopped instead, reversing its booking", async () => {
  const invoice = await pending();
  await post(`/api/invoices/${invoice.id}/payment/fail`, { comment: "Rückruf bestätigt, Betrugsverdacht" });
  assert.equal((await post(`/api/invoices/${invoice.id}/cancel`, { comment: "Betrug bestätigt" })).status, 200);
  const after = await get(invoice.id);
  assert.equal(after.state, "CANCELLED");
  assert.equal(after.accounting_reversal.length, 1);
});

test("two live instructions for one invoice are impossible", async () => {
  const invoice = await pending();
  await assert.rejects(
    () => deps.pool.query(
      `insert into finops.payment_instructions (invoice_id, idempotency_key, amount, currency, creditor_iban, creditor_name, reference)
       values ($1, 'pay:second', 1, 'EUR', 'X', 'X', 'X')`, [invoice.id],
    ),
    /payment_instructions_one_live_per_invoice|duplicate key/,
  );
});

test("only a failed payment can be retried", async () => {
  const invoice = await pending();
  const res = await post(`/api/invoices/${invoice.id}/payment/retry`);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "NOT_A_FAILED_PAYMENT");
});
