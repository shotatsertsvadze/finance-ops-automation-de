/**
 * AI explanations end to end, with a stand-in provider (ADR-080): asked for
 * on demand, verified before anyone sees them, kept apart from the evidence,
 * and without any effect on the invoice whatever the provider does.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { testDeps, USERS } from "../../test-support/db.js";
import { SCENARIOS, runScenario, scenarioFixture } from "../../test-support/ai-scenarios.js";
import { AI_OFF, aiEnabled, fakeExplainer, replies, sentInput } from "../../test-support/ai.js";
import { human } from "../workflow/transitions.js";
import { handleUpload, processInvoice } from "../intake/intake.js";
import { standInValidator } from "../../test-support/kosit.js";
import { loadEvidence } from "./evidence.js";
import { buildExplanationInput } from "./explanation-input.js";
import { currentExplanation, requestExplanation } from "./explanations.js";

let deps;
const REVIEWER = human(USERS.clerk);
const IBAN = scenarioFixture("1_iban_mismatch");
const [GERMAN, ENGLISH] = IBAN.good;
const REFUSED = IBAN.bad.find((b) => b.rule === "DECISION").output;

before(async () => {
  deps = await testDeps();
});
after(() => deps.pool.end());
beforeEach(() => {
  deps.ai = AI_OFF;
});

const withProvider = (reply, options) => {
  const fake = fakeExplainer(reply, options);
  deps.ai = aiEnabled(fake);
  return fake;
};
const attempts = async (id) => (await deps.pool.query(
  "select status, language, model, run_no, rejection_reasons, error, input, requested_by from finops.ai_explanations where invoice_id = $1 order by created_at", [id],
)).rows;

/** Everything authoritative about an invoice, to compare before and after. */
async function authoritative(id) {
  const q = async (sql) => (await deps.pool.query(sql, [id])).rows;
  return {
    invoice: await q("select state, review_reason, had_exception, updated_at from finops.invoices where id = $1"),
    checks: await q("select run_no, check_code, status from finops.validation_results where invoice_id = $1 order by id"),
    routing: await q("select run_no, decision, target_state from finops.routing_decisions where invoice_id = $1 order by run_no"),
    audit: await q("select action, to_state from finops.audit_events where invoice_id = $1 order by occurred_at, id"),
    steps: await q("select step_no, status from finops.approval_steps where invoice_id = $1 order by step_no"),
  };
}

test("the committed evaluation inputs are what the pipeline produces for each scenario", async () => {
  for (const name of Object.keys(SCENARIOS)) {
    const id = await runScenario(deps, name);
    const input = buildExplanationInput(await loadEvidence(deps.pool, deps.company, id), "de");
    assert.deepEqual(input, scenarioFixture(name).input, name);
  }
});

test("off: nothing is offered, a request is refused, and nothing is recorded", async () => {
  const id = await runScenario(deps, "1_iban_mismatch");
  assert.deepEqual(await currentExplanation(deps, id, "de"), { enabled: false });
  await assert.rejects(() => requestExplanation(deps, id, "de", REVIEWER), { status: 409, code: "AI_DISABLED" });
  assert.deepEqual(await attempts(id), []);
});

test("a grounded answer is accepted, labelled as AI, stored with its model and language, and served from then on", async () => {
  const id = await runScenario(deps, "1_iban_mismatch");
  const fake = withProvider(replies.output(GERMAN));
  const view = await requestExplanation(deps, id, "de", REVIEWER);
  assert.equal(view.status, "ACCEPTED");
  assert.equal(view.ai_generated, true);
  assert.deepEqual([view.summary, view.next_step, view.provider, view.model, view.language, view.run_no],
    [GERMAN.summary, "verify_bank_account", "anthropic", "claude-sonnet-4-6", "de", 1]);
  assert.deepEqual(view.cited_checks, GERMAN.cited_checks);

  assert.deepEqual((await requestExplanation(deps, id, "de", REVIEWER)).summary, GERMAN.summary);
  assert.equal((await currentExplanation(deps, id, "de")).explanation.summary, GERMAN.summary);
  assert.equal(fake.calls.length, 1, "the second request and the read are served from the record");
  const [row] = await attempts(id);
  assert.deepEqual([row.status, row.language, row.model, row.requested_by], ["ACCEPTED", "de", "claude-sonnet-4-6", USERS.clerk]);
});

