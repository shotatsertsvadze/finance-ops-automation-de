/**
 * Regression tests for control defects found by an independent review of
 * Phases 0-2 and reproduced before fixing. Each test names the finding.
 *
 * The common theme: a legal state edge was treated as sufficient authority to
 * advance. Eligibility of the evidence is a separate concern from whether the
 * transition is allowed.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../../app.js";
import { loginAs, testDeps } from "../../test-support/db.js";
import { loadPolicy } from "../../config/policy.js";

let deps, server, base, clients;

const fixture = (name) => readFileSync(new URL(`../../../fixtures/xrechnung/${name}`, import.meta.url), "utf8");

async function upload(xml, name, client = clients.clerk) {
  const res = await client.upload(xml, name);
  return { status: res.status, body: await res.json().catch(() => null) };
}

const post = (path, client, body) => client.post(path, body);

const get = (id) => clients.clerk.get(`/api/invoices/${id}`).then((r) => r.json());

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

// R01 -----------------------------------------------------------------------

test("R01: a technically invalid invoice cannot be released from review into approval", async () => {
  const { body: invoice } = await upload(fixture("F_malformed.xml"), "F_malformed.xml");
  assert.equal(invoice.state, "REVIEW_REQUIRED");

  const res = await post(`/api/invoices/${invoice.id}/review/accept`, clients.clerk, { comment: "trotzdem freigeben" });
  assert.equal(res.status, 422, "technical invalidity is not an overridable business exception");

  const after = await get(invoice.id);
  assert.equal(after.state, "REVIEW_REQUIRED");
  assert.equal(after.approval_steps.length, 0);
});

test("R01: an invoice without a resolved amount or supplier can never reach a payable state", async () => {
  const { body: invoice } = await upload(fixture("F_malformed.xml"), "F2.xml");
  const res = await post(`/api/invoices/${invoice.id}/review/accept`, clients.clerk, { comment: "x" });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.match(body.error, /Pflichtangaben|nicht freigabefähig/i);
  assert.ok(Array.isArray(body.details?.blockers), "the response names what is missing");
  assert.ok(body.details.blockers.includes("gross_amount"), JSON.stringify(body.details));
});

test("R01: a business exception such as a changed IBAN stays overridable", async () => {
  const { body: invoice } = await upload(fixture("B_iban_changed_2499.xml"), "B.xml");
  assert.equal(invoice.state, "REVIEW_REQUIRED");

  const res = await post(`/api/invoices/${invoice.id}/review/accept`, clients.clerk, { comment: "IBAN bestätigt" });
  assert.equal(res.status, 200, "business exceptions are what review exists for");
  assert.equal((await get(invoice.id)).state, "READY_FOR_APPROVAL");
});

// R06 -----------------------------------------------------------------------

test("R06: an invoice that was ever an exception cannot be auto-approved by re-validation", async () => {
  const { body: invoice } = await upload(fixture("H_small_iban_changed_380.xml"), "H.xml");
  assert.equal(invoice.state, "REVIEW_REQUIRED");

  // Master data corrected: the IBAN is now an approved account.
  await deps.pool.query(
    "insert into finops.supplier_bank_accounts (supplier_id, iban, status) values ($1, 'DE75512108001245126199', 'ACTIVE') on conflict do nothing",
    [invoice.supplier_id],
  );
  const res = await post(`/api/invoices/${invoice.id}/reprocess`, clients.clerk);
  assert.equal(res.status, 200);

  const after = await get(invoice.id);
  assert.equal(after.state, "READY_FOR_APPROVAL", "a corrected exception still needs a human");
  assert.ok(after.approval_steps.length >= 1);
  assert.equal(
    after.audit_events.filter((e) => e.action === "auto_approved").length,
    0,
    "must not silently auto-approve a document that was an exception",
  );
});

test("R06: an invoice that was never an exception still goes straight through", async () => {
  const { body: invoice } = await upload(fixture("G_clean_380.xml"), "G.xml");
  assert.equal(invoice.state, "APPROVED");
  assert.equal(invoice.approval_steps.length, 0);
});

// R02 -----------------------------------------------------------------------

test("R02: duplicate protection survives a reconciliation exception", async () => {
  const { body: first } = await upload(fixture("G_clean_380.xml"), "G.xml");
  // Drive it to a reconciliation exception through the real money path.
  for (const step of ["accounting-record", "payment", "payment/confirm"]) {
    const r = await post(`/api/invoices/${first.id}/${step}`, clients.finance, {});
    assert.equal(r.status, 200, step);
  }
  await post("/api/bank/import", clients.finance, {
    transactions: [{ external_id: "TX-R02", value_date: "2026-09-22", amount: "-350.00", currency: "EUR", reference: "Teilzahlung zu INV-2026-00433" }],
  });
  await post("/api/reconciliation/run", clients.finance, {});
  assert.equal((await get(first.id)).state, "RECONCILIATION_EXCEPTION");

  // A second file for the same supplier and invoice number must not become payable.
  const variant = fixture("G_clean_380.xml").replace("<cbc:DueDate>2026-10-15</cbc:DueDate>", "<cbc:DueDate>2026-10-16</cbc:DueDate>");
  const { body: second } = await upload(variant, "G_variant.xml");
  assert.equal(second.state, "REVIEW_REQUIRED");
  assert.equal(second.review_reason, "DUPLICATE_INVOICE_NUMBER", "the open obligation must still be visible");

  const { rows } = await deps.pool.query(
    `select count(*)::int as n from finops.invoices
     where invoice_number = 'INV-2026-00433'
       and state in ('APPROVED','ACCOUNTING_READY','PAYMENT_PENDING','PAID','RECONCILED','RECONCILIATION_EXCEPTION')`,
  );
  assert.equal(rows[0].n, 1, "only one payable record for this supplier invoice number");
});

// R05 -----------------------------------------------------------------------

test("R05: an impossible calendar date fails closed instead of erroring", async () => {
  const xml = fixture("G_clean_380.xml")
    .replace("<cbc:ID>INV-2026-00433</cbc:ID>", "<cbc:ID>INV-R05-A</cbc:ID>")
    .replace("<cbc:IssueDate>2026-09-15</cbc:IssueDate>", "<cbc:IssueDate>2026-02-30</cbc:IssueDate>");
  const res = await upload(xml, "bad-date.xml");

  assert.equal(res.status, 201, "a bad date is invalid input, not a server fault");
  assert.equal(res.body.state, "REVIEW_REQUIRED");
  const failed = res.body.validation.technical.filter((c) => c.status === "FAILED").map((c) => c.check_code);
  assert.ok(failed.includes("dates_valid"), `expected dates_valid to fail, got ${failed}`);
});

test("R05: an unparseable date is not silently dropped and approved", async () => {
  const xml = fixture("G_clean_380.xml")
    .replace("<cbc:ID>INV-2026-00433</cbc:ID>", "<cbc:ID>INV-R05-B</cbc:ID>")
    .replace("<cbc:IssueDate>2026-09-15</cbc:IssueDate>", "<cbc:IssueDate>not-a-date</cbc:IssueDate>");
  const res = await upload(xml, "no-date.xml");

  assert.notEqual(res.body.state, "APPROVED", "an invoice with no usable issue date must not be approved");
  assert.equal(res.body.state, "REVIEW_REQUIRED");
});

// R03 -----------------------------------------------------------------------

test("R03: line totals that contradict the net amount are caught", async () => {
  // Internally consistent header (100 + 19 = 119) while LineExtensionAmount and
  // the lines both still say 319.33. Every existing pairwise check passes; only
  // comparing the line sum to the tax-exclusive amount catches it.
  const xml = fixture("G_clean_380.xml")
    .replace("<cbc:ID>INV-2026-00433</cbc:ID>", "<cbc:ID>INV-R03-A</cbc:ID>")
    .replace('<cbc:TaxExclusiveAmount currencyID="EUR">319.33</cbc:TaxExclusiveAmount>', '<cbc:TaxExclusiveAmount currencyID="EUR">100.00</cbc:TaxExclusiveAmount>')
    .replace('<cbc:TaxAmount currencyID="EUR">60.67</cbc:TaxAmount>', '<cbc:TaxAmount currencyID="EUR">19.00</cbc:TaxAmount>')
    .replace('<cbc:TaxInclusiveAmount currencyID="EUR">380.00</cbc:TaxInclusiveAmount>', '<cbc:TaxInclusiveAmount currencyID="EUR">119.00</cbc:TaxInclusiveAmount>')
    .replace('<cbc:PayableAmount currencyID="EUR">380.00</cbc:PayableAmount>', '<cbc:PayableAmount currencyID="EUR">119.00</cbc:PayableAmount>');
  const res = await upload(xml, "r03a.xml");

  assert.notEqual(res.body.state, "APPROVED");
  const failed = [...res.body.validation.technical, ...res.body.validation.business]
    .filter((c) => c.status === "FAILED").map((c) => c.check_code);
  assert.ok(failed.includes("totals_consistent"), `expected totals_consistent to fail, got ${failed}`);
});

test("R03: an unreadable unit price is not approved", async () => {
  const xml = fixture("G_clean_380.xml")
    .replace("<cbc:ID>INV-2026-00433</cbc:ID>", "<cbc:ID>INV-R03-B</cbc:ID>")
    .replace('<cbc:PriceAmount currencyID="EUR">4.99</cbc:PriceAmount>', '<cbc:PriceAmount currencyID="EUR">not-a-price</cbc:PriceAmount>');
  const res = await upload(xml, "r03b.xml");

  assert.notEqual(res.body.state, "APPROVED", "a line we cannot read is not a line we can pay");
});

// R04 -----------------------------------------------------------------------

test("R04: an invoice addressed to another company is not approved", async () => {
  const xml = fixture("G_clean_380.xml")
    .replace("<cbc:ID>INV-2026-00433</cbc:ID>", "<cbc:ID>INV-R04-A</cbc:ID>")
    .replaceAll("Nordwerk GmbH", "Fremdfirma AG")
    .replace("DE999999999", "DE111222333");
  const res = await upload(xml, "r04a.xml");

  assert.notEqual(res.body.state, "APPROVED");
  const failed = res.body.validation.business.filter((c) => c.status === "FAILED").map((c) => c.check_code);
  assert.ok(failed.includes("buyer_is_us"), `expected buyer_is_us to fail, got ${failed}`);
});

test("R04: a VAT id that matches no supplier is not quietly resolved by name", async () => {
  const xml = fixture("G_clean_380.xml")
    .replace("<cbc:ID>INV-2026-00433</cbc:ID>", "<cbc:ID>INV-R04-B</cbc:ID>")
    .replace("DE123456789", "DE999000111");
  const res = await upload(xml, "r04b.xml");

  assert.notEqual(res.body.state, "APPROVED", "a conflicting tax id is a reason to look, not to guess");
  const check = res.body.validation.business.find((c) => c.check_code === "supplier_known");
  assert.equal(check.status, "FAILED");
});

// R09 -----------------------------------------------------------------------

test("R09: invalid policy configuration is rejected instead of silently weakening approvals", () => {
  assert.throws(() => loadPolicy({ POLICY_TIER_1_LIMIT: "bad" }), /POLICY_TIER_1_LIMIT/);
  assert.throws(() => loadPolicy({ POLICY_AUTO_APPROVE_LIMIT: "" , POLICY_TIER_2_LIMIT: "not-a-number" }), /POLICY_TIER_2_LIMIT/);
});

test("R09: thresholds that are out of order are rejected", () => {
  assert.throws(() => loadPolicy({ POLICY_TIER_1_LIMIT: "30000", POLICY_TIER_2_LIMIT: "5000" }), /Reihenfolge|order/i);
});

test("R04: a buyer name that contradicts a matching tax id is still caught", async () => {
  // The tax id is ours, the name is someone else's. One agreeing identifier
  // must not excuse a contradicting one.
  const xml = fixture("G_clean_380.xml")
    .replace("<cbc:ID>INV-2026-00433</cbc:ID>", "<cbc:ID>INV-R04-C</cbc:ID>")
    .replaceAll("Nordwerk GmbH", "Fremdfirma AG");
  const res = await upload(xml, "r04c.xml");

  assert.notEqual(res.body.state, "APPROVED");
  const check = res.body.validation.business.find((c) => c.check_code === "buyer_is_us");
  assert.equal(check.status, "FAILED");
  assert.match(check.actual, /Fremdfirma AG/);
});
