/**
 * What a KoSIT answer means for an invoice (ADR-078): one check, and the
 * evidence kept beside it. The reports are real ones, captured from the pinned
 * validator for fixtures A and F. Anything that is not a clean, consistent
 * verdict from the pinned validator about this very document fails closed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { validateOfficially } from "./official-validation.js";
import { KOSIT_PINS } from "../../integrations/kosit-pins.js";

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url));
const A = read("fixtures/xrechnung/A_clean_1240.xml");
const F = read("fixtures/xrechnung/F_malformed.xml");
const ACCEPTED = read("fixtures/kosit/A_clean_1240.accepted.xml").toString();
const REJECTED = read("fixtures/kosit/F_malformed.rejected.xml").toString();
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

/** A validator that answers with `attempt` and records what it was sent. */
function standIn(attempt, { required = true } = {}) {
  const calls = [];
  const client = { async validate(buffer, name) { calls.push({ buffer, name }); return { durationMs: 12, ...attempt }; } };
  return { validator: { client, required }, calls };
}

const run = (validator, buffer = A, readable = true) =>
  validateOfficially(validator, { buffer, name: "inv-1", documentSha256: sha(buffer), readable });

test("an accepted report passes, with versions, scenario and the document's hash kept", async () => {
  const { validator, calls } = standIn({ outcome: "ACCEPTED", httpStatus: 200, report: ACCEPTED });
  const { check, record } = await run(validator);
  assert.equal(calls.length, 1);
  assert.equal(check.check, "official_validation");
  assert.equal(check.status, "PASSED");
  assert.equal(record.outcome, "ACCEPTED");
  assert.equal(record.verdict, "ACCEPTED");
  assert.equal(record.validator_version, "KoSIT Validator 1.6.3");
  assert.equal(record.configuration_version, KOSIT_PINS.configuration.version);
  assert.equal(record.scenario, "EN16931 XRechnung (UBL Invoice)");
  assert.equal(record.reported_document_sha256, sha(A));
  assert.deepEqual(record.messages.map((m) => [m.level, m.code]), [["information", "BR-DE-TMP-32"]]);
  assert.equal(record.report, ACCEPTED, "the raw report is kept as received");
});

test("a rejected report fails, naming the rules and the first error", async () => {
  const { validator } = standIn({ outcome: "REJECTED", httpStatus: 406, report: REJECTED });
  const { check, record } = await run(validator, F);
  assert.equal(check.status, "FAILED");
  assert.equal(check.severity, "HIGH");
  assert.equal(record.verdict, "REJECTED");
  assert.match(check.actual, /5 Fehler/);
  assert.match(check.actual, /cvc-datatype-valid\.1\.2\.1/);
  assert.match(check.reason, /'19,00' is not a valid value for 'decimal'/);
  const first = record.messages[0];
  assert.deepEqual([first.step, first.level, first.code], ["val-xsd", "error", "cvc-datatype-valid.1.2.1"]);
});

const invalid = async (attempt, buffer = A, pattern) => {
  const { validator } = standIn(attempt);
  const { check, record } = await run(validator, buffer);
  assert.equal(check.status, "FAILED");
  assert.equal(record.outcome, "INVALID_RESPONSE");
  assert.equal(record.verdict, null, "no verdict is recorded from a response we cannot trust");
  assert.match(record.error, pattern);
};

test("a status that contradicts the report fails closed", async () => {
  await invalid({ outcome: "ACCEPTED", httpStatus: 200, report: REJECTED }, F, /widerspricht/);
});

test("a report about another document fails closed", async () => {
  await invalid({ outcome: "ACCEPTED", httpStatus: 200, report: ACCEPTED }, Buffer.concat([A, Buffer.from(" ")]), /anderes Dokument/);
});

test("a report from another validator version fails closed", async () => {
  await invalid({ outcome: "ACCEPTED", httpStatus: 200, report: ACCEPTED.replace("KoSIT Validator 1.6.3", "KoSIT Validator 1.7.0") }, A, /Validator-Version/);
});

test("a report from another rule configuration fails closed", async () => {
  await invalid({ outcome: "ACCEPTED", httpStatus: 200, report: ACCEPTED.replaceAll("xrechnung-3.0.2-schematron-2.6.0", "xrechnung-3.0.2-schematron-2.7.0") }, A, /Konfiguration/);
});

test("an acceptance that names no rule configuration fails closed", async () => {
  const unnamed = ACCEPTED.replace(/<rep:scenarioMatched[\s\S]*<\/rep:scenarioMatched>/, "");
  await invalid({ outcome: "ACCEPTED", httpStatus: 200, report: unnamed }, A, /Konfiguration/);
});

test("a body that is not a report fails closed", async () => {
  for (const report of ["", "not xml", "<html><body>Proxy error</body></html>", "<rep:report"]) {
    await invalid({ outcome: "ACCEPTED", httpStatus: 200, report }, A, /Prüfbericht/);
  }
});

for (const [outcome, httpStatus, pattern] of [
  ["TIMEOUT", null, /nicht rechtzeitig/],
  ["UNAVAILABLE", null, /nicht erreichbar/],
  ["UNPROCESSABLE", 422, /nicht verarbeiten/],
  ["ERROR", 500, /Fehler/],
]) {
  test(`${outcome} fails closed and is recorded, with no verdict`, async () => {
    const { validator } = standIn({ outcome, httpStatus, report: outcome === "ERROR" ? "oops" : null, error: "connect ECONNREFUSED" });
    const { check, record } = await run(validator);
    assert.equal(check.status, "FAILED");
    assert.match(check.reason, pattern);
    assert.equal(record.outcome, outcome);
    assert.equal(record.verdict, null);
  });
}

test("no validator where one is required fails closed and is recorded", async () => {
  const { check, record } = await run({ client: null, required: true });
  assert.equal(check.status, "FAILED");
  assert.equal(record.outcome, "NOT_CONFIGURED");
});

test("no validator outside production is SKIPPED and says so; nothing is recorded as a validation", async () => {
  const { check, record } = await run({ client: null, required: false });
  assert.equal(check.status, "SKIPPED");
  assert.match(check.reason, /nicht offiziell geprüft/);
  assert.equal(record, null);
});

test("a document the parser could not read is not sent", async () => {
  const { validator, calls } = standIn({ outcome: "ACCEPTED", httpStatus: 200, report: ACCEPTED });
  const { check, record } = await run(validator, A, false);
  assert.equal(calls.length, 0);
  assert.equal(check.status, "SKIPPED");
  assert.equal(record, null);
});