test("each language is its own explanation, and a different model never reuses another model's answer", async () => {
  const id = await runScenario(deps, "1_iban_mismatch");
  const fake = withProvider((request) => replies.output(sentInput(request).language === "en" ? ENGLISH : GERMAN)());
  await requestExplanation(deps, id, "de", REVIEWER);
  const english = await requestExplanation(deps, id, "en", REVIEWER);
  assert.deepEqual([english.status, english.language, english.summary], ["ACCEPTED", "en", ENGLISH.summary]);
  assert.equal(fake.calls.length, 2);

  const other = withProvider(replies.output(GERMAN), { model: "claude-sonnet-5" });
  assert.equal((await currentExplanation(deps, id, "de")).explanation, null, "the other model's answer is not this model's");
  assert.equal((await requestExplanation(deps, id, "de", REVIEWER)).model, "claude-sonnet-5");
  assert.equal(other.calls.length, 1);
  assert.deepEqual((await attempts(id)).map((a) => [a.language, a.model]),
    [["de", "claude-sonnet-4-6"], ["en", "claude-sonnet-4-6"], ["de", "claude-sonnet-5"]]);
});

for (const [what, reply, status, rule] of [
  ["a timeout", replies.timeout, "FAILED", null],
  ["an unreachable provider", replies.unavailable, "FAILED", null],
  ["an answer that is not the agreed JSON", replies.output("Die Rechnung ist in Ordnung."), "REJECTED", "SCHEMA"],
  ["an answer that decides", replies.output(REFUSED), "REJECTED", "DECISION"],
]) {
  test(`${what}: nothing is shown, the attempt is recorded, and the invoice is untouched`, async () => {
    const id = await runScenario(deps, "1_iban_mismatch");
    const before = await authoritative(id);
    withProvider(reply);
    const view = await requestExplanation(deps, id, "de", REVIEWER);
    assert.deepEqual(view, { status: "UNAVAILABLE", ai_generated: true });
    assert.deepEqual(await authoritative(id), before);
    const [row] = await attempts(id);
    assert.equal(row.status, status);
    if (rule) assert.ok(row.rejection_reasons.some((r) => r.rule === rule), JSON.stringify(row.rejection_reasons));
    else assert.ok(row.error);
    const current = await currentExplanation(deps, id, "de");
    assert.deepEqual([current.explanation, current.status], [null, "UNAVAILABLE"]);
  });
}

test("enabled without a key: the attempt fails and says so, and nothing else changes", async () => {
  const id = await runScenario(deps, "1_iban_mismatch");
  const before = await authoritative(id);
  deps.ai = aiEnabled(null);
  assert.deepEqual(await requestExplanation(deps, id, "de", REVIEWER), { status: "UNAVAILABLE", ai_generated: true });
  assert.deepEqual((await attempts(id)).map((a) => [a.status, a.error]), [["FAILED", "Kein API-Schlüssel konfiguriert"]]);
  assert.deepEqual(await authoritative(id), before);
});

test("an accepted explanation changes nothing authoritative either", async () => {
  const id = await runScenario(deps, "1_iban_mismatch");
  const before = await authoritative(id);
  withProvider(replies.output(GERMAN));
  assert.equal((await requestExplanation(deps, id, "de", REVIEWER)).status, "ACCEPTED");
  assert.deepEqual(await authoritative(id), before);
});

