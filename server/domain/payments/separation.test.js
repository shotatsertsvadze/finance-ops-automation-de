/**
 * Approving and paying are separate hands (ADR-056). FINANCE both signs the
 * second approval step and instructs payments, so one person could sign an
 * invoice and then send its money.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../../app.js";
import { loginAs, testDeps } from "../../test-support/db.js";

let deps, server, clients;
const fixture = (name) => readFileSync(new URL(`../../../fixtures/xrechnung/${name}`, import.meta.url));

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  clients = {};
  for (const key of ["clerk", "manager", "finance", "finance2", "cfo"]) clients[key] = await loginAs(base, key);
});
after(async () => {
  server.close();
  await deps.pool.end();
});
beforeEach(async () => {
  await deps.pool.query("delete from finops.invoices");
});

/** E, 30,000.00: signed by manager, finance (Jonas Weber) and CFO, then booked. */
async function signedByFinance() {
  const invoice = await (await clients.clerk.upload(fixture("E_high_value_30000.xml"), "E.xml")).json();
  for (const [step, who] of [
    [1, "manager"],
    [2, "finance"],
    [3, "cfo"],
  ]) {
    assert.equal((await clients[who].post(`/api/invoices/${invoice.id}/approvals/${step}/approve`, {})).status, 200);
  }
  assert.equal((await clients.finance.post(`/api/invoices/${invoice.id}/accounting-record`)).status, 200);
  return invoice;
}

const state = async (id) => (await (await clients.finance.get(`/api/invoices/${id}`)).json()).state;

test("whoever signed an approval step cannot instruct the payment", async () => {
  const invoice = await signedByFinance();
  const res = await clients.finance.post(`/api/invoices/${invoice.id}/payment`);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "APPROVER_CANNOT_PAY");
  assert.equal(await state(invoice.id), "ACCOUNTING_READY");

  assert.equal((await clients.finance2.post(`/api/invoices/${invoice.id}/payment`)).status, 200);
  assert.equal(await state(invoice.id), "PAYMENT_PENDING");
});

test("whoever signed an approval step cannot confirm the payment either", async () => {
  const invoice = await signedByFinance();
  await clients.finance2.post(`/api/invoices/${invoice.id}/payment`);
  const res = await clients.finance.post(`/api/invoices/${invoice.id}/payment/confirm`, { provider_ref: "MOCK-1" });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "APPROVER_CANNOT_PAY");
  assert.equal(await state(invoice.id), "PAYMENT_PENDING");

  assert.equal((await clients.finance2.post(`/api/invoices/${invoice.id}/payment/confirm`, { provider_ref: "MOCK-1" })).status, 200);
  assert.equal(await state(invoice.id), "PAID");
});
