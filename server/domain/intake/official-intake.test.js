/**
 * Official validation inside intake (ADR-078): the KoSIT check sits between
 * the parser and the business checks, its evidence is kept per run, and no
 * answer short of a verdict of "acceptable" lets an invoice go further than
 * review. Driven over HTTP with a stand-in validator; the real one is in
 * `kosit-real.test.js`.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createApp } from "../../app.js";
import { loginAs, testDeps } from "../../test-support/db.js";
import { ANSWERS, standInValidator } from "../../test-support/kosit.js";

let deps, server, clerk;
const G = readFileSync(new URL("../../../fixtures/xrechnung/G_clean_380.xml", import.meta.url));

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  clerk = await loginAs(`http://127.0.0.1:${server.address().port}`, "clerk");
});
after(async () => {
  server.close();
  await deps.pool.end();
});
beforeEach(async () => {
  await deps.pool.query("delete from finops.invoices");
});

async function upload(xml = G, name = "G.xml") {
  const res = await clerk.upload(xml, name);
  assert.equal(res.status, 201);
  return res.json();
}
const official = (invoice) => invoice.validation.technical.find((c) => c.check_code === "official_validation");
const records = async (id) =>
  (await deps.pool.query("select * from finops.official_validations where invoice_id = $1 order by run_no", [id])).rows;

test("without a validator outside production the check is SKIPPED, says so, and the rest runs", async () => {
  deps.officialValidator = { client: null, required: false };
  const invoice = await upload();
  assert.equal(official(invoice).status, "SKIPPED");
  assert.match(official(invoice).reason, /nicht offiziell geprüft/);
  assert.equal(invoice.state, "APPROVED", "G is clean and small: unchanged behaviour");
  assert.deepEqual(await records(invoice.id), []);
  assert.equal(invoice.official_validation, null);
});

test("an accepted answer passes, and its evidence is stored with the run", async () => {
  deps.officialValidator = standInValidator(ANSWERS.accept);
  const invoice = await upload();
  assert.equal(official(invoice).status, "PASSED");
  assert.equal(invoice.state, "APPROVED");
  const [record] = await records(invoice.id);
  assert.equal(record.run_no, 1);
  assert.equal(record.verdict, "ACCEPTED");
  assert.equal(record.validator_version, "KoSIT Validator 1.6.3");
  assert.equal(record.configuration_version, "xrechnung-3.0.2-validator-configuration-2026-08-31");
  assert.equal(record.document_sha256, invoice.file_sha256);
  assert.equal(record.reported_document_sha256, invoice.file_sha256);
  assert.equal(record.report_sha256, createHash("sha256").update(record.report).digest("hex"));
  assert.equal(invoice.official_validation.verdict, "ACCEPTED");
  assert.equal(invoice.official_validation.report, undefined, "the raw report is not part of normal reads");
});

test("a rejection is a technical failure: review, no business checks, and no release", async () => {
  deps.officialValidator = standInValidator(ANSWERS.reject);
  const invoice = await upload();
  assert.equal(invoice.state, "REVIEW_REQUIRED");
  assert.equal(invoice.review_reason, "TECHNICAL_VALIDATION_FAILED");
  assert.equal(official(invoice).status, "FAILED");
  assert.deepEqual(invoice.validation.business, []);
  assert.ok(invoice.payable_blockers.includes("official_validation"));
  const accept = await clerk.post(`/api/invoices/${invoice.id}/review/accept`, { comment: "Formfehler egal" });
  assert.equal(accept.status, 422);
  assert.equal((await accept.json()).code, "NOT_PAYABLE_ELIGIBLE");
  assert.equal((await records(invoice.id))[0].verdict, "REJECTED");
});

for (const kind of ["unavailable", "timeout", "unprocessable"]) {
  test(`${kind}: an invoice that would auto-approve goes to review instead, and the attempt is kept`, async () => {
    deps.officialValidator = standInValidator(ANSWERS[kind]);
    const invoice = await upload();
    assert.equal(invoice.state, "REVIEW_REQUIRED");
    assert.equal(official(invoice).status, "FAILED");
    const [record] = await records(invoice.id);
    assert.equal(record.outcome, kind.toUpperCase());
    assert.equal(record.verdict, null);
  });
}

test("a required validator that is not configured fails closed", async () => {
  deps.officialValidator = { client: null, required: true };
  const invoice = await upload();
  assert.equal(invoice.state, "REVIEW_REQUIRED");
  assert.equal((await records(invoice.id))[0].outcome, "NOT_CONFIGURED");
});

test("a retry is a new run; the failed attempt stays on record", async () => {
  const validator = standInValidator(ANSWERS.unavailable);
  deps.officialValidator = validator;
  const invoice = await upload();
  validator.answer = ANSWERS.accept;
  const res = await clerk.post(`/api/invoices/${invoice.id}/reprocess`, {});
  assert.equal(res.status, 200);
  const after = await (await clerk.get(`/api/invoices/${invoice.id}`)).json();
  // Once in review, always a signature (ADR-020): an outage is no exception.
  assert.equal(after.state, "READY_FOR_APPROVAL");
  assert.deepEqual(
    (await records(invoice.id)).map((r) => [r.run_no, r.outcome]),
    [
      [1, "UNAVAILABLE"],
      [2, "ACCEPTED"],
    ],
  );
  const { rows } = await deps.pool.query(
    "select run_no, status from finops.validation_results where invoice_id = $1 and check_code = 'official_validation' order by run_no",
    [invoice.id],
  );
  assert.deepEqual(
    rows.map((r) => [r.run_no, r.status]),
    [
      [1, "FAILED"],
      [2, "PASSED"],
    ],
  );
});

test("a document the parser cannot read is not sent to the validator", async () => {
  const validator = standInValidator(ANSWERS.accept);
  deps.officialValidator = validator;
  const invoice = await upload(Buffer.from("<Invoice><unclosed></Invoice>"), "broken.xml");
  assert.equal(validator.calls, 0);
  assert.equal(official(invoice).status, "SKIPPED");
  assert.equal(invoice.state, "REVIEW_REQUIRED");
});
