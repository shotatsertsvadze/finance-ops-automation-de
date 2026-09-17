/**
 * Phase 2: review decisions and the approval workflow.
 *
 * Driven over real HTTP against the real app and database, because the point
 * of these rules is that a direct API call cannot bypass them. A test that
 * called the domain functions directly would prove less.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../../app.js";
import { testDeps, USERS } from "../../test-support/db.js";

let deps, server, base;

const fixture = (name) => readFileSync(new URL(`../../../fixtures/xrechnung/${name}`, import.meta.url));

async function upload(name) {
  const form = new FormData();
  form.append("file", new Blob([fixture(name)], { type: "application/xml" }), name);
  const res = await fetch(`${base}/api/invoices`, { method: "POST", body: form });
  assert.equal(res.status, 201, `upload ${name}`);
  return res.json();
}

const post = (path, { actor, body } = {}) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(actor ? { "x-actor-id": actor } : {}) },
    body: JSON.stringify(body ?? {}),
  });

const get = (id) => fetch(`${base}/api/invoices/${id}`).then((r) => r.json());

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await deps.pool.end();
});

beforeEach(async () => {
  await deps.pool.query("delete from finops.invoices");
});

// ---------------------------------------------------------------- review ---

test("accepting a review moves the invoice to approval and records who accepted", async () => {
  const invoice = await upload("B_iban_changed_2499.xml");
  assert.equal(invoice.state, "REVIEW_REQUIRED");

  const res = await post(`/api/invoices/${invoice.id}/review/accept`, {
    actor: USERS.clerk,
    body: { comment: "IBAN telefonisch beim Lieferanten bestätigt" },
  });
  assert.equal(res.status, 200);

  const after = await get(invoice.id);
  assert.equal(after.state, "READY_FOR_APPROVAL");
  assert.equal(after.review_reason, null);
  assert.deepEqual(after.approval_steps.map((s) => [s.required_role, s.status]), [["MANAGER", "PENDING"]]);
  const event = after.audit_events.at(-1);
  assert.equal(event.action, "review_accepted");
  assert.equal(event.actor_type, "HUMAN");
  assert.equal(event.actor_name, "Anna Berger");
  assert.equal(event.reason, "IBAN telefonisch beim Lieferanten bestätigt");
});

test("a review of a small invoice still requires one approval, never straight-through", async () => {
  const invoice = await upload("H_small_iban_changed_380.xml");
  assert.equal(invoice.state, "REVIEW_REQUIRED");
  assert.equal(invoice.gross_amount, "380.00", "below the auto-approve limit");

  await post(`/api/invoices/${invoice.id}/review/accept`, { actor: USERS.clerk, body: { comment: "geprüft" } });

  const after = await get(invoice.id);
  assert.equal(after.state, "READY_FOR_APPROVAL", "must not jump to APPROVED");
  assert.deepEqual(after.approval_steps.map((s) => s.required_role), ["MANAGER"]);
});

test("a review decision without an actor is refused", async () => {
  const invoice = await upload("B_iban_changed_2499.xml");
  const res = await post(`/api/invoices/${invoice.id}/review/accept`, { body: { comment: "x" } });
  assert.equal(res.status, 400);
  assert.equal((await get(invoice.id)).state, "REVIEW_REQUIRED");
});

test("rejecting a review needs a reason and ends the invoice", async () => {
  const invoice = await upload("B_iban_changed_2499.xml");

  const noReason = await post(`/api/invoices/${invoice.id}/review/reject`, { actor: USERS.clerk, body: {} });
  assert.equal(noReason.status, 400);
  assert.equal((await get(invoice.id)).state, "REVIEW_REQUIRED", "refused request changed nothing");

  const res = await post(`/api/invoices/${invoice.id}/review/reject`, {
    actor: USERS.clerk,
    body: { comment: "Lieferant hat Gutschrift angekündigt" },
  });
  assert.equal(res.status, 200);
  assert.equal((await get(invoice.id)).state, "REJECTED");
});

test("requesting information parks the invoice and it returns to review", async () => {
  const invoice = await upload("C_po_overrun_8500.xml");

  await post(`/api/invoices/${invoice.id}/review/request-info`, {
    actor: USERS.clerk,
    body: { comment: "Bestellung erhöhen oder Rechnung korrigieren" },
  });
  assert.equal((await get(invoice.id)).state, "INFO_REQUESTED");

  const res = await post(`/api/invoices/${invoice.id}/info-received`, {
    actor: USERS.clerk,
    body: { comment: "Korrigierte Bestellung liegt vor" },
  });
  assert.equal(res.status, 200);
  assert.equal((await get(invoice.id)).state, "REVIEW_REQUIRED");
});

test("confirming a duplicate ends the invoice without a payable record", async () => {
  await upload("A_clean_1240.xml"); // the original this one collides with
  const invoice = await upload("D_duplicate_number_1240.xml");
  assert.equal(invoice.state, "REVIEW_REQUIRED");
  assert.equal(invoice.review_reason, "DUPLICATE_INVOICE_NUMBER");

  const res = await post(`/api/invoices/${invoice.id}/review/confirm-duplicate`, {
    actor: USERS.clerk,
    body: { comment: "Gleiche Rechnung kam bereits per Portal" },
  });
  assert.equal(res.status, 200);
  assert.equal((await get(invoice.id)).state, "DUPLICATE");
});

test("a review decision on an invoice that is not in review is refused", async () => {
  const invoice = await upload("A_clean_1240.xml");
  assert.equal(invoice.state, "READY_FOR_APPROVAL");

  const res = await post(`/api/invoices/${invoice.id}/review/accept`, { actor: USERS.clerk, body: { comment: "x" } });
  assert.equal(res.status, 409);
  assert.equal((await get(invoice.id)).state, "READY_FOR_APPROVAL");
});

// -------------------------------------------------------------- approvals ---

test("approving the only step approves the invoice", async () => {
  const invoice = await upload("A_clean_1240.xml");

  const res = await post(`/api/invoices/${invoice.id}/approvals/1/approve`, { actor: USERS.manager, body: {} });
  assert.equal(res.status, 200);

  const after = await get(invoice.id);
  assert.equal(after.state, "APPROVED");
  assert.equal(after.approval_steps[0].status, "APPROVED");
  assert.equal(after.approval_steps[0].actor_name, "Tim Kessler");
  assert.ok(after.approval_steps[0].decided_at);
  assert.equal(after.audit_events.at(-1).action, "approved");
});

test("a multi-step invoice is only approved after the last step", async () => {
  const invoice = await upload("E_high_value_30000.xml");
  assert.deepEqual(invoice.approval_steps.map((s) => s.required_role), ["MANAGER", "FINANCE", "CFO"]);

  await post(`/api/invoices/${invoice.id}/approvals/1/approve`, { actor: USERS.manager, body: {} });
  assert.equal((await get(invoice.id)).state, "READY_FOR_APPROVAL");

  await post(`/api/invoices/${invoice.id}/approvals/2/approve`, { actor: USERS.finance, body: {} });
  assert.equal((await get(invoice.id)).state, "READY_FOR_APPROVAL");

  const last = await post(`/api/invoices/${invoice.id}/approvals/3/approve`, { actor: USERS.cfo, body: {} });
  assert.equal(last.status, 200);
  assert.equal((await get(invoice.id)).state, "APPROVED");
});

test("an approver whose role does not match the step is refused", async () => {
  const invoice = await upload("E_high_value_30000.xml");

  const res = await post(`/api/invoices/${invoice.id}/approvals/1/approve`, { actor: USERS.finance, body: {} });
  assert.equal(res.status, 403);
  assert.equal((await get(invoice.id)).approval_steps[0].status, "PENDING");
});

test("steps must be decided in order", async () => {
  const invoice = await upload("E_high_value_30000.xml");

  const res = await post(`/api/invoices/${invoice.id}/approvals/2/approve`, { actor: USERS.finance, body: {} });
  assert.equal(res.status, 409);
  assert.equal((await get(invoice.id)).approval_steps[1].status, "PENDING");
});

test("an already-decided step cannot be decided again", async () => {
  const invoice = await upload("A_clean_1240.xml");
  await post(`/api/invoices/${invoice.id}/approvals/1/approve`, { actor: USERS.manager, body: {} });

  const res = await post(`/api/invoices/${invoice.id}/approvals/1/approve`, { actor: USERS.manager2, body: {} });
  assert.equal(res.status, 409);
});

test("one actor cannot satisfy two approval steps of the same invoice", async () => {
  const invoice = await upload("A_clean_1240.xml");
  // A second MANAGER step, as a stricter policy would produce. The guard must
  // hold on identity, not on the roles happening to differ.
  await deps.pool.query(
    "insert into finops.approval_steps (invoice_id, step_no, required_role) values ($1, 2, 'MANAGER')",
    [invoice.id],
  );

  const first = await post(`/api/invoices/${invoice.id}/approvals/1/approve`, { actor: USERS.manager, body: {} });
  assert.equal(first.status, 200);

  const second = await post(`/api/invoices/${invoice.id}/approvals/2/approve`, { actor: USERS.manager, body: {} });
  assert.equal(second.status, 409);

  const after = await get(invoice.id);
  assert.equal(after.approval_steps[1].status, "PENDING");
  assert.equal(after.state, "READY_FOR_APPROVAL", "invoice must not be approved by one person alone");

  const other = await post(`/api/invoices/${invoice.id}/approvals/2/approve`, { actor: USERS.manager2, body: {} });
  assert.equal(other.status, 200);
  assert.equal((await get(invoice.id)).state, "APPROVED");
});

test("whoever released an invoice from review cannot also approve it", async () => {
  const invoice = await upload("B_iban_changed_2499.xml");
  await post(`/api/invoices/${invoice.id}/review/accept`, { actor: USERS.manager, body: { comment: "geklärt" } });

  const self = await post(`/api/invoices/${invoice.id}/approvals/1/approve`, { actor: USERS.manager, body: {} });
  assert.equal(self.status, 409);
  assert.equal((await get(invoice.id)).state, "READY_FOR_APPROVAL");

  const other = await post(`/api/invoices/${invoice.id}/approvals/1/approve`, { actor: USERS.manager2, body: {} });
  assert.equal(other.status, 200);
  assert.equal((await get(invoice.id)).state, "APPROVED");
});

test("rejecting a step needs a reason, ends the invoice and cancels the remaining steps", async () => {
  const invoice = await upload("E_high_value_30000.xml");

  const noReason = await post(`/api/invoices/${invoice.id}/approvals/1/reject`, { actor: USERS.manager, body: {} });
  assert.equal(noReason.status, 400);

  const res = await post(`/api/invoices/${invoice.id}/approvals/1/reject`, {
    actor: USERS.manager,
    body: { comment: "Leistung wurde nie erbracht" },
  });
  assert.equal(res.status, 200);

  const after = await get(invoice.id);
  assert.equal(after.state, "REJECTED");
  assert.deepEqual(after.approval_steps.map((s) => s.status), ["REJECTED", "CANCELLED", "CANCELLED"]);
});

test("a rejected invoice cannot be approved afterwards", async () => {
  const invoice = await upload("A_clean_1240.xml");
  await post(`/api/invoices/${invoice.id}/approvals/1/reject`, { actor: USERS.manager, body: { comment: "falsch" } });

  const res = await post(`/api/invoices/${invoice.id}/approvals/1/approve`, { actor: USERS.manager2, body: {} });
  assert.equal(res.status, 409);
  assert.equal((await get(invoice.id)).state, "REJECTED");
});

test("an approved invoice cannot be approved again", async () => {
  const invoice = await upload("A_clean_1240.xml");
  await post(`/api/invoices/${invoice.id}/approvals/1/approve`, { actor: USERS.manager, body: {} });

  const res = await post(`/api/invoices/${invoice.id}/approvals/1/approve`, { actor: USERS.manager2, body: {} });
  assert.equal(res.status, 409);
});

test("an unknown step number is a 404 from the handler, not a missing route", async () => {
  const invoice = await upload("A_clean_1240.xml");
  const res = await post(`/api/invoices/${invoice.id}/approvals/7/approve`, { actor: USERS.manager, body: {} });
  assert.equal(res.status, 404);
  // Asserting the body keeps this from passing merely because the route is absent.
  assert.match((await res.json()).error, /Freigabeschritt/);
});

test("requesting information cancels approvals already given", async () => {
  const invoice = await upload("E_high_value_30000.xml");
  await post(`/api/invoices/${invoice.id}/approvals/1/approve`, { actor: USERS.manager, body: {} });
  assert.equal((await get(invoice.id)).approval_steps[0].status, "APPROVED");

  const res = await post(`/api/invoices/${invoice.id}/review/request-info`, {
    actor: USERS.clerk,
    body: { comment: "Lieferschein fehlt" },
  });
  assert.equal(res.status, 200);

  const after = await get(invoice.id);
  assert.equal(after.state, "INFO_REQUESTED");
  assert.ok(
    after.approval_steps.every((s) => s.status === "CANCELLED"),
    `a previously given approval must not survive: ${JSON.stringify(after.approval_steps.map((s) => s.status))}`,
  );
});

test("an approval given before a correction cannot be inherited after re-validation", async () => {
  const invoice = await upload("E_high_value_30000.xml");
  await post(`/api/invoices/${invoice.id}/approvals/1/approve`, { actor: USERS.manager, body: {} });

  await post(`/api/invoices/${invoice.id}/review/request-info`, { actor: USERS.clerk, body: { comment: "Lieferschein fehlt" } });
  await post(`/api/invoices/${invoice.id}/info-received`, { actor: USERS.clerk, body: { comment: "liegt vor" } });
  const revalidated = await post(`/api/invoices/${invoice.id}/reprocess`, { actor: USERS.clerk });
  assert.equal(revalidated.status, 200);

  const after = await get(invoice.id);
  assert.equal(after.state, "READY_FOR_APPROVAL");
  assert.ok(
    after.approval_steps.every((s) => s.status === "PENDING"),
    `every step must start again: ${JSON.stringify(after.approval_steps.map((s) => [s.step_no, s.status]))}`,
  );
  assert.ok(after.approval_steps.every((s) => s.actor_id === null), "no approver carried over");
});
