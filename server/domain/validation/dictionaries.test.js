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
import { readFileSync, readdirSync } from "node:fs";
import { DICTIONARIES, auditReason, checkSentence, errorText, translateTerms } from "../../../client/src/lib/dictionaries.js";
import { STATES } from "../workflow/states.js";
import { CHANGE_STATES } from "../bank-changes/rules.js";
import { PERMISSIONS } from "../../auth/authorize.js";
import { SOURCE_TYPES } from "../kpi/provenance.js";
import { NEXT_STEPS } from "../ai/explanation-input.js";
import { emittedChecks } from "../../test-support/emitted-checks.js";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const businessCheckSources = () => [source("./business-checks.js"), source("./tax-breakdown.js")].join("\n");

test("every check the server can emit has English text", () => {
  const missing = emittedChecks().filter((key) => !(key in DICTIONARIES.en.check));
  assert.deepEqual(missing, [], `add these to the English check dictionary: ${missing.join(", ")}`);
});

test("the English check dictionary has no entries for checks that do not exist", () => {
  const emitted = new Set(emittedChecks());
  const stale = Object.keys(DICTIONARIES.en.check).filter((key) => !emitted.has(key));
  assert.deepEqual(stale, [], `these no longer exist and should be removed: ${stale.join(", ")}`);
});

/**
 * Routing names a review after the check that led to it, upper-cased
 * (`decide.js`). Every HIGH or MEDIUM business failure can therefore become a
 * review reason, and a missing label shows the reviewer a bare code in the
 * panel that is supposed to tell them what stopped the invoice. Adding a check
 * without adding its reason is easy to miss, so it is scanned rather than
 * remembered.
 */
