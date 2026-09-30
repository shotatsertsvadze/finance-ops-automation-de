/**
 * The audit trail cannot be changed by the app (ADR-068). The app connected as
 * the schema owner, which may UPDATE and DELETE audit rows, and deleting an
 * invoice cascaded to its trail.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "./app.js";
import { createPool } from "./db.js";
import { loginAs, testDeps } from "./test-support/db.js";
import { grantAppRole } from "./db-grants.js";
import { deploymentProblems } from "./config/deployment.js";

const ROLE = "finops_app_test";
let deps, app;

/** A pool whose every connection acts as the app role, as a deployment would. */
const asRole = () => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set("options", `-c role=${ROLE}`);
  return createPool(url.toString());
};

before(async () => {
  deps = await testDeps();
  await deps.pool.query(`drop owned by ${ROLE}`).catch(() => {});
  await deps.pool.query(`drop role if exists ${ROLE}`);
  await deps.pool.query(`create role ${ROLE} nologin`);
  await grantAppRole(deps.pool, ROLE);
  app = asRole();
});
after(async () => {
  await app.end();
  await deps.pool.query(`drop owned by ${ROLE}`);
  await deps.pool.query(`drop role ${ROLE}`);
  await deps.pool.end();
});

test("the app role runs the whole money path", async () => {
  const server = createApp({ ...deps, pool: app }).listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const clerk = await loginAs(base, "clerk");
    const finance = await loginAs(base, "finance");
    const xml = readFileSync(new URL("../fixtures/xrechnung/G_clean_380.xml", import.meta.url));
    const invoice = await (await clerk.upload(xml, "G.xml")).json();
    assert.equal(invoice.state, "APPROVED");
    for (const stage of ["accounting-record", "payment", "payment/confirm"]) {
      assert.equal((await finance.post(`/api/invoices/${invoice.id}/${stage}`, {})).status, 200, stage);
    }
  } finally {
    server.close();
  }
});

test("the app role can neither rewrite nor delete the audit trail", async () => {
  await assert.rejects(() => app.query("update finops.audit_events set reason = 'geändert'"), /permission denied/);
  await assert.rejects(() => app.query("delete from finops.audit_events"), /permission denied/);
  await assert.rejects(() => app.query("truncate finops.audit_events"), /permission denied/);
});

test("nor delete an invoice, which would take its trail with it", async () => {
  await assert.rejects(() => app.query("delete from finops.invoices"), /permission denied/);
  const { rows } = await deps.pool.query("select count(*)::int as n from finops.audit_events");
  assert.ok(rows[0].n > 0, "the trail is still there");
});

test("the app role cannot rewrite a bank-account proposal, its evidence or trusted accounts", async () => {
  for (const sql of [
    "update finops.bank_account_changes set proposed_iban = 'DE02300209000106531065'",
    "update finops.bank_account_changes set proposal_sha256 = repeat('b', 64)",
    "update finops.bank_account_changes set trusted_ibans = '{}'",
    "delete from finops.bank_account_changes",
    "update finops.bank_change_verifications set outcome = 'CONFIRMED'",
    "delete from finops.bank_change_verifications",
    "update finops.bank_change_events set reason = 'geändert'",
    "delete from finops.bank_change_events",
    "truncate finops.bank_change_events",
    "update finops.bank_change_revalidations set to_run_no = 99",
    "delete from finops.bank_change_revalidations",
    "update finops.supplier_bank_accounts set iban = 'DE02300209000106531065'",
    "delete from finops.supplier_bank_accounts",
  ]) {
    await assert.rejects(() => app.query(sql), /permission denied/, sql);
  }
});

test("but may record a change's decision, which is all the workflow updates", async () => {
  await app.query(
    `update finops.bank_account_changes set state = state, verified_by = verified_by, decided_by = decided_by,
       decision_reason = decision_reason, bank_account_id = bank_account_id, revalidated_at = revalidated_at where false`,
  );
});

test("a production start refuses a connection that could change the trail", async () => {
  const env = { NODE_ENV: "production", DEMO_MODE: "true" };
  const dist = new URL("../client", import.meta.url).pathname;
  const asOwner = await deploymentProblems({ pool: deps.pool, env, clientDir: dist });
  assert.ok(asOwner.some((p) => /Prüfpfad/.test(p)), asOwner.join("; "));
  const asApp = await deploymentProblems({ pool: app, env, clientDir: dist });
  assert.deepEqual(asApp, []);
});
