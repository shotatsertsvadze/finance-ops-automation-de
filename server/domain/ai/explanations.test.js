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
import { ANSWERS, standInValidator } from "../../test-support/kosit.js";
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

test("no supplier's number, name or VAT id leaves the system, even when a check is about which supplier it is", async () => {
  const { rows: suppliers } = await deps.pool.query("select supplier_no, legal_name, vat_id from finops.suppliers");
  const identities = suppliers.flatMap((s) => [s.supplier_no, s.legal_name, s.vat_id]).filter(Boolean);
  for (const [what, change, failed] of [
    ["an order of another supplier", (xml) => xml.replace("PO-2026-0201", "PO-2026-0303"), "po_supplier_match"],
    ["an unknown supplier", (xml) => xml.replace("DE234567890", "DE777777777").replaceAll("Havel Logistik GmbH", "Ein Einzelunternehmer"), "supplier_known"],
  ]) {
    const id = await uploadChanged("B_iban_changed_2499.xml", change);
    const fake = withProvider(replies.timeout);
    await requestExplanation(deps, id, "de", REVIEWER);
    const input = sentInput(fake.calls[0]);
    assert.ok(input.failed.some((c) => c.check === failed), `${what}: ${failed} is explained`);
    const sent = `${fake.calls[0].system}\n${fake.calls[0].message}`;
    for (const identity of [...identities, "DE777777777", "Ein Einzelunternehmer"]) assert.ok(!sent.includes(identity), `${what}: ${identity}`);
    const { rows: [kept] } = await deps.pool.query(
      "select actual from finops.validation_results where invoice_id = $1 and check_code = $2", [id, failed],
    );
    assert.match(kept.actual, /S-10\d\d|DE777777777/, `${what}: the evidence itself still names the supplier`);
  }
});

// A value typed into any field of a document can be personal data: a name,
// an address, a phone number. Wherever a check repeats such a value, it stays
// in the evidence on screen and is not sent (ADR-082).
const PLANTED = "Qxmarker Mustermann, Privatweg 8, +49 30 1234567";
const LEAKED = /qxmarker|mustermann|privatweg|1234567/i;
const G = readFileSync(new URL("../../../fixtures/xrechnung/G_clean_380.xml", import.meta.url), "utf8");
const planted = {
  "an amount that is not a number": ['<cbc:PayableAmount currencyID="EUR">380.00<', `<cbc:PayableAmount currencyID="EUR">${PLANTED}<`],
  "a date": ["<cbc:IssueDate>2026-09-15<", `<cbc:IssueDate>${PLANTED}<`],
  "the declared profile": [/<cbc:CustomizationID>[^<]*</, `<cbc:CustomizationID>${PLANTED}<`],
  "the currency": ["<cbc:DocumentCurrencyCode>EUR<", `<cbc:DocumentCurrencyCode>${PLANTED}<`],
  "the IBAN field": ["<cbc:ID>DE89370400440532013000<", `<cbc:ID>${PLANTED}<`],
  "a tax rate": ["<cbc:Percent>19<", `<cbc:Percent>${PLANTED}<`],
  "a line id": ['<cbc:ID>1</cbc:ID>\n    <cbc:InvoicedQuantity unitCode="XBX">20<', `<cbc:ID>${PLANTED}</cbc:ID>\n    <cbc:InvoicedQuantity unitCode="XBX">21<`],
};

async function uploadWith(xml, officialValidator = standInValidator()) {
  const upload = { buffer: Buffer.from(xml), originalFilename: "planted.xml", sourceChannel: "UPLOAD", actor: human(USERS.clerk) };
  return (await handleUpload({ ...deps, officialValidator }, upload)).id;
}

async function assertNotSent(what, id) {
  const fake = withProvider(replies.timeout);
  await requestExplanation(deps, id, "de", REVIEWER);
  assert.equal(fake.calls.length, 1, `${what}: the provider was asked`);
  assert.doesNotMatch(`${fake.calls[0].system}\n${fake.calls[0].message}`, LEAKED, what);
  const { rows } = await deps.pool.query("select 1 from finops.validation_results where invoice_id = $1 and concat(actual, reason) ~* 'qxmarker'", [id]);
  assert.ok(rows.length > 0, `${what}: the evidence kept here still shows it`);
}

for (const [what, [from, to]] of Object.entries(planted)) {
  test(`a value planted in ${what} stays out of the provider request`, async () => {
    await deps.pool.query("delete from finops.invoices");
    const xml = G.replace(from, to);
    assert.notEqual(xml, G, `${what}: the fixture no longer contains the field`);
    await assertNotSent(what, await uploadWith(xml));
  });
}

test("a value planted in a duplicated invoice number stays out of the provider request", async () => {
  await deps.pool.query("delete from finops.invoices");
  const xml = G.replace("<cbc:ID>INV-2026-00433<", `<cbc:ID>${PLANTED}<`);
  await uploadWith(xml);
  await assertNotSent("an invoice number", await uploadWith(`${xml}<!-- sent again -->\n`));
});

test("the KoSIT validator's own message, which quotes the document, stays out of the provider request", async () => {
  await deps.pool.query("delete from finops.invoices");
  // The captured report of the pinned validator, quoting the planted value as it quotes '19,00'.
  const quoting = (buffer) => {
    const answer = ANSWERS.reject(buffer);
    return { ...answer, report: answer.report.replace("'19,00'", `'${PLANTED}'`) };
  };
  const id = await uploadWith(G, standInValidator(quoting));
  const fake = withProvider(replies.timeout);
  await requestExplanation(deps, id, "de", REVIEWER);
  const official = sentInput(fake.calls[0]).failed.find((c) => c.check === "official_validation");
  assert.match(official.actual, /cvc-datatype-valid\.1\.2\.1/, "the rule codes are sent");
  assert.doesNotMatch(fake.calls[0].message, LEAKED);
  const { rows: [kept] } = await deps.pool.query(
    "select reason from finops.validation_results where invoice_id = $1 and check_code = 'official_validation'", [id],
  );
  assert.match(kept.reason, /Qxmarker/, "the full message stays in the evidence");
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

/** A fixture changed before upload, alone in the invoice table. */
async function uploadChanged(file, change) {
  await deps.pool.query("delete from finops.invoices");
  const xml = readFileSync(new URL(`../../../fixtures/xrechnung/${file}`, import.meta.url), "utf8");
  const upload = { buffer: Buffer.from(change(xml)), originalFilename: file, sourceChannel: "UPLOAD", actor: human(USERS.clerk) };
  return (await handleUpload({ ...deps, officialValidator: standInValidator() }, upload)).id;
}

/** G goes straight through to APPROVED: nothing stopped it, so there is nothing to explain. */
async function uploadApproved() {
  const buffer = readFileSync(new URL("../../../fixtures/xrechnung/G_clean_380.xml", import.meta.url));
  const upload = { buffer, originalFilename: "G.xml", sourceChannel: "UPLOAD", actor: human(USERS.clerk) };
  return (await handleUpload({ ...deps, officialValidator: standInValidator() }, upload)).id;
}
