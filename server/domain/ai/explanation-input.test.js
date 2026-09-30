/**
 * What an AI explanation is given (ADR-080): the failed checks' evidence, the
 * other checks by name only, and nothing else. Full IBANs, names and contact
 * details never leave the system.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExplanationInput, inputSha256 } from "./explanation-input.js";

const check = (phase, check_code, status, expected, actual, reason, severity = "HIGH") =>
  ({ phase, check_code, status, severity, expected, actual, reason });

const EVIDENCE = {
  invoice: { document_type: "INVOICE", state: "REVIEW_REQUIRED", review_reason: "SUPPLIER_IBAN_MATCH" },
  runNo: 1,
  names: ["Havel Logistik GmbH", "Nordwerk GmbH"],
  checks: [
    check("TECHNICAL", "xml_well_formed", "PASSED", "wohlgeformtes XML", "ok", "XML ist wohlgeformt"),
    check("TECHNICAL", "official_validation", "SKIPPED", "KoSIT", "kein Validator konfiguriert", "nicht offiziell geprüft", "INFO"),
    check("BUSINESS", "supplier_known", "PASSED", "Lieferant im Stammdatenbestand", "S-1002 Havel Logistik GmbH", "zugeordnet"),
    check("BUSINESS", "supplier_iban_match", "FAILED", "DE02120300000000202051", "DE02300209000106531065",
      "IBAN weicht von den freigegebenen Bankverbindungen des Lieferanten ab (Betrugsrisiko)"),
    check("BUSINESS", "po_supplier_match", "FAILED", "S-1002 Havel Logistik GmbH", "PO-2026-0201 gehört zu S-1003",
      "Bestellung gehört zu einem anderen Lieferanten; Rückfragen an billing@havel-logistik.example"),
    check("BUSINESS", "payment_terms_match", "WARNING", "30 Tage", "14 Tage", "Zahlungsziel weicht ab", "LOW"),
    check("BUSINESS", "approval_threshold", "INFO", "Auto bis 500.00 EUR", "2499.00 EUR -> MANAGER", "Freigabestufe laut Richtlinie", "INFO"),
  ],
};

const input = (language = "de", evidence = EVIDENCE) => buildExplanationInput(evidence, language);

test("the input has exactly the agreed shape", () => {
  const sent = input();
  assert.deepEqual(Object.keys(sent), ["schema", "language", "document", "failed", "warnings", "passed", "not_checked", "allowed_next_steps"]);
  assert.deepEqual(sent.document, { kind: "INVOICE", state: "REVIEW_REQUIRED", review_reason: "SUPPLIER_IBAN_MATCH", run_no: 1 });
  assert.deepEqual(Object.keys(sent.failed[0]), ["check", "phase", "severity", "expected", "actual", "reason"]);
});

test("failed checks and warnings carry their evidence; passed and skipped ones only their name; info is left out", () => {
  const sent = input();
  assert.deepEqual(sent.failed.map((c) => c.check), ["supplier_iban_match", "po_supplier_match"]);
  assert.deepEqual(sent.warnings.map((c) => [c.check, c.expected, c.actual]), [["payment_terms_match", "30 Tage", "14 Tage"]]);
  assert.deepEqual(sent.passed, ["xml_well_formed", "supplier_known"]);
  assert.deepEqual(sent.not_checked, ["official_validation"]);
  assert.ok(!JSON.stringify(sent).includes("approval_threshold"));
});

test("an IBAN leaves only as its first and last four characters", () => {
  const sent = JSON.stringify(input());
  assert.ok(!sent.includes("DE02120300000000202051") && !sent.includes("DE02300209000106531065"));
  assert.deepEqual([input().failed[0].expected, input().failed[0].actual], ["DE02 **** 2051", "DE02 **** 1065"]);
});

test("a spaced IBAN is masked too, and a VAT id is not mistaken for one", () => {
  const evidence = { ...EVIDENCE, checks: [check("BUSINESS", "supplier_iban_match", "FAILED", "DE02 1203 0000 0000 2020 51", "DE234567890", "x")] };
  assert.deepEqual([input("de", evidence).failed[0].expected, input("de", evidence).failed[0].actual], ["DE02 **** 2051", "DE234567890"]);
});

test("names and e-mail addresses do not leave the system", () => {
  const sent = JSON.stringify(input());
  for (const secret of ["Havel Logistik GmbH", "Nordwerk GmbH", "billing@havel-logistik.example"]) assert.ok(!sent.includes(secret), secret);
  assert.equal(input().failed[1].expected, "S-1002 [Name]");
});

test("text read from a document is cleaned and cut short", () => {
  const long = `INV-1\u0007 ${"x".repeat(400)}`;
  const evidence = { ...EVIDENCE, checks: [check("BUSINESS", "duplicate_invoice_number", "FAILED", "neu", long, "doppelt")] };
  const actual = input("de", evidence).failed[0].actual;
  assert.ok(actual.length <= 240, `${actual.length}`);
  assert.ok(!/\p{Cc}/u.test(actual));
});

test("the next steps offered never move the invoice on: no accept, approve or pay", () => {
  assert.deepEqual(input().allowed_next_steps, ["verify_bank_account", "request_info", "reject"]);
  const duplicate = { ...EVIDENCE, checks: [check("BUSINESS", "duplicate_invoice_number", "FAILED", "neu", "INV-1 bereits als PAID", "doppelt")] };
  assert.deepEqual(input("de", duplicate).allowed_next_steps, ["confirm_duplicate", "request_info", "reject"]);
});

test("the input hash follows the content and the language", () => {
  assert.equal(inputSha256(input()), inputSha256(input()));
  assert.notEqual(inputSha256(input("de")), inputSha256(input("en")));
  assert.match(inputSha256(input()), /^[0-9a-f]{64}$/);
});
