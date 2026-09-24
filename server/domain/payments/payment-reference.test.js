/**
 * What a payment is known by at the bank (ADR-063). The reference sent was the
 * supplier's own invoice number: chosen by the supplier, not unique across
 * suppliers, and never checked against SEPA's 140 characters. Reconciliation
 * then looked for that number in the bank line.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../app.js";
import { loginAs, testDeps } from "../../test-support/db.js";
import { buildInvoiceXml } from "../../test-support/invoice-xml.js";

let deps, server, clients;
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
  await deps.pool.query("delete from finops.bank_transactions");
  await deps.pool.query("delete from finops.invoices");
});

const get = (id) => clients.finance.get(`/api/invoices/${id}`).then((r) => r.json());

/** Under the auto-approval limit, so no approver is needed; paid and confirmed. */
async function paid(number) {
  const invoice = await (await clients.clerk.upload(buildInvoiceXml({ number, netCents: 10000, po: "PO-2026-0101" }), "x.xml")).json();
  for (const stage of ["accounting-record", "payment", "payment/confirm"]) {
    assert.equal((await clients.finance.post(`/api/invoices/${invoice.id}/${stage}`, {})).status, 200, stage);
  }
  return get(invoice.id);
}

test("each payment carries its own end-to-end id, and the reference sent names it and the invoice", async () => {
  const one = await paid("REF-1");
  const two = await paid("REF-2");
  assert.match(one.payment.end_to_end_id, /^NW-P-\d{8}$/);
  assert.notEqual(one.payment.end_to_end_id, two.payment.end_to_end_id);
  assert.equal(one.payment.reference, `${one.payment.end_to_end_id} RE REF-1`);
});

test("a supplier's invoice number cannot push the reference outside SEPA", async () => {
  const invoice = await paid(`RE#2026|${"9".repeat(200)}`);
  const { reference } = invoice.payment;
  assert.ok(reference.length <= 140, `${reference.length} characters`);
  assert.match(reference, /^[A-Za-z0-9/\-?:().,'+ ]+$/, "only characters SEPA carries");
  assert.ok(reference.startsWith(`${invoice.payment.end_to_end_id} RE RE.2026.`));
});

test("a bank line is matched by the payment's own id, not by the supplier's number", async () => {
  const invoice = await paid("REF-3");
  const line = (externalId, reference) => ({
    external_id: externalId, value_date: "2026-09-20", amount: `-${invoice.gross_amount}`, currency: "EUR",
    counterparty_iban: "DE89370400440532013000", reference,
  });

  await clients.finance.post("/api/bank/import", { transactions: [line("TX-NUMBER-ONLY", "Rechnung REF-3")] });
  await clients.finance.post("/api/reconciliation/run", {});
  assert.equal((await get(invoice.id)).state, "PAID", "the supplier's number alone identifies nothing");

  await clients.finance.post("/api/bank/import", { transactions: [line("TX-OWN-ID", `Zahlung ${invoice.payment.reference}`)] });
  await clients.finance.post("/api/reconciliation/run", {});
  assert.equal((await get(invoice.id)).state, "RECONCILED");
});
