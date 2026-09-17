/**
 * Phase 3: accounting handoff, simulated payment, reconciliation.
 *
 * Driven over HTTP against the real database. The idempotency cases are the
 * point: a replayed handoff, payment or statement import must not produce a
 * second booking, a second payment or a second transaction.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../../app.js";
import { loginAs, testDeps } from "../../test-support/db.js";

let deps, server, base, clients;

const fixture = (name) => readFileSync(new URL(`../../../fixtures/xrechnung/${name}`, import.meta.url));
const statement = JSON.parse(readFileSync(new URL("../../../fixtures/bank/statement_2026-09.json", import.meta.url), "utf8"));

async function upload(name, client = clients.clerk) {
  const res = await client.upload(fixture(name), name);
  assert.equal(res.status, 201, `upload ${name}`);
  return res.json();
}

/** `actor` is now an authenticated client, not a claimed id. */
const post = (path, { actor, body } = {}) => (actor ?? clients.clerk).post(path, body);

const get = (id) => clients.clerk.get(`/api/invoices/${id}`).then((r) => r.json());

/** An approved invoice, through the real approval path. */
async function approved(name = "A_clean_1240.xml") {
  const invoice = await upload(name);
  if (invoice.state === "APPROVED") return invoice;
  assert.equal(invoice.state, "READY_FOR_APPROVAL");
  const res = await post(`/api/invoices/${invoice.id}/approvals/1/approve`, { actor: clients.manager, body: {} });
  assert.equal(res.status, 200);
  return get(invoice.id);
}

/** All the way to PAID, ready for reconciliation. */
async function paid(name = "A_clean_1240.xml") {
  const invoice = await approved(name);
  await post(`/api/invoices/${invoice.id}/accounting-record`, { actor: clients.finance });
  await post(`/api/invoices/${invoice.id}/payment`, { actor: clients.finance });
  await post(`/api/invoices/${invoice.id}/payment/confirm`, { actor: clients.finance, body: { provider_ref: "MOCK-1" } });
  return get(invoice.id);
}

const importStatement = (payload = statement) => post("/api/bank/import", { actor: clients.finance, body: payload });
const runReconciliation = () => post("/api/reconciliation/run", { actor: clients.finance });

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  clients = {
    clerk: await loginAs(base, "clerk"),
    manager: await loginAs(base, "manager"),
    manager2: await loginAs(base, "manager2"),
    finance: await loginAs(base, "finance"),
    finance2: await loginAs(base, "finance2"),
    cfo: await loginAs(base, "cfo"),
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

// ------------------------------------------------------------- accounting ---

test("an approved invoice produces one accounting record and becomes bookable", async () => {
  const invoice = await approved();

  const res = await post(`/api/invoices/${invoice.id}/accounting-record`, { actor: clients.finance });
  assert.equal(res.status, 200);

  const after = await get(invoice.id);
  assert.equal(after.state, "ACCOUNTING_READY");
  assert.ok(after.accounting_record, "record is part of the invoice detail");
  assert.match(after.accounting_record.document_no, /^BELEG-\d{4}-\d{5}$/);
  assert.equal(after.accounting_record.gross_amount, "1240.00");
  assert.equal(after.accounting_record.net_amount, "1042.02");
  assert.equal(after.accounting_record.vat_amount, "197.98");
  assert.equal(after.accounting_record.reference, "INV-2026-00421");
  assert.equal(after.accounting_record.supplier_no, "S-1001");
  assert.equal(after.audit_events.at(-1).action, "accounting_record_created");
});

test("a repeated accounting handoff does not create a second booking", async () => {
  const invoice = await approved();
  await post(`/api/invoices/${invoice.id}/accounting-record`, { actor: clients.finance });

  const again = await post(`/api/invoices/${invoice.id}/accounting-record`, { actor: clients.finance });
  assert.equal(again.status, 409);

  const { rows } = await deps.pool.query("select count(*)::int as n from finops.accounting_records where invoice_id = $1", [invoice.id]);
  assert.equal(rows[0].n, 1);
});

test("an invoice that is not approved cannot be handed to accounting", async () => {
  const invoice = await upload("B_iban_changed_2499.xml");
  assert.equal(invoice.state, "REVIEW_REQUIRED");

  const res = await post(`/api/invoices/${invoice.id}/accounting-record`, { actor: clients.finance });
  assert.equal(res.status, 409);
  assert.equal((await get(invoice.id)).state, "REVIEW_REQUIRED");
});

test("the accounting export is a CSV of the booked records", async () => {
  const invoice = await approved();
  await post(`/api/invoices/${invoice.id}/accounting-record`, { actor: clients.finance });

  const res = await clients.finance.get("/api/accounting/export");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/csv/);
  const csv = await res.text();
  const [header, ...rows] = csv.trim().split("\n");
  assert.match(header, /document_no/);
  assert.equal(rows.length, 1);
  assert.match(rows[0], /INV-2026-00421/);
  assert.match(rows[0], /1240\.00/);
});

