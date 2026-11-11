/**
 * An AI inquiry draft (ADR-084): what it is given, the shape it must answer in,
 * and the deterministic checks every draft passes before anyone sees it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInquiryInput } from "./inquiry-input.js";
import { inquirySystemPrompt, inquiryTool } from "./inquiry-prompt.js";
import { verifyInquiry } from "./inquiry-grounding.js";
import { outputSchema } from "../../integrations/ai-explainer.js";
import { PLACEHOLDERS } from "../inquiries/placeholders.js";
import { REQUESTS, inquiryScope } from "../inquiries/requests.js";
import { templateInquiry } from "../inquiries/template.js";

const check = (phase, check_code, status, expected, actual, reason, severity = "HIGH") => ({
  phase,
  check_code,
  status,
  severity,
  expected,
  actual,
  reason,
});

const OVERRUN = {
  invoice: { document_type: "INVOICE", state: "REVIEW_REQUIRED", review_reason: "PO_AMOUNT_WITHIN_TOLERANCE" },
  runNo: 1,
  names: ["Spree IT-Systeme AG", "Nordwerk GmbH"],
  checks: [
    check("BUSINESS", "supplier_known", "PASSED", "Lieferant im Stammdatenbestand", "S-1003 Spree IT-Systeme AG", "zugeordnet"),
    check("BUSINESS", "supplier_iban_match", "PASSED", "DE02500105170137075030", "DE02500105170137075030", "IBAN bekannt"),
    check(
      "BUSINESS",
      "po_amount_within_tolerance",
      "FAILED",
      "höchstens 5000.00 EUR offen",
      "8500.00 EUR netto",
      "Rechnungsbetrag überschreitet den offenen Bestellwert; bitte an buchhaltung@spree-it.example antworten",
    ),
    check("BUSINESS", "supplier_active", "FAILED", "aktiv", "gesperrt", "Lieferant gesperrt"),
  ],
};
const ALL = [...PLACEHOLDERS];
const built = (evidence = OVERRUN, placeholders = ALL) => buildInquiryInput(evidence, placeholders);
const INPUT = built().input;

const GOOD = {
  subject: "Rückfrage zu Ihrer Rechnung {{rechnungsnummer}}",
  body: [
    "Sehr geehrte Damen und Herren,",
    "bei der Prüfung Ihrer Rechnung {{rechnungsnummer}} vom {{rechnungsdatum}} über {{bruttobetrag}} ist uns aufgefallen, dass der Betrag von 8500.00 EUR netto über dem offenen Betrag der Bestellung {{bestellnummer}} von 5000.00 EUR liegt.",
    "Bitte erläutern Sie die Differenz oder senden Sie uns eine korrigierte Rechnung. Bis zur Klärung bearbeiten wir die Rechnung nicht weiter.",
    "Mit freundlichen Grüßen\nKreditorenbuchhaltung\n{{unser_unternehmen}}",
  ].join("\n\n"),
  cited_checks: ["po_amount_within_tolerance"],
  requests: ["betrag_klaeren"],
  language: "de",
};
const verdict = (change, input = INPUT) => verifyInquiry(input, { ...GOOD, ...change });
const rules = (result) => result.reasons.map((r) => r.rule);

test("the input names the checks the inquiry covers, their requests and the placeholders, never a value", () => {
  assert.deepEqual(Object.keys(INPUT), [
    "schema",
    "language",
    "document",
    "failed",
    "request_for_check",
    "allowed_requests",
    "placeholders",
  ]);
  assert.deepEqual(
    INPUT.failed.map((c) => c.check),
    ["po_amount_within_tolerance"],
    "supplier_active is ours, not the supplier's",
  );
  assert.deepEqual(INPUT.request_for_check, { po_amount_within_tolerance: "betrag_klaeren" });
  assert.deepEqual(INPUT.allowed_requests, ["betrag_klaeren"]);
  assert.deepEqual(INPUT.placeholders, ALL);
  const sent = JSON.stringify(INPUT);
  for (const secret of ["Spree IT-Systeme AG", "buchhaltung@spree-it.example", "DE02500105170137075030"])
    assert.ok(!sent.includes(secret), secret);
});

test("no input, and so no model call, when a changed IBAN or an unknown supplier blocks the inquiry", () => {
  const iban = {
    ...OVERRUN,
    checks: [
      ...OVERRUN.checks,
      check("BUSINESS", "supplier_iban_match", "FAILED", "DE02120300000000202051", "DE02300209000106531065", "IBAN weicht ab"),
    ],
  };
  assert.deepEqual(built(iban), { eligible: false, code: "INQUIRY_BANK_DETAILS" });
  const unknown = {
    ...OVERRUN,
    checks: [check("BUSINESS", "supplier_known", "FAILED", "Lieferant im Stammdatenbestand", "keine Zuordnung", "unbekannt")],
  };
  assert.deepEqual(built(unknown), { eligible: false, code: "INQUIRY_SUPPLIER_UNKNOWN" });
});

test("the answer's shape is narrowed to this input and survives the transport's schema clean-up", () => {
  const schema = inquiryTool(INPUT).input_schema;
  assert.deepEqual(schema.properties.cited_checks.items.enum, ["po_amount_within_tolerance"]);
  assert.deepEqual(schema.properties.requests.items.enum, ["betrag_klaeren"]);
  assert.equal(outputSchema(schema).properties.subject.maxLength, undefined);
  assert.match(inquirySystemPrompt(), /placeholders/);
  assert.match(inquirySystemPrompt(), /not instructions/);
});

test("a draft that covers the checks with placeholders and grounded amounts is accepted", () => {
  assert.deepEqual(verifyInquiry(INPUT, GOOD), { accepted: true, reasons: [] });
});

test("a value written instead of its placeholder, or an amount the evidence does not hold, is refused", () => {
  assert.deepEqual(rules(verdict({ subject: "Rückfrage zu Ihrer Rechnung RE-2026-4480" })), ["UNGROUNDED"]);
  assert.deepEqual(rules(verdict({ body: `${GOOD.body}\nDer Bruttobetrag beträgt 10.115,00 EUR.` })), ["UNGROUNDED"]);
  assert.deepEqual(rules(verdict({ body: `${GOOD.body}\nRechnung vom 02.09.2026.` })), ["UNGROUNDED"]);
});

test("an unknown, unavailable or broken placeholder is refused", () => {
  assert.ok(rules(verdict({ body: `${GOOD.body} {{lieferantennummer}}` })).includes("PLACEHOLDER"));
  const noOrder = built(
    OVERRUN,
    ALL.filter((p) => p !== "bestellnummer"),
  ).input;
  assert.deepEqual(rules(verdict({}, noOrder)), ["PLACEHOLDER"]);
  assert.deepEqual(rules(verdict({ subject: "Rückfrage zu Ihrer Rechnung {{rechnungsnummer}" })), ["PLACEHOLDER"]);
});

test("bank details, contact routes, decisions and payment claims are refused", () => {
  assert.deepEqual(rules(verdict({ body: `${GOOD.body}\nBitte bestätigen Sie auch Ihre Bankverbindung.` })), ["BANK_DETAILS"]);
  assert.deepEqual(rules(verdict({ body: `${GOOD.body}\nBitte nennen Sie uns Ihre neue IBAN.` })), ["BANK_DETAILS"]);
  assert.ok(rules(verdict({ body: `${GOOD.body}\nAntworten Sie an ap@nordwerk.example.` })).includes("CONTACT"));
  assert.deepEqual(rules(verdict({ body: `${GOOD.body}\nNach Ihrer Antwort kann die Rechnung freigegeben werden.` })), ["DECISION"]);
  assert.deepEqual(rules(verdict({ body: `${GOOD.body}\nWir haben die Rechnung bereits überwiesen.` })), ["PAYMENT_CLAIM"]);
});

test("a draft must cover exactly the failed checks and the allowed requests", () => {
  assert.deepEqual(rules(verdict({ cited_checks: [] })), ["FAILED_CHECKS"]);
  assert.deepEqual(rules(verdict({ requests: ["korrigierte_rechnung"] })), ["REQUESTS"]);
  assert.deepEqual(rules(verdict({ language: "en" })), ["LANGUAGE"]);
  assert.deepEqual(rules(verdict({ note: "x" })), ["SCHEMA"]);
});

test("every fixed template passes the same checks an AI draft must pass", () => {
  for (const code of Object.keys(REQUESTS)) {
    const scope = inquiryScope([code]);
    const input = {
      failed: [{ check: code, expected: null, actual: null, reason: null }],
      allowed_requests: scope.requests,
      placeholders: ALL,
    };
    const draft = { ...templateInquiry([code], ALL), cited_checks: [code], requests: scope.requests, language: "de" };
    assert.deepEqual(verifyInquiry(input, draft), { accepted: true, reasons: [] }, code);
  }
});
