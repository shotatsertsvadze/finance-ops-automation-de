/**
 * The real, pinned KoSIT validator (ADR-078): the fixtures, the pipeline and
 * the whole demo month against it. Needs a running daemon at KOSIT_TEST_URL
 * (`npm run kosit:fetch`, `npm run kosit`); without one these tests skip,
 * unless KOSIT_TEST_REQUIRED=true, as in CI, where skipping would hide that
 * the validator path was never exercised.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createKositClient } from "./kosit.js";
import { KOSIT_PINS } from "./kosit-pins.js";
import { validateOfficially } from "../domain/invoice/official-validation.js";
import { handleUpload } from "../domain/intake/intake.js";
import { getInvoiceDetail } from "../domain/invoice/queries.js";
import { human } from "../domain/workflow/transitions.js";
import { USERS, testDeps } from "../test-support/db.js";
import { reset } from "../../scripts/reset.js";
import { generateDemoData } from "../../scripts/demo-data.js";

const URL_ = process.env.KOSIT_TEST_URL;
if (process.env.KOSIT_TEST_REQUIRED === "true" && !URL_) throw new Error("KOSIT_TEST_REQUIRED=true, aber KOSIT_TEST_URL fehlt");
const skip = URL_ ? false : "KOSIT_TEST_URL nicht gesetzt: npm run kosit:fetch, npm run kosit, dann KOSIT_TEST_URL=http://127.0.0.1:8081";

let deps, validator;
const fixture = (name) => readFileSync(new URL(`../../fixtures/xrechnung/${name}`, import.meta.url));
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
const upload = async (name) =>
  (await handleUpload(deps, { buffer: fixture(name), originalFilename: name, sourceChannel: "UPLOAD", actor: human(USERS.clerk) })).id;

before(async () => {
  if (skip) return;
  const client = createKositClient({ url: URL_, timeoutMs: 20_000 });
  // A validator named but not answering is a failure, never a quiet skip.
  if (!(await client.available())) throw new Error(`KoSIT antwortet nicht unter ${URL_}`);
  validator = { client, required: true };
  deps = { ...(await testDeps()), officialValidator: validator };
});
after(() => deps?.pool.end());

const FIXTURES = {
  "A_clean_1240.xml": ["READY_FOR_APPROVAL", null],
  "B_iban_changed_2499.xml": ["REVIEW_REQUIRED", "SUPPLIER_IBAN_MATCH"],
  "C_po_overrun_8500.xml": ["REVIEW_REQUIRED", "PO_AMOUNT_WITHIN_TOLERANCE"],
  "D_duplicate_number_1240.xml": ["REVIEW_REQUIRED", "DUPLICATE_INVOICE_NUMBER"],
  "E_high_value_30000.xml": ["READY_FOR_APPROVAL", null],
  "F_malformed.xml": ["REVIEW_REQUIRED", "TECHNICAL_VALIDATION_FAILED"],
  "G_clean_380.xml": ["APPROVED", null],
  "H_small_iban_changed_380.xml": ["REVIEW_REQUIRED", "SUPPLIER_IBAN_MATCH"],
  "I_discount_499.xml": ["APPROVED", null],
  "J_credit_note_214.xml": ["APPROVED", null],
};

test("the pinned validator accepts every fixture meant to be valid and rejects F", { skip }, async () => {
  for (const name of Object.keys(FIXTURES)) {
    const buffer = fixture(name);
    const { check, record } = await validateOfficially(validator, { buffer, name: name.replace(".xml", ""), documentSha256: sha(buffer), readable: true });
    const expected = name.startsWith("F_") ? "REJECTED" : "ACCEPTED";
    assert.equal(record.verdict, expected, `${name}: ${record.error ?? check.reason}`);
    assert.equal(record.validator_version, KOSIT_PINS.validator.engine);
    assert.equal(record.reported_document_sha256, sha(buffer));
  }
});

test("through intake: B, C, D and H pass the validator and still fail their business check; F fails it", { skip }, async () => {
  for (const [name, [state, reason]] of Object.entries(FIXTURES)) {
    // Each fixture on its own, as the README states their outcomes; D is the
    // duplicate of A, so it follows A.
    await deps.pool.query("delete from finops.invoices");
    if (name.startsWith("D_")) await upload("A_clean_1240.xml");
    const id = await upload(name);
    const invoice = await getInvoiceDetail(deps.pool, id);
    const official = invoice.validation.technical.find((c) => c.check_code === "official_validation");
    assert.deepEqual([invoice.state, invoice.review_reason], [state, reason], name);
    assert.equal(official.status, name.startsWith("F_") ? "FAILED" : "PASSED", name);
    assert.equal(invoice.official_validation.verdict, name.startsWith("F_") ? "REJECTED" : "ACCEPTED", name);
    assert.equal(invoice.official_validation.configuration_version, KOSIT_PINS.configuration.version);
  }
});

test("the demo month: 65 acceptable, exactly the 5 malformed ones not, and every figure as without it", { skip }, async () => {
  await reset(deps.pool);
  const summary = await generateDemoData(deps, { count: 70, statementFile: null });
  const { rows: verdicts } = await deps.pool.query(
    `select o.verdict, i.invoice_number from finops.official_validations o join finops.invoices i on i.id = o.invoice_id
     order by i.invoice_number`,
  );
  assert.equal(verdicts.length, 70, "one validation per demo invoice");
  assert.equal(verdicts.filter((v) => v.verdict === "ACCEPTED").length, 65);
  assert.deepEqual(verdicts.filter((v) => v.verdict === "REJECTED").map((v) => v.invoice_number),
    ["DEMO-2026-01002", "DEMO-2026-01026", "DEMO-2026-01037", "DEMO-2026-01048", "DEMO-2026-01053"]);

  // The figures docs/DEMO.md quotes, which were measured without a validator.
  const { rows } = await deps.pool.query("select state, count(*)::int as n from finops.invoices group by state");
  const n = Object.fromEntries(rows.map((r) => [r.state, r.n]));
  const money = ["APPROVED", "ACCOUNTING_READY", "PAYMENT_PENDING", "PAID", "RECONCILIATION_EXCEPTION"].reduce((s, k) => s + (n[k] ?? 0), 0);
  assert.deepEqual([n.REVIEW_REQUIRED, n.READY_FOR_APPROVAL, n.APPROVED, money, n.RECONCILED], [6, 3, 11, 24, 30]);
  assert.deepEqual(summary, {
    created: 70, auto: 42, approved: 58, exceptions: 11, paid: 36, reconciled: 30, credited: 4, netted: 4,
    netted_amount: "823.09", statement_lines: 38, bank_exceptions: 4,
  });
});
