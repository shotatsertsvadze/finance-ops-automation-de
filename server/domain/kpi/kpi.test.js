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
import { testDeps, USERS } from "../../test-support/db.js";
import { computeKpis } from "./kpi.js";

let deps, server, base;

const fixture = (name) => readFileSync(new URL(`../../../fixtures/xrechnung/${name}`, import.meta.url), "utf8");

async function upload(xml, name) {
  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), name);
  const res = await fetch(`${base}/api/invoices`, { method: "POST", body: form });
  return res.json();
}
const post = (path, actor, body) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(actor ? { "x-actor-id": actor } : {}) },
    body: JSON.stringify(body ?? {}),
  });

const kpis = () => computeKpis(deps);

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
  await post(`/api/invoices/${invoice.id}/approvals/1/approve`, USERS.manager, {});

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
  const res = await fetch(`${base}/api/dashboard/kpis`);
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
  await post(`/api/invoices/${manual.id}/approvals/1/approve`, USERS.manager, {});

  const k = await kpis();
  assert.equal(k.cycle.approved_count, 2);
  assert.ok(k.cycle.median_processing_hours_touched !== null, "the touched path has its own median");
  assert.equal(k.cycle.median_processing_hours_touched >= 0, true);
});

test("review dwell time is measured from entering review to release", async () => {
  const invoice = await upload(fixture("B_iban_changed_2499.xml"), "B.xml");
  assert.equal(invoice.state, "REVIEW_REQUIRED");
  await post(`/api/invoices/${invoice.id}/review/accept`, USERS.clerk, { comment: "geklärt" });

  const k = await kpis();
  assert.ok(k.cycle.median_review_hours !== null, "a released exception yields a dwell time");
  assert.ok(k.cycle.median_review_hours >= 0);
});
