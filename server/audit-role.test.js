/**
 * The audit trail cannot be changed by the app (ADR-068). The app connected as
 * the schema owner, which may UPDATE and DELETE audit rows, and deleting an
 * invoice cascaded to its trail.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createPool } from "./db.js";
import { loginAs, resetBankChanges, testDeps } from "./test-support/db.js";
import { grantAppRole } from "./db-grants.js";
import { deploymentProblems } from "./config/deployment.js";
import { runScenario } from "./test-support/ai-scenarios.js";
import { aiEnabled, fakeExplainer, replies } from "./test-support/ai.js";
import { human } from "./domain/workflow/transitions.js";
import { requestInquiryDraft } from "./domain/ai/inquiry-drafts.js";
import { approveInquiry, inquiryOverview, markInquirySent } from "./domain/inquiries/inquiries.js";

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

test("the app role runs the whole bank-account change loop, revalidation included", async () => {
  const server = createApp({ ...deps, pool: app }).listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const [clerk, finance, finance2] = await Promise.all(["clerk", "finance", "finance2"].map((who) => loginAs(base, who)));
    const xml = readFileSync(new URL("../fixtures/xrechnung/H_small_iban_changed_380.xml", import.meta.url));
    const invoice = await (await clerk.upload(xml, "H.xml")).json();
    const iban = "DE75512108001245126199";
    const change = await (
      await clerk.post("/api/bank-changes", {
        supplier_id: invoice.supplier_id,
        iban,
        source_invoice_id: invoice.id,
        comment: "Neue Bankverbindung",
      })
    ).json();
    const verify = await finance.post(`/api/bank-changes/${change.id}/verify`, {
      outcome: "CONFIRMED",
      contacted_role: "Buchhaltung",
      called_at: new Date().toISOString(),
      iban_read_back: iban,
    });
    assert.equal(verify.status, 200);
    const approve = await finance2.post(`/api/bank-changes/${change.id}/approve`, {});
    assert.equal(approve.status, 200);
    // Where the invoice lands depends on the order G already drew on; what
    // this proves is that the app role could write the run and its link.
    const [done] = (await approve.json()).revalidation.revalidated;
    assert.equal(done.to_run_no, 2);
    const { rows } = await deps.pool.query(
      "select check_code, status from finops.validation_results where invoice_id = $1 and run_no = 2 and status = 'FAILED'",
      [invoice.id],
    );
    assert.deepEqual(
      rows.map((r) => r.check_code),
      ["po_amount_within_tolerance"],
      "the IBAN passes; the order G used is still short",
    );
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

test("the app role cannot rewrite a bank-account proposal, official validation evidence or trusted accounts", async () => {
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
    "update finops.official_validations set verdict = 'ACCEPTED'",
    "update finops.official_validations set report = null, report_sha256 = null",
    "delete from finops.official_validations",
    "truncate finops.official_validations",
    "delete from finops.supplier_bank_accounts",
  ]) {
    await assert.rejects(() => app.query(sql), /permission denied/, sql);
  }
});

test("the app role cannot rewrite or remove a record of what was sent to the AI provider", async () => {
  for (const sql of [
    "update finops.ai_explanations set status = 'ACCEPTED'",
    "update finops.ai_explanations set input = '{}'::jsonb",
    "delete from finops.ai_explanations",
    "truncate finops.ai_explanations",
  ]) {
    await assert.rejects(() => app.query(sql), /permission denied/, sql);
  }
});

test("the app role drafts, approves and sends a supplier inquiry, but cannot rewrite or remove either record", async () => {
  await resetBankChanges(deps.pool);
  const id = await runScenario(deps, "2_po_overrun");
  const draft = {
    subject: "Rückfrage zu Ihrer Rechnung {{rechnungsnummer}}",
    body: "Sehr geehrte Damen und Herren,\n\nbitte erläutern Sie die Differenz zur Bestellung {{bestellnummer}}.\n\nMit freundlichen Grüßen",
    cited_checks: ["po_amount_within_tolerance"],
    requests: ["betrag_klaeren"],
    language: "de",
  };
  const asApp = { ...deps, pool: app, ai: aiEnabled(fakeExplainer(replies.output(draft))) };
  const clerk = human("00000000-0000-0000-0000-000000000001");
  const shown = await requestInquiryDraft(asApp, id, clerk);
  const approved = await approveInquiry(
    asApp,
    id,
    { source: "AI", aiInquiryId: shown.id, subject: shown.subject, body: shown.body },
    clerk,
  );
  await markInquirySent(asApp, id, approved.id, clerk);
  assert.equal((await inquiryOverview(asApp, id)).inquiries[0].status, "SENT");
  for (const sql of [
    "update finops.ai_supplier_inquiries set status = 'ACCEPTED'",
    "delete from finops.ai_supplier_inquiries",
    "truncate finops.ai_supplier_inquiries",
    "update finops.supplier_inquiries set body = 'anders'",
    "delete from finops.supplier_inquiries",
    "truncate finops.supplier_inquiries",
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
  const env = { NODE_ENV: "production", DEMO_MODE: "true", KOSIT_URL: "http://127.0.0.1:8081" };
  const dist = fileURLToPath(new URL("../client", import.meta.url));
  const asOwner = await deploymentProblems({ pool: deps.pool, env, clientDir: dist });
  assert.ok(
    asOwner.some((p) => /Prüfpfad/.test(p)),
    asOwner.join("; "),
  );
  const asApp = await deploymentProblems({ pool: app, env, clientDir: dist });
  assert.deepEqual(asApp, []);
});
