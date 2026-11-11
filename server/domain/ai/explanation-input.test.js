/**
 * What an AI explanation is given (ADR-080): the failed checks' evidence, the
 * other checks by name only, and nothing else. Of the evidence, only what the
 * allowlist names leaves the system (ADR-082); no full IBAN, and no value read
 * from the document unless its check is classified as composed by the app.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExplanationInput, inputSha256 } from "./explanation-input.js";
import { OUTBOUND, WITHHELD } from "./outbound.js";
import { emittedChecks } from "../../test-support/emitted-checks.js";

const check = (phase, check_code, status, expected, actual, reason, severity = "HIGH") => ({
  phase,
  check_code,
  status,
  severity,
  expected,
  actual,
  reason,
});

const EVIDENCE = {
  invoice: { document_type: "INVOICE", state: "REVIEW_REQUIRED", review_reason: "SUPPLIER_IBAN_MATCH" },
  runNo: 1,
  names: ["Havel Logistik GmbH", "Nordwerk GmbH"],
  checks: [
    check("TECHNICAL", "xml_well_formed", "PASSED", "wohlgeformtes XML", "ok", "XML ist wohlgeformt"),
    check("TECHNICAL", "official_validation", "SKIPPED", "KoSIT", "kein Validator konfiguriert", "nicht offiziell geprüft", "INFO"),
    check("BUSINESS", "supplier_known", "PASSED", "Lieferant im Stammdatenbestand", "S-1002 Havel Logistik GmbH", "zugeordnet"),
    check(
      "BUSINESS",
      "supplier_iban_match",
      "FAILED",
      "DE02120300000000202051",
      "DE02300209000106531065",
      "IBAN weicht von den freigegebenen Bankverbindungen des Lieferanten ab (Betrugsrisiko)",
    ),
    check(
      "BUSINESS",
      "po_supplier_match",
      "FAILED",
      "S-1002 Havel Logistik GmbH",
      "PO-2026-0201 gehört zu S-1003",
      "Bestellung gehört zu einem anderen Lieferanten; Rückfragen an billing@havel-logistik.example",
    ),
    check("BUSINESS", "payment_terms_match", "WARNING", "30 Tage", "14 Tage", "Zahlungsziel weicht ab", "LOW"),
    check(
      "BUSINESS",
      "approval_threshold",
      "INFO",
      "Auto bis 500.00 EUR",
      "2499.00 EUR -> MANAGER",
      "Freigabestufe laut Richtlinie",
      "INFO",
    ),
  ],
};

const input = (language = "de", evidence = EVIDENCE) => buildExplanationInput(evidence, language);

test("the input has exactly the agreed shape", () => {
  const sent = input();
  assert.deepEqual(Object.keys(sent), [
    "schema",
    "language",
    "document",
    "failed",
    "warnings",
    "passed",
    "not_checked",
    "allowed_next_steps",
  ]);
  assert.deepEqual(sent.document, { kind: "INVOICE", state: "REVIEW_REQUIRED", review_reason: "SUPPLIER_IBAN_MATCH", run_no: 1 });
  assert.deepEqual(Object.keys(sent.failed[0]), ["check", "phase", "severity", "expected", "actual", "reason"]);
});

test("failed checks and warnings carry their evidence; passed and skipped ones only their name; info is left out", () => {
  const sent = input();
  assert.deepEqual(
    sent.failed.map((c) => c.check),
    ["supplier_iban_match", "po_supplier_match"],
  );
  assert.deepEqual(
    sent.warnings.map((c) => [c.check, c.expected, c.actual]),
    [["payment_terms_match", "30 Tage", "14 Tage"]],
  );
  assert.deepEqual(sent.passed, ["xml_well_formed", "supplier_known"]);
  assert.deepEqual(sent.not_checked, ["official_validation"]);
  assert.ok(!JSON.stringify(sent).includes("approval_threshold"));
});

test("an IBAN leaves only as its first and last four characters", () => {
  const sent = JSON.stringify(input());
  assert.ok(!sent.includes("DE02120300000000202051") && !sent.includes("DE02300209000106531065"));
  assert.deepEqual([input().failed[0].expected, input().failed[0].actual], ["DE02 **** 2051", "DE02 **** 1065"]);
});

test("a spaced IBAN is masked too, and a value that is not an IBAN is not sent at all", () => {
  const evidence = {
    ...EVIDENCE,
    checks: [check("BUSINESS", "supplier_iban_match", "FAILED", "DE02 1203 0000 0000 2020 51", "DE234567890", "x")],
  };
  assert.deepEqual([input("de", evidence).failed[0].expected, input("de", evidence).failed[0].actual], ["DE02 **** 2051", WITHHELD]);
});

test("names and e-mail addresses do not leave the system", () => {
  const sent = JSON.stringify(input());
  for (const secret of ["Havel Logistik GmbH", "Nordwerk GmbH", "billing@havel-logistik.example"])
    assert.ok(!sent.includes(secret), secret);
});

test("a supplier relationship is described, never identified: no supplier number, name or VAT id", () => {
  const evidence = {
    ...EVIDENCE,
    checks: [
      check(
        "BUSINESS",
        "supplier_known",
        "FAILED",
        "bekannte USt-IdNr. oder eindeutiger Firmenname",
        "DE777777777 / Ein Einzelunternehmer",
        "USt-IdNr. der Rechnung ist keinem Lieferanten zugeordnet",
      ),
      check(
        "BUSINESS",
        "po_supplier_match",
        "FAILED",
        "S-1002 Havel Logistik GmbH",
        "PO-2026-0303 gehört zu S-1003 Spree IT-Systeme AG",
        "Bestellung gehört zu einem anderen Lieferanten",
      ),
    ],
  };
  const [unknown, otherOrder] = input("de", evidence).failed;
  assert.deepEqual([unknown.expected, unknown.actual], ["Lieferant im Stammdatenbestand", "keine eindeutige Zuordnung"]);
  assert.deepEqual([otherOrder.expected, otherOrder.actual], ["Bestellung des Rechnungsstellers", "Bestellung eines anderen Lieferanten"]);
  assert.equal(unknown.reason, "USt-IdNr. der Rechnung ist keinem Lieferanten zugeordnet", "the reason still says why");
  assert.doesNotMatch(JSON.stringify(input("de", evidence)), /S-100\d|DE777777777|Einzelunternehmer|Spree|Havel/);
});

test("text that is sent is still cleaned and cut short", () => {
  const long = `fehlt: Zahlbetrag\u0007 ${"x".repeat(400)}`;
  const evidence = { ...EVIDENCE, checks: [check("TECHNICAL", "required_fields_present", "FAILED", "alle", long, "fehlt")] };
  const actual = input("de", evidence).failed[0].actual;
  assert.ok(actual.length <= 240, `${actual.length}`);
  assert.ok(!/\p{Cc}/u.test(actual));
});

test("the next steps offered never move the invoice on: no accept, approve or pay", () => {
  assert.deepEqual(input().allowed_next_steps, ["verify_bank_account", "request_info", "reject"]);
  const duplicate = {
    ...EVIDENCE,
    checks: [check("BUSINESS", "duplicate_invoice_number", "FAILED", "neu", "INV-1 bereits als PAID", "doppelt")],
  };
  assert.deepEqual(input("de", duplicate).allowed_next_steps, ["confirm_duplicate", "request_info", "reject"]);
});

test("the input hash follows the content and the language", () => {
  assert.equal(inputSha256(input()), inputSha256(input()));
  assert.notEqual(inputSha256(input("de")), inputSha256(input("en")));
  assert.match(inputSha256(input()), /^[0-9a-f]{64}$/);
});

// --- the outbound allowlist (ADR-082) -----------------------------------------

test("a value repeated from the document is replaced by what it establishes, not sent", () => {
  const planted = "Max Mustermann, Privatweg 8, +49 30 1234567";
  const evidence = {
    ...EVIDENCE,
    checks: [
      check(
        "TECHNICAL",
        "amounts_numeric",
        "FAILED",
        "Dezimalzahlen mit Punkt",
        `payable=${planted}`,
        "Beträge oder Mengen sind nicht numerisch",
      ),
      check(
        "BUSINESS",
        "duplicate_invoice_number",
        "FAILED",
        "Rechnungsnummer noch nicht erfasst",
        `${planted} bereits als PAID`,
        "doppelt",
      ),
      check(
        "TECHNICAL",
        "official_validation",
        "FAILED",
        "KoSIT: annehmbar",
        "nicht annehmbar: 1 Fehler (cvc-datatype-valid.1.2.1)",
        `KoSIT: '${planted}' is not a valid value for 'decimal'.`,
      ),
    ],
  };
  const [amounts, duplicate, official] = input("de", evidence).failed;
  assert.deepEqual([amounts.actual, amounts.reason], [WITHHELD, "Beträge oder Mengen sind nicht numerisch"]);
  assert.equal(duplicate.actual, "Rechnungsnummer desselben Lieferanten bereits im Bestand");
  assert.equal(official.actual, "nicht annehmbar: 1 Fehler (cvc-datatype-valid.1.2.1)", "the rule codes are sent");
  assert.doesNotMatch(JSON.stringify(input("de", evidence)), /Mustermann|Privatweg|1234567/);
});

test("a check nobody has classified sends none of its evidence", () => {
  const evidence = {
    ...EVIDENCE,
    checks: [check("BUSINESS", "a_check_added_later", "FAILED", "Max Muster", "Privatweg 8", "Tel. 030 1234567")],
  };
  const [sent] = input("de", evidence).failed;
  assert.deepEqual([sent.check, sent.expected, sent.actual, sent.reason], ["a_check_added_later", WITHHELD, WITHHELD, WITHHELD]);
});

test("every check that can fail or warn is classified in the allowlist, and nothing else is", () => {
  const reported = emittedChecks()
    .filter((key) => /:(FAILED|WARNING)$/.test(key))
    .map((key) => key.split(":")[0]);
  const unclassified = [...new Set(reported)].filter((code) => !(code in OUTBOUND));
  assert.deepEqual(unclassified, [], `decide in outbound.js what these may send: ${unclassified.join(", ")}`);
  const stale = Object.keys(OUTBOUND).filter((code) => !reported.includes(code));
  assert.deepEqual(stale, [], `these checks no longer fail or warn: ${stale.join(", ")}`);
});