// ---------------------------------------------------------------- payment ---

test("a bookable invoice can be paid, and the payment carries an idempotency key", async () => {
  const invoice = await approved();
  await post(`/api/invoices/${invoice.id}/accounting-record`, { actor: clients.finance });

  const res = await post(`/api/invoices/${invoice.id}/payment`, { actor: clients.finance });
  assert.equal(res.status, 200);
  assert.equal((await get(invoice.id)).state, "PAYMENT_PENDING");

  const { rows } = await deps.pool.query("select * from finops.payment_instructions where invoice_id = $1", [invoice.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "PENDING");
  assert.equal(rows[0].amount, "1240.00");
  assert.equal(rows[0].creditor_iban, "DE89370400440532013000");
  assert.ok(rows[0].idempotency_key);
});

test("a replayed payment instruction does not create a second payment", async () => {
  const invoice = await approved();
  await post(`/api/invoices/${invoice.id}/accounting-record`, { actor: clients.finance });
  await post(`/api/invoices/${invoice.id}/payment`, { actor: clients.finance });

  const again = await post(`/api/invoices/${invoice.id}/payment`, { actor: clients.finance });
  assert.equal(again.status, 409);

  const { rows } = await deps.pool.query("select count(*)::int as n from finops.payment_instructions where invoice_id = $1", [invoice.id]);
  assert.equal(rows[0].n, 1);
});

test("confirming payment marks the invoice paid", async () => {
  const invoice = await approved();
  await post(`/api/invoices/${invoice.id}/accounting-record`, { actor: clients.finance });
  await post(`/api/invoices/${invoice.id}/payment`, { actor: clients.finance });

  const res = await post(`/api/invoices/${invoice.id}/payment/confirm`, { actor: clients.finance, body: { provider_ref: "MOCK-77" } });
  assert.equal(res.status, 200);

  const after = await get(invoice.id);
  assert.equal(after.state, "PAID");
  const { rows } = await deps.pool.query("select status, provider_ref from finops.payment_instructions where invoice_id = $1", [invoice.id]);
  assert.equal(rows[0].status, "EXECUTED");
  assert.equal(rows[0].provider_ref, "MOCK-77");
});

test("a repeated payment confirmation is refused and changes nothing", async () => {
  const invoice = await paid();
  const again = await post(`/api/invoices/${invoice.id}/payment/confirm`, { actor: clients.finance, body: { provider_ref: "MOCK-77" } });
  assert.equal(again.status, 409);
  assert.equal((await get(invoice.id)).state, "PAID");
});

test("payment cannot skip the accounting handoff", async () => {
  const invoice = await approved();
  const res = await post(`/api/invoices/${invoice.id}/payment`, { actor: clients.finance });
  assert.equal(res.status, 409);
  assert.equal((await get(invoice.id)).state, "APPROVED");
});

// --------------------------------------------------------- reconciliation ---

test("importing a statement twice imports each transaction once", async () => {
  const first = await importStatement();
  assert.equal(first.status, 200);
  assert.equal((await first.json()).imported, 4);

  const second = await importStatement();
  assert.equal((await second.json()).imported, 0, "same external ids, nothing new");

  const { rows } = await deps.pool.query("select count(*)::int as n from finops.bank_transactions");
  assert.equal(rows[0].n, 4);
});

test("a payment with a matching reference and amount reconciles the invoice", async () => {
  const invoice = await paid();
  await importStatement();

  const res = await runReconciliation();
  assert.equal(res.status, 200);

  const after = await get(invoice.id);
  assert.equal(after.state, "RECONCILED");
  const { rows } = await deps.pool.query(
    "select status, matched_invoice_id from finops.bank_transactions where external_id = 'TX-2026-09-0001'",
  );
  assert.equal(rows[0].status, "MATCHED");
  assert.equal(rows[0].matched_invoice_id, invoice.id);
});

test("an invoice is not reconciled just because a payment has the same amount", async () => {
  const invoice = await paid("G_clean_380.xml");
  await importStatement();
  await runReconciliation();

  const after = await get(invoice.id);
  assert.notEqual(after.state, "RECONCILED", "TX-0002 is 380.00 but names no invoice");
  const { rows } = await deps.pool.query(
    "select status, matched_invoice_id, match_reason from finops.bank_transactions where external_id = 'TX-2026-09-0002'",
  );
  assert.equal(rows[0].status, "EXCEPTION");
  assert.equal(rows[0].matched_invoice_id, null);
  assert.equal(rows[0].match_reason, "NO_REFERENCE_MATCH");
});

test("a part payment naming the invoice raises an exception on that invoice", async () => {
  const invoice = await paid("G_clean_380.xml");
  await importStatement();
  await runReconciliation();

  const { rows } = await deps.pool.query(
    "select status, matched_invoice_id, match_reason from finops.bank_transactions where external_id = 'TX-2026-09-0003'",
  );
  assert.equal(rows[0].status, "EXCEPTION");
  assert.equal(rows[0].match_reason, "AMOUNT_MISMATCH");
  assert.equal(rows[0].matched_invoice_id, invoice.id);
  assert.equal((await get(invoice.id)).state, "RECONCILIATION_EXCEPTION");
});

test("a transaction matching nothing stays unmatched and touches no invoice", async () => {
  await paid();
  await importStatement();
  await runReconciliation();

  const { rows } = await deps.pool.query(
    "select status, matched_invoice_id from finops.bank_transactions where external_id = 'TX-2026-09-0004'",
  );
  assert.equal(rows[0].status, "UNMATCHED");
  assert.equal(rows[0].matched_invoice_id, null);
});

test("running reconciliation twice does not double-reconcile", async () => {
  const invoice = await paid();
  await importStatement();
  await runReconciliation();
  const eventsAfterFirst = (await get(invoice.id)).audit_events.length;

  const again = await runReconciliation();
  assert.equal(again.status, 200);

  const after = await get(invoice.id);
  assert.equal(after.state, "RECONCILED");
  assert.equal(after.audit_events.length, eventsAfterFirst, "no second reconciliation event");
});

test("a reconciliation exception can be resolved by hand", async () => {
  const invoice = await paid("G_clean_380.xml");
  await importStatement();
  await runReconciliation();
  assert.equal((await get(invoice.id)).state, "RECONCILIATION_EXCEPTION");

  const res = await post(`/api/invoices/${invoice.id}/reconciliation/resolve`, {
    actor: clients.finance,
    body: { comment: "Restbetrag per Gutschrift ausgeglichen" },
  });
  assert.equal(res.status, 200);

  const after = await get(invoice.id);
  assert.equal(after.state, "RECONCILED");
  assert.equal(after.audit_events.at(-1).actor_name, "Jonas Weber");
});

test("resolving a reconciliation exception needs a reason", async () => {
  const invoice = await paid("G_clean_380.xml");
  await importStatement();
  await runReconciliation();

  const res = await post(`/api/invoices/${invoice.id}/reconciliation/resolve`, { actor: clients.finance, body: {} });
  assert.equal(res.status, 400);
  assert.equal((await get(invoice.id)).state, "RECONCILIATION_EXCEPTION");
});

test("the full money path is one unbroken audit chain", async () => {
  const invoice = await paid();
  await importStatement();
  await runReconciliation();

  const after = await get(invoice.id);
  assert.equal(after.state, "RECONCILED");
  assert.deepEqual(
    after.audit_events.map((e) => e.to_state),
    ["RECEIVED", "VALIDATING", "READY_FOR_APPROVAL", "APPROVED", "ACCOUNTING_READY", "PAYMENT_PENDING", "PAID", "RECONCILED"],
  );
  for (const [i, event] of after.audit_events.entries()) {
    if (i === 0) continue;
    assert.equal(event.from_state, after.audit_events[i - 1].to_state, `gap before ${event.action}`);
  }
});
