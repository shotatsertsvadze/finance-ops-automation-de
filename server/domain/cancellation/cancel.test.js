/**
 * Stopping an approved invoice before money moves (ADR-054). Fraud found after
 * the signature used to have no way out except the payment, or editing the
 * database behind transition()'s back.
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
  clients = { clerk: await loginAs(base, "clerk"), manager: await loginAs(base, "manager"), finance: await loginAs(base, "finance") };
});
after(async () => {
  server.close();
  await deps.pool.end();
});
beforeEach(async () => {
  await deps.pool.query("delete from finops.invoices");
});

const get = (id) => clients.finance.get(`/api/invoices/${id}`).then((r) => r.json());
const cancel = (id, comment, client = clients.finance) => client.post(`/api/invoices/${id}/cancel`, { comment });

/** G: 380.00, approved by the system. */
async function approved() {
  const res = await clients.clerk.upload(fixture("G_clean_380.xml"), "G.xml");
  const invoice = await res.json();
  assert.equal(invoice.state, "APPROVED");
  return invoice;
}

const activeClaims = async (id) =>
  (await deps.pool.query("select count(*)::int as n from finops.po_commitments where invoice_id = $1 and status = 'ACTIVE'", [id])).rows[0].n;

test("an approved invoice can be stopped, with a reason, and gives its order capacity back", async () => {
  const invoice = await approved();
  assert.equal(await activeClaims(invoice.id), 1);

  const res = await cancel(invoice.id, "Lieferant bestreitet die Rechnung, Betrugsverdacht");
  assert.equal(res.status, 200);
  const after = await get(invoice.id);
  assert.equal(after.state, "CANCELLED");
  const event = after.audit_events.at(-1);
  assert.equal(event.action, "invoice_cancelled");
  assert.equal(event.reason, "Lieferant bestreitet die Rechnung, Betrugsverdacht");
  assert.equal(await activeClaims(invoice.id), 0);
});

test("stopping needs a reason", async () => {
  const invoice = await approved();
  const res = await cancel(invoice.id, "  ");
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "REASON_REQUIRED");
  assert.equal((await get(invoice.id)).state, "APPROVED");
});

test("only finance may stop an invoice", async () => {
  const invoice = await approved();
  for (const client of [clients.clerk, clients.manager]) {
    assert.equal((await cancel(invoice.id, "nein", client)).status, 403);
  }
  assert.equal((await get(invoice.id)).state, "APPROVED");
});

test("a booked invoice is stopped with a reversal, so accounting is not left holding it", async () => {
  const invoice = await approved();
  await clients.finance.post(`/api/invoices/${invoice.id}/accounting-record`);
  const original = (await get(invoice.id)).accounting_record.document_no;

  assert.equal((await cancel(invoice.id, "Doppelt geliefert, Rechnung zurückgezogen")).status, 200);
  const { rows } = await deps.pool.query(
    "select document_no, reverses_document_no, net_amount, vat_amount, gross_amount from finops.accounting_records where invoice_id = $1 order by created_at, document_no",
    [invoice.id],
  );
  assert.equal(rows.length, 2);
  const [booking, reversal] = rows;
  assert.equal(booking.reverses_document_no, null);
  assert.equal(reversal.reverses_document_no, original);
  assert.notEqual(reversal.document_no, original, "a reversal is its own document");
  assert.deepEqual(
    [reversal.net_amount, reversal.vat_amount, reversal.gross_amount],
    [booking.net_amount, booking.vat_amount, booking.gross_amount].map((a) => `-${a}`),
  );
  assert.equal((await get(invoice.id)).audit_events.at(-1).evidence.reversal_document_no, reversal.document_no);
});

test("an invoice not yet approved, or already on its way to the bank, cannot be stopped this way", async () => {
  const pending = await (await clients.clerk.upload(fixture("A_clean_1240.xml"), "A.xml")).json();
  assert.equal(pending.state, "READY_FOR_APPROVAL");
  const refused = await cancel(pending.id, "zu früh");
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).code, "NOT_CANCELLABLE");

  const invoice = await approved();
  await clients.finance.post(`/api/invoices/${invoice.id}/accounting-record`);
  await clients.finance.post(`/api/invoices/${invoice.id}/payment`);
  assert.equal((await cancel(invoice.id, "zu spät")).status, 409);
  assert.equal((await get(invoice.id)).state, "PAYMENT_PENDING");
});