function leadingChecks() {
  const text = businessCheckSources();
  return [...new Set(
    [...text.matchAll(/\bfailed\("([a-z_]+)", SEVERITY\.(?:HIGH|MEDIUM)/g)].map(([, code]) => code.toUpperCase()),
  )].sort();
}

test("every check that can stop an invoice has a review reason in both languages", () => {
  const codes = leadingChecks();
  assert.ok(codes.length > 5, `the scan found the checks at all: ${codes.length}`);
  for (const [lang, dict] of Object.entries(DICTIONARIES)) {
    const missing = codes.filter((code) => !dict.reviewReason[code]);
    assert.deepEqual(missing, [], `${lang} is missing review reasons: ${missing.join(", ")}`);
  }
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
    "../accounting/accounting.js", "../accounting/credit-notes.js", "../accounting/netting.js",
    "../payments/payments.js", "../reconciliation/reconciliation.js",
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

test("every bank-account change state and event has a label in both languages", () => {
  const events = new Set();
  for (const path of ["../bank-changes/changes.js", "../bank-changes/revalidation.js"]) {
    for (const [, action] of source(path).matchAll(/action: "([a-z_]+)"/g)) events.add(action);
  }
  assert.ok(events.size >= 6, "the scan found the change events");
  for (const [lang, dict] of Object.entries(DICTIONARIES)) {
    assert.deepEqual(CHANGE_STATES.filter((s) => !dict.changeState?.[s]), [], `${lang} is missing change states`);
    assert.deepEqual([...events].filter((a) => !dict.changeAction?.[a]), [], `${lang} is missing change events`);
  }
});

test("every source a dashboard figure can name has a label and an explanation in both languages", () => {
  for (const [lang, dict] of Object.entries(DICTIONARIES)) {
    assert.deepEqual(SOURCE_TYPES.filter((type) => !dict.source?.[type]), [], `${lang} is missing source labels`);
    assert.deepEqual(SOURCE_TYPES.filter((type) => !dict.sourceExplanation?.[type]), [], `${lang} is missing source explanations`);
    assert.ok(dict.ui.sourceNotMeasured, `${lang} says when nothing is measured`);
  }
  assert.equal(DICTIONARIES.de.ui.sourceNotMeasured, "Nicht gemessen");
  assert.equal(DICTIONARIES.en.ui.sourceNotMeasured, "Not measured");
});

test("every next step an AI explanation may suggest is labelled as the button it names, in both languages", () => {
  const button = { verify_bank_account: "proposeBankAccount", request_info: "requestInfo", confirm_duplicate: "confirmDuplicate", reject: "reject" };
  assert.deepEqual(Object.keys(button).sort(), [...NEXT_STEPS].sort());
  for (const [lang, dict] of Object.entries(DICTIONARIES)) {
    for (const step of NEXT_STEPS) assert.equal(dict.aiStep?.[step], dict.ui[button[step]], `${lang} ${step}`);
  }
});

test("an AI explanation is labelled as a suggestion, never a decision, in both languages", () => {
  assert.equal(DICTIONARIES.de.ui.aiBadge, "KI-generierter Vorschlag – keine Entscheidung");
  assert.equal(DICTIONARIES.en.ui.aiBadge, "AI-generated suggestion – not a decision");
  assert.equal(DICTIONARIES.de.ui.aiUnavailable, "Keine KI-Erklärung verfügbar");
  assert.equal(DICTIONARIES.en.ui.aiUnavailable, "No AI explanation available");
});

/** The values of a database enum, read from the migration that creates it. */
function enumValues(type) {
  for (const file of readdirSync(new URL("../../../db/migrations/", import.meta.url))) {
    const match = source(`../../../db/migrations/${file}`).match(new RegExp(`create type finops\\.${type} as enum \\(([^)]*)\\)`));
    if (match) return [...match[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
  }
  throw new Error(`enum ${type} not found`);
}

test("every check status, severity, approval-step status and payment status has a label in both languages", () => {
  for (const [group, type] of [["checkStatus", "check_status"], ["severity", "check_severity"], ["stepStatus", "approval_step_status"], ["paymentStatus", "payment_status"]]) {
    const values = enumValues(type);
    assert.ok(values.length >= 3, type);
    for (const [lang, dict] of Object.entries(DICTIONARIES)) {
      assert.deepEqual(values.filter((v) => !dict[group]?.[v]), [], `${lang} ${group}`);
    }
  }
});

test("the intake channels the system writes have a label in both languages", () => {
  for (const dict of Object.values(DICTIONARIES)) assert.ok(dict.channel.UPLOAD && dict.channel.EMAIL);
  assert.equal(DICTIONARIES.de.channel.EMAIL, "E-Mail");
});

test("codes inside a stored audit reason or evidence text are named in the reader's language", () => {
  const { de, en } = DICTIONARIES;
  assert.equal(translateTerms(de, "Eingang über EMAIL"), "Eingang über E-Mail");
  assert.equal(translateTerms(de, "Freigabe durch MANAGER + FINANCE laut Betragsstufe"), "Freigabe durch Kostenstellenleitung + Finanzen laut Betragsstufe");
  assert.equal(translateTerms(de, "2499.00 EUR -> MANAGER+FINANCE"), "2499.00 EUR -> Kostenstellenleitung+Finanzen");
  assert.equal(translateTerms(en, "Eingang über UPLOAD"), "Received via Upload");
  assert.equal(translateTerms(en, "Freigabe durch MANAGER laut Betragsstufe"), "Approval by Cost centre manager per amount tier");
  assert.equal(translateTerms(de, "Lieferant ist BLOCKED"), "Lieferant ist BLOCKED", "only roles and channels are codes it names");
});

test("the two dictionaries carry the same keys", () => {
  for (const group of ["ui", "state", "reviewReason", "action", "matchReason", "role", "error", "changeState", "changeAction", "source", "sourceExplanation", "aiStep", "checkStatus", "severity", "stepStatus", "paymentStatus", "channel"]) {
    const de = Object.keys(DICTIONARIES.de[group]).sort();
    const en = Object.keys(DICTIONARIES.en[group]).sort();
    assert.deepEqual(en, de, `the ${group} groups differ`);
  }
});

/**
 * Distinctive German words that no English entry would contain. The umlaut
 * test alone passes anything written in German without one — "Freigabeschritt"
 * slipped through a deliberate mutation — so the obvious vocabulary is checked
 * as well. This is a tripwire, not language detection: it catches a slip, it
 * does not prove the text is English. Words spelled the same in both languages,
 * such as "Status", are deliberately absent: they would only fire falsely.
 */
const GERMAN_WORDS = /\b(Rechnung\w*|Freigabe\w*|Lieferant\w*|Betrag\w*|Zahlung\w*|Bestellung\w*|Buchung\w*|Prüf\w*|nicht|kein\w*|und|oder|wurde|bereits|erforderlich)\b/i;

test("the English dictionary carries no German characters or obvious German words", () => {
  // Parameterised entries are functions, so they are called with a probe
  // before being checked: skipping them would leave half the English text
  // unexamined, which is where the German would survive.
  const probe = { step_no: 1, state: "APPROVED", from: "APPROVED", to: "PAID", role: "FINANCE", required_role: "MANAGER", n: 1 };
  const walk = (value, path) => {
    const check = (text, where) => {
      assert.ok(!/[äöüßÄÖÜ]/.test(text), `German characters left in en.${where}: ${text}`);
      assert.ok(!GERMAN_WORDS.test(text), `a German word left in en.${where}: ${text}`);
    };
    if (typeof value === "function") {
      check(String(value(probe, 2, "MANAGER")), path);
      return;
    }
    if (typeof value === "string") {
      check(value, path);
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

test("the totals chain reads in English, link by link", () => {
  // The evidence a reviewer needs most: which link of the calculation broke.
  const evidence = [
    "Positionen - Nachlässe + Zuschläge = Netto; Netto + Steuer - Anzahlung = Zahlbetrag",
    "Positionen = Summe der Positionen: 1000.00 != 900.00",
    "Nachlässe einzeln = Nachlässe gesamt: 200.00 != 0.00",
    "Zuschläge einzeln = Zuschläge gesamt: 50.00 != 0.00",
    "Bruttobetrag - Anzahlung + Rundung = Zahlbetrag: 1000.01 != 1190.00",
    "Beträge nicht lesbar: Anzahlung, Rundung",
    "2 Betrag/Beträge ohne Kennzeichen (cbc:ChargeIndicator)",
    "1000.00 Positionen - 200.00 Nachlässe + 152.00 Steuer = 952.00 Zahlbetrag",
    "Menge x Einzelpreis - Nachlässe + Zuschläge = Positionsbetrag",
    "Position 1: 10000.00 != 1000.00; Position 2: 950.00 != 1000.00",
    "Position 1: Betrag ohne Kennzeichen (cbc:ChargeIndicator)",
    "Position 3: Menge oder Einzelpreis nicht lesbar",
    "4 Positionen nachgerechnet",
    "1 Position nachgerechnet",
  ];
  for (const text of evidence) {
    const english = translateTerms(DICTIONARIES.en, text);
    assert.ok(!/[äöüßÄÖÜ]/.test(english), `still German: ${english}`);
    assert.ok(!/\b(Positionen?|Nachl|Zuschl|Netto|Steuer|Anzahlung|Rundung|Zahlbetrag|Betr|Menge|Einzelpreis|nachgerechnet)/.test(english),
      `untranslated term: ${english}`);
  }
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
  assert.match(auditReason(DICTIONARIES.en, "Eingang über EMAIL"), /^Received via E-mail$/);
  assert.match(auditReason(DICTIONARIES.en, "Zahlung 1330.84 EUR angewiesen"), /^Payment of 1330\.84 EUR instructed$/);
  assert.equal(auditReason(DICTIONARIES.en, "SUPPLIER_IBAN_MATCH"), "IBAN differs from master data");
});

test("a comment a person typed is left in their own words", () => {
  // Rewriting someone's entry in an audit trail would be worse than showing
  // German to an English reader.
  const comment = "Mit Lieferant telefonisch geklärt";
  assert.equal(auditReason(DICTIONARIES.en, comment), comment);
  const withCodes = "Rückfrage an FINANCE per EMAIL";
  assert.equal(auditReason(DICTIONARIES.de, withCodes), withCodes, "codes in a typed comment are the person's words");
});

// ------------------------------------------------------------- refusals ----

/**
 * Every server module that could send a refusal: all of server/, minus tests
 * and test support. Scanned rather than listed, because a hand-kept list
 * silently misses the next new folder and then passes for the wrong reason.
 */
function serverModules() {
  const root = new URL("../../", import.meta.url);
  return readdirSync(root, { recursive: true })
    .filter((f) => f.endsWith(".js") && !f.endsWith(".test.js") && !f.startsWith("test-support"))
    .map((f) => `../../${f}`);
}

/**
 * Every refusal code the server can send: the second argument of a RuleError,
 * the first of a TransitionError or NotFoundError, and the `code` field of a
 * refusal a route writes directly.
 */
function emittedErrorCodes() {
  const files = serverModules();
  const codes = new Set();
  for (const path of files) {
    const text = source(path);
    for (const [, code] of text.matchAll(/new RuleError\(\s*\d+,\s*"([A-Z_]+)"/g)) codes.add(code);
    for (const [, code] of text.matchAll(/new (?:TransitionError|NotFoundError)\(\s*"([A-Z_]+)"/g)) codes.add(code);
    for (const [, code] of text.matchAll(/\bcode: "([A-Z_]+)"/g)) codes.add(code);
  }
  return [...codes].sort();
}

test("the scan finds the refusals at all", () => {
  const codes = emittedErrorCodes();
  assert.ok(codes.length > 30, `expected the server's refusals, found ${codes.length}`);
  assert.ok(codes.includes("INVOICE_NOT_FOUND"));
  assert.ok(codes.includes("REVIEWER_CANNOT_APPROVE"));
});

test("every refusal the server can send has text in both languages", () => {
  for (const [lang, dict] of Object.entries(DICTIONARIES)) {
    const missing = emittedErrorCodes().filter((code) => !(code in dict.error));
    assert.deepEqual(missing, [], `${lang} is missing refusal text: ${missing.join(", ")}`);
  }
});

test("no refusal text exists for a code the server cannot send", () => {
  const emitted = new Set(emittedErrorCodes());
  const stale = Object.keys(DICTIONARIES.en.error).filter((code) => !emitted.has(code));
  assert.deepEqual(stale, [], `these can no longer happen and should be removed: ${stale.join(", ")}`);
});

test("every refusal is thrown with a code", () => {
  // A refusal without one falls back to German, which is the defect this
  // closes, so the absence has to fail rather than degrade quietly.
  for (const path of serverModules()) {
    for (const [line] of source(path).matchAll(/throw new (?:RuleError|TransitionError|NotFoundError)\([^\n]*/g)) {
      assert.match(line, /"[A-Z_]{3,}"/, `refusal without a code in ${path}: ${line.trim()}`);
    }
  }
});

test("a refusal reads in both languages, naming states and roles as the screen does", () => {
  const refusal = { code: "NOT_IN_REVIEW", message: "Rechnung im Status APPROVED steht nicht in der Sichtprüfung", details: { state: "APPROVED" } };
  assert.equal(errorText(DICTIONARIES.en, refusal), "An invoice in state Approved is not in manual review");
  assert.equal(errorText(DICTIONARIES.de, refusal), "Rechnung im Status Freigegeben steht nicht in der Sichtprüfung");

  const role = { code: "WRONG_ROLE_FOR_STEP", message: "…", details: { required_role: "MANAGER", role: "FINANCE" } };
  assert.equal(errorText(DICTIONARIES.en, role), "This step requires the role Cost centre manager, not Finance");
});

test("an unknown refusal code falls back to the sentence the server sent", () => {
  const unknown = { code: "ETWAS_NEUES", message: "Serversatz auf Deutsch", details: null };
  assert.equal(errorText(DICTIONARIES.en, unknown), "Serversatz auf Deutsch");
  assert.equal(errorText(DICTIONARIES.en, { message: "ohne Code" }), "ohne Code");
});

test("an internal error shows the reference the server logged it under", () => {
  const error = { code: "INTERNAL_ERROR", message: "Interner Fehler (Referenz r-1)", details: { request_id: "r-1" } };
  assert.equal(errorText(DICTIONARIES.de, error), "Interner Fehler (Referenz r-1)");
  assert.equal(errorText(DICTIONARIES.en, error), "Internal error (reference r-1)");
});
