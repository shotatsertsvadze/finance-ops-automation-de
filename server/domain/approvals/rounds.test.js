/**
 * Approval rounds (ADR-067). Releasing an invoice from review deleted every
 * approval step, and re-validation deleted cancelled ones, so who had signed
 * what in an earlier round survived only in the audit log.
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
  for (const key of ["clerk", "manager", "manager2", "finance"]) clients[key] = await loginAs(base, key);
});
after(async () => {
  server.close();
  await deps.pool.end();
});
beforeEach(async () => {
  await deps.pool.query("delete from finops.invoices");
});

const get = (id) => clients.finance.get(`/api/invoices/${id}`).then((r) => r.json());

/** E: three steps. Step 1 signed, then questioned, answered and released again. */
async function secondRound() {
  const invoice = await (await clients.clerk.upload(fixture("E_high_value_30000.xml"), "E.xml")).json();
  assert.equal((await clients.manager.post(`/api/invoices/${invoice.id}/approvals/1/approve`, {})).status, 200);
  assert.equal((await clients.finance.post(`/api/invoices/${invoice.id}/review/request-info`, { comment: "Lieferschein fehlt" })).status, 200);
  assert.equal((await clients.clerk.post(`/api/invoices/${invoice.id}/info-received`, { comment: "nachgereicht" })).status, 200);
  assert.equal((await clients.clerk.post(`/api/invoices/${invoice.id}/review/accept`, { comment: "geklärt" })).status, 200);
  return invoice;
}

test("a new round keeps the steps of the round before it", async () => {
  const invoice = await secondRound();
  const { rows } = await deps.pool.query(
    "select round, step_no, status, actor_id is not null as signed from finops.approval_steps where invoice_id = $1 order by round, step_no",
    [invoice.id],
  );
  const firstRound = rows.filter((r) => r.round === 1);
  assert.equal(firstRound.length, 3, "the first round is still there");
  assert.ok(firstRound.every((r) => r.status === "CANCELLED"));
  assert.equal(firstRound[0].signed, true, "with who had signed step 1");
  assert.ok(rows.some((r) => r.round === 2 && r.status === "PENDING"));
});

test("the detail shows the current round, and the earlier ones as history", async () => {
  const invoice = await secondRound();
  const detail = await get(invoice.id);
  assert.ok(detail.approval_steps.every((s) => s.round === 2));
  assert.deepEqual(detail.approval_steps.map((s) => s.status), ["PENDING", "PENDING", "PENDING"]);
  const [signed] = detail.approval_history.filter((s) => s.step_no === 1);
  assert.equal(signed.round, 1);
  assert.equal(signed.actor_name, "Tim Kessler");
});

test("the new round is decided as before", async () => {
  const invoice = await secondRound();
  // Tim signed step 1 of the cancelled round; this is a new chain.
  assert.equal((await clients.manager2.post(`/api/invoices/${invoice.id}/approvals/1/approve`, {})).status, 200);
  const detail = await get(invoice.id);
  assert.equal(detail.approval_steps.find((s) => s.step_no === 1).status, "APPROVED");
  assert.equal(detail.approval_history.find((s) => s.step_no === 1).status, "CANCELLED", "the old round is untouched");
});