test("the provider is called with no database connection held, so no transaction waits on it", async () => {
  const id = await runScenario(deps, "1_iban_mismatch");
  let held;
  withProvider(() => {
    held = deps.pool.totalCount - deps.pool.idleCount;
    return replies.output(GERMAN)();
  });
  await requestExplanation(deps, id, "de", REVIEWER);
  assert.equal(held, 0);
});

test("an explanation belongs to its validation run: after a new run the old one is not shown as current", async () => {
  const id = await runScenario(deps, "1_iban_mismatch");
  const fake = withProvider(replies.output(GERMAN));
  await requestExplanation(deps, id, "de", REVIEWER);
  await processInvoice(deps, id, REVIEWER);
  const current = await currentExplanation(deps, id, "de");
  assert.deepEqual([current.eligible, current.explanation], [true, null]);
  assert.equal((await requestExplanation(deps, id, "de", REVIEWER)).run_no, 2);
  assert.equal(fake.calls.length, 2);
  assert.deepEqual((await attempts(id)).map((a) => a.run_no), [1, 2], "run 1's explanation is kept, not replaced");
});

test("two requests at once store one accepted explanation", async () => {
  const id = await runScenario(deps, "1_iban_mismatch");
  withProvider(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return replies.output(GERMAN)();
  });
  const views = await Promise.all([requestExplanation(deps, id, "de", REVIEWER), requestExplanation(deps, id, "de", REVIEWER)]);
  assert.deepEqual(views.map((v) => v.status), ["ACCEPTED", "ACCEPTED"]);
  assert.equal((await attempts(id)).filter((a) => a.status === "ACCEPTED").length, 1);
});

test("only an invoice stopped in review, with a failed check, can be explained", async () => {
  await deps.pool.query("delete from finops.invoices");
  withProvider(replies.output(GERMAN));
  const clean = await uploadApproved();
  assert.equal((await currentExplanation(deps, clean, "de")).eligible, false);
  await assert.rejects(() => requestExplanation(deps, clean, "de", REVIEWER), { status: 409, code: "AI_NOT_APPLICABLE" });
});

test("only the minimised evidence leaves the system, exactly as recorded", async () => {
  const id = await runScenario(deps, "1_iban_mismatch");
  const fake = withProvider(replies.output(GERMAN));
  await requestExplanation(deps, id, "de", REVIEWER);
  const [request] = fake.calls;
  const input = sentInput(request);
  const sent = `${request.system}\n${request.message}`;
  assert.deepEqual(input, IBAN.input);
  assert.deepEqual((await attempts(id))[0].input, input, "the record is what was sent");
  for (const secret of [/DE02120300000000202051/, /DE02300209000106531065/, /Havel Logistik/, /Nordwerk/, /B_iban_changed/, /\.xml/, /storage/, /@/, /S-10\d\d/]) {
    assert.doesNotMatch(sent, secret);
  }
  assert.doesNotMatch(sent, /\b[A-Z]{2}\d{2}[A-Z0-9]{12,30}\b/, "no full IBAN of any kind");
});

test("no workflow, routing, approval, master-data or payment code imports the AI modules", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const allowed = new Set(["domain/ai", "integrations/ai-explainer.js", "routes/invoices.js", "index.js", "test-support"]);
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const rel = path.relative(root, full);
      if ([...allowed].some((a) => rel === a || rel.startsWith(`${a}/`))) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".js") && !full.endsWith(".test.js") && /from "[^"]*(\/ai\/|ai-explainer)/.test(readFileSync(full, "utf8"))) offenders.push(rel);
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});

/** G goes straight through to APPROVED: nothing stopped it, so there is nothing to explain. */
async function uploadApproved() {
  const buffer = readFileSync(new URL("../../../fixtures/xrechnung/G_clean_380.xml", import.meta.url));
  const upload = { buffer, originalFilename: "G.xml", sourceChannel: "UPLOAD", actor: human(USERS.clerk) };
  return (await handleUpload({ ...deps, officialValidator: standInValidator() }, upload)).id;
}
