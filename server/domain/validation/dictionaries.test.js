/**
 * The English dictionary is a translation of German text the server produces.
 * That is only safe if it cannot silently fall behind, so these tests read the
 * server's own source and the shared state machine and fail when something is
 * added without an English label.
 *
 * Lives on the server side deliberately: it guards a client file against
 * server changes, and `npm test` runs it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DICTIONARIES, auditReason, checkSentence, translateTerms } from "../../../client/src/lib/dictionaries.js";
import { STATES } from "../workflow/states.js";
import { PERMISSIONS } from "../../auth/authorize.js";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

/**
 * Every `passed("code", …)` / `failed(…)` / … the checks can emit, including
 * the case where the code is chosen into a variable first:
 *   const check = error.code === "NOT_WELL_FORMED" ? "xml_well_formed" : "format_recognised";
 *   checks.push(failed(check, …));
 * Missing that form would have wrongly reported a correct entry as stale.
 */
function emittedChecks() {
  const files = [source("./business-checks.js"), source("../invoice/technical-validation.js")];
  const pairs = new Set();
  for (const text of files) {
    for (const [, fn, code] of text.matchAll(/\b(passed|failed|warning|skipped|info)\("([a-z_]+)"/g)) {
      pairs.add(`${code}:${fn.toUpperCase()}`);
    }
    for (const [, fn, name] of text.matchAll(/\b(passed|failed|warning|skipped|info)\(([a-zA-Z_$][\w$]*),/g)) {
      const assignment = text.match(new RegExp(`\\b(?:const|let)\\s+${name}\\s*=([^;]*);`));
      if (!assignment) continue;
      for (const [, code] of assignment[1].matchAll(/"([a-z_]+)"/g)) pairs.add(`${code}:${fn.toUpperCase()}`);
    }
  }
  return [...pairs].sort();
}

test("every check the server can emit has English text", () => {
  const missing = emittedChecks().filter((key) => !(key in DICTIONARIES.en.check));
  assert.deepEqual(missing, [], `add these to the English check dictionary: ${missing.join(", ")}`);
});

test("the English check dictionary has no entries for checks that do not exist", () => {
  const emitted = new Set(emittedChecks());
  const stale = Object.keys(DICTIONARIES.en.check).filter((key) => !emitted.has(key));
  assert.deepEqual(stale, [], `these no longer exist and should be removed: ${stale.join(", ")}`);
});

test("every invoice state has a label in both languages", () => {
  for (const [lang, dict] of Object.entries(DICTIONARIES)) {
    const missing = STATES.filter((state) => !dict.state[state]);
    assert.deepEqual(missing, [], `${lang} is missing state labels: ${missing.join(", ")}`);
  }
});

test("every role has a label in both languages", () => {
  const roles = [...new Set(Object.values(PERMISSIONS).flat())];
  for (const [lang, dict] of Object.entries(DICTIONARIES)) {
    const missing = roles.filter((role) => !dict.role[role]);
    assert.deepEqual(missing, [], `${lang} is missing role labels: ${missing.join(", ")}`);
  }
});

test("every audit action the server writes has a label in both languages", () => {
  const files = [
    "../workflow/transitions.js", "../intake/intake.js", "../approvals/approvals.js",
    "../accounting/accounting.js", "../payments/payments.js", "../reconciliation/reconciliation.js",
  ];
  const actions = new Set();
  for (const path of files) {
    for (const [, action] of source(path).matchAll(/action: "([a-z_]+)"/g)) actions.add(action);
  }
  assert.ok(actions.size > 10, "the scan found actions at all");
  for (const [lang, dict] of Object.entries(DICTIONARIES)) {
    const missing = [...actions].filter((a) => !dict.action[a]);
    assert.deepEqual(missing, [], `${lang} is missing action labels: ${missing.join(", ")}`);
  }
});

test("the two dictionaries carry the same keys", () => {
  for (const group of ["ui", "state", "reviewReason", "action", "matchReason", "role"]) {
    const de = Object.keys(DICTIONARIES.de[group]).sort();
    const en = Object.keys(DICTIONARIES.en[group]).sort();
    assert.deepEqual(en, de, `the ${group} groups differ`);
  }
});

test("the English dictionary carries no German text", () => {
  const walk = (value, path) => {
    if (typeof value === "string") {
      assert.ok(!/[äöüßÄÖÜ]/.test(value), `German characters left in en.${path}: ${value}`);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
    }
  };
  // `terms` maps German to English, so only its right-hand side is checked.
  const { terms, ...rest } = DICTIONARIES.en;
  walk(rest, "");
  for (const [, english] of terms) assert.ok(!/[äöüßÄÖÜ]/.test(english), `German left in a term: ${english}`);
});

test("a check with no English entry still shows the server's sentence", () => {
  const result = { check_code: "erfundene_pruefung", status: "FAILED", reason: "Servertext" };
  assert.equal(checkSentence(DICTIONARIES.en, result), "Servertext");
  assert.equal(checkSentence(DICTIONARIES.de, result), "Servertext");
});

test("German connecting words inside expected and actual are translated", () => {
  const actual = translateTerms(DICTIONARIES.en, "<= 190.67 EUR (verfügbar 180.67 + Toleranz 2 %, davon 319.33 EUR durch andere Rechnungen gebunden)");
  assert.ok(!/[äöüßÄÖÜ]/.test(actual), `still German: ${actual}`);
  assert.match(actual, /available 180\.67/);
  assert.match(actual, /committed by other invoices/);
});

test("German mode leaves the server's text alone", () => {
  const text = "Nettobetrag überschreitet den offenen Bestellwert";
  assert.equal(translateTerms(DICTIONARIES.de, text), text);
});

test("every audit reason the server writes is translated, with nothing German left", () => {
  // The prose forms `transitions.js` and its callers produce, with the
  // variable parts filled in as they appear in the database.
  const reasons = [
    "Eingang über EMAIL",
    "Eingang über UPLOAD",
    "Buchungssatz BELEG-2026-00001",
    "Zahlung 1330.84 EUR angewiesen",
    "Zahlung bestätigt (MOCK-pay:1816f252)",
    "Freigabe durch MANAGER laut Betragsstufe",
    "Freigabe durch MANAGER + FINANCE laut Betragsstufe",
    "Bruttobetrag innerhalb der Auto-Grenze (500 EUR), alle Prüfungen bestanden",
    "SUPPLIER_IBAN_MATCH",
  ];
  for (const reason of reasons) {
    const english = auditReason(DICTIONARIES.en, reason);
    assert.ok(!/[äöüßÄÖÜ]/.test(english), `not translated: ${reason} -> ${english}`);
  }
  assert.match(auditReason(DICTIONARIES.en, "Eingang über EMAIL"), /^Received via EMAIL$/);
  assert.match(auditReason(DICTIONARIES.en, "Zahlung 1330.84 EUR angewiesen"), /^Payment of 1330\.84 EUR instructed$/);
  assert.equal(auditReason(DICTIONARIES.en, "SUPPLIER_IBAN_MATCH"), "IBAN differs from master data");
});

test("a comment a person typed is left in their own words", () => {
  // Rewriting someone's entry in an audit trail would be worse than showing
  // German to an English reader.
  const comment = "Mit Lieferant telefonisch geklärt";
  assert.equal(auditReason(DICTIONARIES.en, comment), comment);
});
