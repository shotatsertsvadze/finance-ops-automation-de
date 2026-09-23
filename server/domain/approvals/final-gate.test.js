/**
 * Business facts are checked again at the final approval gate.
 *
 * Until now only `payableBlockers` was re-checked there, which covers missing
 * fields and unreadable structure. Business facts were whatever the last
 * validation run said, so a supplier blocked while the invoice waited for a
 * signature was still approved and paid.
 *
 * The hard part is not noticing a failure. It is telling a *new* failure from
 * one a reviewer already looked at and accepted: an invoice released from
 * review still carries the check that sent it there. Refusing on any failure
 * would make review pointless, so the gate compares against what the last run
 * recorded and only stops what has changed for the worse.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../../app.js";
import { loginAs, testDeps } from "../../test-support/db.js";

let deps, server, base, clients;

const fixture = (name) => readFileSync(new URL(`../../../fixtures/xrechnung/${name}`, import.meta.url), "utf8");
const BUEROBEDARF = "10000000-0000-0000-0000-000000000001";

const get = (id) => clients.clerk.get(`/api/invoices/${id}`).then((r) => r.json());

async function upload(name) {
  const res = await clients.clerk.upload(fixture(name), name);
  assert.equal(res.status, 201, `upload ${name}`);
  return res.json();
}

const approve = (id, stepNo, client) => client.post(`/api/invoices/${id}/approvals/${stepNo}/approve`, {});
const pendingStep = async (id) => (await get(id)).approval_steps.find((s) => s.status === "PENDING");

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  clients = {
    clerk: await loginAs(base, "clerk"),
    manager: await loginAs(base, "manager"),
    manager2: await loginAs(base, "manager2"),
    finance: await loginAs(base, "finance"),
  };
});
after(async () => {
  server.close();
  await deps.pool.end();
});
beforeEach(async () => {
  await deps.pool.query("delete from finops.invoices");
  await deps.pool.query("update finops.suppliers set status = 'ACTIVE' where id = $1", [BUEROBEDARF]);
  await deps.pool.query("update finops.supplier_bank_accounts set status = 'ACTIVE' where supplier_id = $1", [BUEROBEDARF]);
});

test("a supplier blocked while the invoice waited is not approved", async () => {
  const invoice = await upload("A_clean_1240.xml");
  assert.equal(invoice.state, "READY_FOR_APPROVAL");

  await deps.pool.query("update finops.suppliers set status = 'BLOCKED' where id = $1", [BUEROBEDARF]);

  const step = await pendingStep(invoice.id);
  const res = await approve(invoice.id, step.step_no, clients.manager);
  assert.notEqual(res.status, 200, "a blocked supplier must not be approved for payment");

  const after = await get(invoice.id);
  assert.notEqual(after.state, "APPROVED");
});

test("the invoice goes back to review, with the new failure recorded", async () => {
  const invoice = await upload("A_clean_1240.xml");
  await deps.pool.query("update finops.suppliers set status = 'BLOCKED' where id = $1", [BUEROBEDARF]);
  const step = await pendingStep(invoice.id);
  await approve(invoice.id, step.step_no, clients.manager);

  const after = await get(invoice.id);
  assert.equal(after.state, "REVIEW_REQUIRED", "a business problem belongs in the review queue");
  assert.equal(after.review_reason, "SUPPLIER_ACTIVE");

  const failed = after.validation.business.filter((c) => c.status === "FAILED").map((c) => c.check_code);
  assert.ok(failed.includes("supplier_active"), `the reason is on the record: ${JSON.stringify(failed)}`);

  const last = after.audit_events.at(-1);
  assert.equal(last.to_state, "REVIEW_REQUIRED");
  assert.equal(last.from_state, "READY_FOR_APPROVAL");
});

test("the pending approval steps are cancelled rather than left waiting", async () => {
  const invoice = await upload("A_clean_1240.xml");
  await deps.pool.query("update finops.suppliers set status = 'BLOCKED' where id = $1", [BUEROBEDARF]);
  const step = await pendingStep(invoice.id);
  await approve(invoice.id, step.step_no, clients.manager);

  const { rows } = await deps.pool.query(
    "select status from finops.approval_steps where invoice_id = $1 order by step_no", [invoice.id],
  );
  assert.ok(rows.length > 0, "the invoice had steps");
  assert.deepEqual([...new Set(rows.map((r) => r.status))], ["CANCELLED"],
    `every step is cancelled, not merely closed: ${JSON.stringify(rows)}`);
});

test("an exception a reviewer already accepted is still approvable", async () => {
  // This is what makes the gate non-trivial. C overruns its order, a human
  // looked at it and released it, and that check still fails. Treating every
  // failure as new would undo the reviewer's decision.
  const invoice = await upload("C_po_overrun_8500.xml");
  assert.equal(invoice.state, "REVIEW_REQUIRED");
  assert.equal(invoice.review_reason, "PO_AMOUNT_WITHIN_TOLERANCE");

  const released = await clients.clerk.post(`/api/invoices/${invoice.id}/review/accept`, {
    comment: "Bestellung wird erhöht",
  });
  assert.equal(released.status, 200);

  for (const client of [clients.manager, clients.finance]) {
    const step = await pendingStep(invoice.id);
    const res = await approve(invoice.id, step.step_no, client);
    assert.equal(res.status, 200, await res.text());
  }
  assert.equal((await get(invoice.id)).state, "APPROVED");
});

test("a clean invoice is unaffected", async () => {
  const invoice = await upload("A_clean_1240.xml");
  const step = await pendingStep(invoice.id);
  assert.equal((await approve(invoice.id, step.step_no, clients.manager)).status, 200);
  assert.equal((await get(invoice.id)).state, "APPROVED");
});

test("a bank account retired while the invoice waited stops the approval", async () => {
  // The IBAN on the document was approved master data when it arrived. Master
  // data moved; the payment would now go to a retired account.
  const invoice = await upload("A_clean_1240.xml");
  await deps.pool.query(
    "update finops.supplier_bank_accounts set status = 'RETIRED' where supplier_id = $1", [BUEROBEDARF],
  );

  const step = await pendingStep(invoice.id);
  await approve(invoice.id, step.step_no, clients.manager);

  const after = await get(invoice.id);
  assert.equal(after.state, "REVIEW_REQUIRED");
  assert.equal(after.review_reason, "SUPPLIER_IBAN_MATCH");
});

test("a rejection is not blocked by a new business failure", async () => {
  // Refusing to pay is always allowed: the gate guards the payable direction.
  const invoice = await upload("A_clean_1240.xml");
  await deps.pool.query("update finops.suppliers set status = 'BLOCKED' where id = $1", [BUEROBEDARF]);

  const step = await pendingStep(invoice.id);
  const res = await clients.manager.post(`/api/invoices/${invoice.id}/approvals/${step.step_no}/reject`, {
    comment: "Lieferant gesperrt, Rechnung abgelehnt",
  });
  assert.equal(res.status, 200, await res.text());
  assert.equal((await get(invoice.id)).state, "REJECTED");
});
