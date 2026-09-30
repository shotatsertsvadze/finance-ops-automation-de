/**
 * The deterministic check every AI explanation must pass before anyone sees
 * it (ADR-080). The five evaluation scenarios in `fixtures/ai/` each carry
 * answers that must be accepted and answers that must be refused, with the
 * rule that refuses them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyExplanation } from "./grounding.js";
import { SCENARIOS, scenarioFixture } from "../../test-support/ai-scenarios.js";

const inLanguage = (input, language) => ({ ...input, language });
const rules = (result) => result.reasons.map((r) => r.rule);

for (const name of Object.keys(SCENARIOS)) {
  const { input, good, bad } = scenarioFixture(name);

  test(`${name}: a grounded explanation is accepted, in German and in English`, () => {
    for (const output of good) {
      const result = verifyExplanation(inLanguage(input, output.language), output);
      assert.deepEqual(result, { accepted: true, reasons: [] }, `${output.language}: ${JSON.stringify(result.reasons)}`);
    }
  });

  for (const { why, rule, output } of bad) {
    test(`${name}: refused, ${why} (${rule})`, () => {
      const result = verifyExplanation(input, output);
      assert.equal(result.accepted, false);
      assert.ok(rules(result).includes(rule), `expected ${rule}, got ${JSON.stringify(result.reasons)}`);
    });
  }
}

const { input: IBAN_INPUT, good: [GOOD] } = scenarioFixture("1_iban_mismatch");
const verify = (changes) => verifyExplanation(IBAN_INPUT, { ...GOOD, ...changes });

test("anything that is not an object with exactly the agreed fields is refused", () => {
  for (const output of [null, "text", [], {}, { summary: "x" }]) {
    assert.deepEqual(rules(verifyExplanation(IBAN_INPUT, output)), ["SCHEMA"], JSON.stringify(output));
  }
});

test("empty, overlong or wrongly typed fields are refused", () => {
  for (const changes of [
    { summary: "" }, { summary: "x".repeat(201) }, { explanation: " " }, { explanation: "x".repeat(701) },
    { failed_checks: "supplier_iban_match" }, { cited_checks: [1] }, { cited_checks: ["supplier_iban_match", "supplier_iban_match"] },
    { next_step: 3 },
  ]) {
    assert.ok(rules(verify(changes)).includes("SCHEMA"), JSON.stringify(changes));
  }
});

test("a date, number or identifier the evidence does not contain is refused, in any notation", () => {
  for (const text of ["Fällig am 2026-10-01.", "Fällig am 01.10.2026.", "Es geht um 2.499,00 EUR.", "Es geht um 2,499.00 EUR.", "Lieferant S-1002.", "Konto DE44 **** 1065."]) {
    assert.ok(rules(verify({ explanation: text })).includes("UNGROUNDED"), text);
  }
});

test("a figure from the evidence may be written the German or the English way", () => {
  const { input, good: [german] } = scenarioFixture("2_po_overrun");
  for (const amount of ["8500.00", "8.500,00", "8,500.00", "8500"]) {
    const result = verifyExplanation(input, { ...german, explanation: `Nettobetrag ${amount} EUR.` });
    assert.deepEqual(result.reasons, [], amount);
  }
});

test("no contact route of any kind", () => {
  for (const text of ["Schreiben Sie an info@lieferant.example.", "Siehe www.lieferant.example.", "Telefon +49 30 55512."]) {
    assert.ok(rules(verify({ explanation: text })).includes("CONTACT"), text);
  }
});

test("decision language is refused in either language, whatever the requested one", () => {
  for (const text of ["Die Rechnung ist unbedenklich.", "The invoice can be approved.", "It is safe to pay.", "Bitte die Rechnung freigeben."]) {
    assert.ok(rules(verify({ explanation: text })).includes("DECISION"), text);
  }
});

test("a trusted account may still be called approved or freigegeben: only a decision about the invoice is refused", () => {
  assert.deepEqual(verify({ explanation: "Die IBAN gehört nicht zu den freigegebenen Bankverbindungen." }).reasons, []);
});

test("saying the money moved needs the evidence to say so", () => {
  assert.ok(rules(verify({ explanation: "Die Rechnung wurde bereits überwiesen." })).includes("PAYMENT_CLAIM"));
  const paid = { ...IBAN_INPUT, failed: [{ ...IBAN_INPUT.failed[0], actual: "INV-7 bereits als PAID" }] };
  assert.deepEqual(verifyExplanation(paid, { ...GOOD, explanation: "INV-7 ist bereits bezahlt." }).reasons, []);
});
