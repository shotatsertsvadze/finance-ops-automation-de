/**
 * Operational KPIs.
 *
 * Every figure is computed from the invoices and audit events themselves, so
 * the dashboard cannot drift from the process. The tests build a known
 * population through the real pipeline and assert the arithmetic.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../../app.js";
import { loginAs, testDeps } from "../../test-support/db.js";
import { computeKpis } from "./kpi.js";

let deps, server, base, clients;

const fixture = (name) => readFileSync(new URL(`../../../fixtures/xrechnung/${name}`, import.meta.url), "utf8");

async function upload(xml, name, client = clients.clerk) {
  const res = await client.upload(xml, name);
  return res.json();
}
const post = (path, client, body) => client.post(path, body);

const kpis = () => computeKpis(deps);

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

test("an empty system reports zeros rather than dividing by zero", async () => {
  const k = await kpis();
  assert.equal(k.volume.received, 0);
  assert.equal(k.automation.straight_through, 0);
  assert.equal(k.automation.stp_rate, 0);
  assert.equal(k.exceptions.rate, 0);
  assert.equal(k.economics.hours_saved, 0);
});

test("straight-through and exception rates are counted per invoice", async () => {
  await upload(fixture("G_clean_380.xml"), "G.xml"); // auto-approved
  await upload(fixture("A_clean_1240.xml"), "A.xml"); // needs approval, no exception
  await upload(fixture("B_iban_changed_2499.xml"), "B.xml"); // exception
  await upload(fixture("C_po_overrun_8500.xml"), "C.xml"); // exception

  const k = await kpis();
  assert.equal(k.volume.received, 4);
  assert.equal(k.volume.processed, 4);
  assert.equal(k.automation.straight_through, 1, "only G went straight through");
  assert.equal(k.automation.stp_rate, 0.25);
  assert.equal(k.exceptions.count, 2, "B and C");
  assert.equal(k.exceptions.rate, 0.5);
  assert.equal(k.automation.manual_touch, 3);
});

test("duplicates are reported separately and never counted as processed volume", async () => {
  await upload(fixture("A_clean_1240.xml"), "A.xml");
  await upload(fixture("A_clean_1240.xml"), "A-again.xml"); // identical file

  const k = await kpis();
  assert.equal(k.volume.received, 2);
  assert.equal(k.volume.processed, 1, "a duplicate is not a processed invoice");
  assert.equal(k.volume.duplicates, 1);
  assert.equal(k.risk.duplicate_attempts, 1);
});

test("risk signals count the invoices that raised them", async () => {
  await upload(fixture("B_iban_changed_2499.xml"), "B.xml");
  await upload(fixture("C_po_overrun_8500.xml"), "C.xml");

  const k = await kpis();
  assert.equal(k.risk.iban_alerts, 1);
  assert.equal(k.risk.po_mismatches, 1);
});

test("exception reasons are ranked with the biggest first", async () => {
  await upload(fixture("B_iban_changed_2499.xml"), "B.xml");
  await upload(fixture("C_po_overrun_8500.xml"), "C1.xml");
  const c2 = fixture("C_po_overrun_8500.xml").replace("<cbc:ID>SIT-2026-0918</cbc:ID>", "<cbc:ID>SIT-2026-0919</cbc:ID>");
  await upload(c2, "C2.xml");

  const k = await kpis();
  assert.equal(k.exceptions.by_reason[0].reason, "PO_AMOUNT_WITHIN_TOLERANCE");
  assert.equal(k.exceptions.by_reason[0].count, 2);
  assert.equal(k.exceptions.by_reason[1].reason, "SUPPLIER_IBAN_MATCH");
  assert.equal(k.exceptions.by_reason[1].count, 1);
});

test("workload counts what is waiting for a person right now", async () => {
  await upload(fixture("A_clean_1240.xml"), "A.xml"); // awaiting approval
  await upload(fixture("B_iban_changed_2499.xml"), "B.xml"); // awaiting review

  const k = await kpis();
  assert.equal(k.workload.awaiting_approval, 1);
  assert.equal(k.workload.awaiting_review, 1);
});

test("approval time is measured from release to approval", async () => {
  const invoice = await upload(fixture("A_clean_1240.xml"), "A.xml");
  await post(`/api/invoices/${invoice.id}/approvals/1/approve`, clients.manager, {});

  const k = await kpis();
  assert.equal(k.cycle.approved_count, 1);
  assert.ok(k.cycle.median_approval_hours !== null, "an approved invoice yields an approval time");
  assert.ok(k.cycle.median_approval_hours >= 0);
});

test("cycle times are null, not zero, when nothing has reached that stage", async () => {
  await upload(fixture("B_iban_changed_2499.xml"), "B.xml");
  const k = await kpis();
  assert.equal(k.cycle.approved_count, 0);
  assert.equal(k.cycle.median_approval_hours, null, "no data is not the same as instant");
  assert.equal(k.cycle.median_processing_hours, null);
});

test("the savings estimate is derived from the stated assumptions and the real volume", async () => {
  await upload(fixture("G_clean_380.xml"), "G.xml");
  await upload(fixture("B_iban_changed_2499.xml"), "B.xml");

  const k = await kpis();
  const a = k.economics.assumptions;
  const clean = k.volume.processed - k.exceptions.count; // 1
  const expected =
    (clean * (a.manual_minutes_clean - a.system_minutes_clean) +
      k.exceptions.count * (a.manual_minutes_exception - a.system_minutes_exception)) / 60;

  assert.equal(k.economics.hours_saved, Math.round(expected * 10) / 10);
  assert.equal(k.economics.cost_saved_eur, Math.round(expected * a.hourly_cost_eur));
  assert.ok(a.source, "the assumptions say where they come from");
});

test("the API serves the same figures", async () => {
  await upload(fixture("G_clean_380.xml"), "G.xml");
  const res = await clients.clerk.get("/api/dashboard/kpis");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.volume.received, 1);
  assert.equal(body.automation.straight_through, 1);
  assert.ok(body.generated_at);
});

test("processing time is reported separately for the path a human touched", async () => {
  const auto = await upload(fixture("G_clean_380.xml"), "G.xml");
  assert.equal(auto.state, "APPROVED");
  const manual = await upload(fixture("A_clean_1240.xml"), "A.xml");
  await post(`/api/invoices/${manual.id}/approvals/1/approve`, clients.manager, {});

  const k = await kpis();
  assert.equal(k.cycle.approved_count, 2);
  assert.ok(k.cycle.median_processing_hours_touched !== null, "the touched path has its own median");
  assert.equal(k.cycle.median_processing_hours_touched >= 0, true);
});

test("review dwell time is measured from entering review to release", async () => {
  const invoice = await upload(fixture("C_po_overrun_8500.xml"), "C.xml");
  assert.equal(invoice.state, "REVIEW_REQUIRED");
  await post(`/api/invoices/${invoice.id}/review/accept`, clients.clerk, { comment: "geklärt" });

  const k = await kpis();
  assert.ok(k.cycle.median_review_hours !== null, "a released exception yields a dwell time");
  assert.ok(k.cycle.median_review_hours >= 0);
});

// --- pairing review visits, and what "overdue" means -----------------------

test("a review visit that follows a returned question does not produce a negative median", async () => {
  // READY_FOR_APPROVAL -> INFO_REQUESTED -> REVIEW_REQUIRED puts an approval
  // entry before a review entry. Subtracting the first of each gave -1 hours.
  const invoice = await upload(fixture("A_clean_1240.xml"), "A_clean_1240.xml");
  assert.equal(invoice.state, "READY_FOR_APPROVAL");

  await post(`/api/invoices/${invoice.id}/review/request-info`, clients.clerk, { comment: "Rückfrage zur Bestellung" });
  await post(`/api/invoices/${invoice.id}/info-received`, clients.clerk, { comment: "beantwortet" });

  // Representative times: released two hours ago, the review visit began one
  // hour ago and is still open.
  await deps.pool.query(
    `update finops.audit_events set occurred_at = now() - interval '2 hours'
     where invoice_id = $1 and to_state = 'READY_FOR_APPROVAL'`, [invoice.id]);
  await deps.pool.query(
    `update finops.audit_events set occurred_at = now() - interval '1 hour'
     where invoice_id = $1 and to_state = 'REVIEW_REQUIRED'`, [invoice.id]);

  const { cycle } = await kpis();
  assert.ok(cycle.median_review_hours === null || cycle.median_review_hours >= 0,
    `a duration cannot be negative, got ${cycle.median_review_hours}`);
});

test("a review visit still open contributes no duration", async () => {
  const invoice = await upload(fixture("B_iban_changed_2499.xml"), "B_iban_changed_2499.xml");
  assert.equal(invoice.state, "REVIEW_REQUIRED");

  const { cycle } = await kpis();
  assert.equal(cycle.median_review_hours, null, "nothing has left review yet");
});

test("a finished review visit is measured from its own entry", async () => {
  const invoice = await upload(fixture("B_iban_changed_2499.xml"), "B_iban_changed_2499.xml");
  await deps.pool.query(
    `update finops.audit_events set occurred_at = now() - interval '3 hours'
     where invoice_id = $1 and to_state = 'REVIEW_REQUIRED'`, [invoice.id]);
  await post(`/api/invoices/${invoice.id}/review/accept`, clients.clerk, { comment: "IBAN bestätigt" });

  const { cycle } = await kpis();
  assert.ok(cycle.median_review_hours >= 2.9 && cycle.median_review_hours <= 3.1,
    `about three hours, got ${cycle.median_review_hours}`);
});

test("an invoice that has been paid is not overdue, even with an unclear reconciliation", async () => {
  const invoice = await upload(fixture("G_clean_380.xml"), "G_clean_380.xml");
  assert.equal(invoice.state, "APPROVED");
  for (const stage of ["accounting-record", "payment", "payment/confirm"]) {
    const res = await post(`/api/invoices/${invoice.id}/${stage}`, clients.finance, {});
    assert.equal(res.status, 200, stage);
  }
  // Long overdue on paper, and its reconciliation never came out clean.
  await deps.pool.query("update finops.invoices set due_date = current_date - 30 where id = $1", [invoice.id]);
  await deps.pool.query("update finops.invoices set state = 'RECONCILIATION_EXCEPTION' where id = $1", [invoice.id]);

  const { workload } = await kpis();
  assert.equal(workload.overdue, 0, "the supplier has their money; this is bookkeeping work");
  assert.equal(workload.due_within_7_days, 0);
  assert.equal(workload.reconciliation_exceptions, 1, "and it is counted where it belongs");
});

test("no settled document is overdue, whichever way it was settled", async () => {
  // Credited and offset against credits are settled as much as paid is. Set
  // directly, as above: the question is only how the figure reads the state.
  const invoice = await upload(fixture("A_clean_1240.xml"), "A_clean_1240.xml");
  await deps.pool.query("update finops.invoices set due_date = current_date - 30 where id = $1", [invoice.id]);
  for (const state of ["CREDITED", "SETTLED_BY_CREDIT"]) {
    await deps.pool.query("update finops.invoices set state = $2 where id = $1", [invoice.id, state]);
    const { workload } = await kpis();
    assert.equal(workload.overdue, 0, state);
    assert.equal(workload.due_within_7_days, 0, state);
  }
});

test("an unpaid invoice past its due date is still overdue", async () => {
  const invoice = await upload(fixture("A_clean_1240.xml"), "A_clean_1240.xml");
  await deps.pool.query("update finops.invoices set due_date = current_date - 5 where id = $1", [invoice.id]);

  const { workload } = await kpis();
  assert.equal(workload.overdue, 1, "the control must still fire for money actually owed");
});
