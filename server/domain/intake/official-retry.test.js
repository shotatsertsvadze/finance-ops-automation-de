/**
 * Retrying official validation after the validator was down (ADR-078). Only
 * invoices whose latest run got no verdict are taken, each is a new run beside
 * the old one, and a replayed or concurrent retry does nothing twice.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../../app.js";
import { loginAs, testDeps } from "../../test-support/db.js";
import { ANSWERS, standInValidator } from "../../test-support/kosit.js";

let deps, server, clerk, manager, validator;
const fixture = (name) => readFileSync(new URL(`../../../fixtures/xrechnung/${name}`, import.meta.url));

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  clerk = await loginAs(base, "clerk");
  manager = await loginAs(base, "manager");
});
after(async () => {
  server.close();
  await deps.pool.end();
});
beforeEach(async () => {
  await deps.pool.query("delete from finops.invoices");
  validator = standInValidator(ANSWERS.unavailable);
  deps.officialValidator = validator;
});

const upload = async (name) => (await (await clerk.upload(fixture(name), name)).json());
const retry = async () => {
  const res = await clerk.post("/api/invoices/official-validation/retry", {});
  assert.equal(res.status, 200);
  return res.json();
};
const runs = async (id) => (await deps.pool.query(
  "select run_no, outcome from finops.official_validations where invoice_id = $1 order by run_no", [id],
)).rows.map((r) => [r.run_no, r.outcome]);

test("after an outage the stranded invoices are validated again, each as a new run", async () => {
  const g = await upload("G_clean_380.xml");
  const a = await upload("A_clean_1240.xml");
  validator.answer = ANSWERS.accept;
  const result = await retry();
  assert.deepEqual(result.retried.map((r) => [r.invoice_id, r.from_run, r.to_run, r.outcome]).sort(),
    [[g.id, 1, 2, "ACCEPTED"], [a.id, 1, 2, "ACCEPTED"]].sort());
  assert.deepEqual(await runs(g.id), [[1, "UNAVAILABLE"], [2, "ACCEPTED"]]);
  const after = await (await clerk.get(`/api/invoices/${g.id}`)).json();
  assert.equal(after.state, "READY_FOR_APPROVAL", "it was in review, so a person signs (ADR-020)");
});

test("a replayed retry changes nothing", async () => {
  const g = await upload("G_clean_380.xml");
  validator.answer = ANSWERS.accept;
  await retry();
  const again = await retry();
  assert.deepEqual(again.retried, []);
  assert.deepEqual(await runs(g.id), [[1, "UNAVAILABLE"], [2, "ACCEPTED"]]);
});

test("while the validator is still down nothing is touched", async () => {
  const g = await upload("G_clean_380.xml");
  validator.up = false;
  const result = await retry();
  assert.equal(result.validator_available, false);
  assert.deepEqual(result.retried, []);
  assert.deepEqual(await runs(g.id), [[1, "UNAVAILABLE"]]);
});

test("a verdict is not retried, nor an invoice waiting for a person's answer", async () => {
  validator.answer = ANSWERS.reject;
  const rejected = await upload("G_clean_380.xml");
  validator.answer = ANSWERS.unavailable;
  const waiting = await upload("A_clean_1240.xml");
  await clerk.post(`/api/invoices/${waiting.id}/review/request-info`, { comment: "Rückfrage" });
  validator.answer = ANSWERS.accept;
  assert.deepEqual((await retry()).retried, []);
  assert.deepEqual(await runs(rejected.id), [[1, "REJECTED"]]);
  assert.deepEqual(await runs(waiting.id), [[1, "UNAVAILABLE"]]);
});

test("two retries at once validate each invoice once, even one that stays in review", async () => {
  // B passes the validator and still fails its IBAN check, so it is in review
  // again afterwards: only its verdict tells the second retry it is done.
  const b = await upload("B_iban_changed_2499.xml");
  validator.answer = ANSWERS.accept;
  const [first, second] = await Promise.all([retry(), retry()]);
  assert.equal(first.retried.length + second.retried.length, 1);
  assert.deepEqual(await runs(b.id), [[1, "UNAVAILABLE"], [2, "ACCEPTED"]]);
  const after = await (await clerk.get(`/api/invoices/${b.id}`)).json();
  assert.deepEqual([after.state, after.review_reason], ["REVIEW_REQUIRED", "SUPPLIER_IBAN_MATCH"]);
});

test("a retry is for those who may reprocess invoices", async () => {
  assert.equal((await manager.post("/api/invoices/official-validation/retry", {})).status, 403);
});
