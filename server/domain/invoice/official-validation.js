import { createHash } from "node:crypto";
import { SEVERITY, failed, passed, skipped } from "../checks.js";
import { KOSIT_PINS } from "../../integrations/kosit-pins.js";
import { readReport } from "./kosit-report.js";

/**
 * Official validation by the KoSIT validator (ADR-078): one technical check
 * and the evidence behind it. Only a consistent verdict from the pinned
 * validator about this very document counts; everything else fails closed.
 * The verdict is evidence about form, never an approval, and nothing here
 * turns a FAILED into a PASSED.
 */
const CHECK = "official_validation";
const EXPECTED = `KoSIT ${KOSIT_PINS.validator.version}, ${KOSIT_PINS.configuration.version}: annehmbar`;
const RETRY = "; erneut prüfen, sobald der Validator erreichbar ist";

const NO_VERDICT = {
  TIMEOUT: (a) => ["keine Antwort", `Der Validator hat nicht rechtzeitig geantwortet (${a.durationMs} ms)${RETRY}`],
  UNAVAILABLE: (a) => [a.error ?? "keine Verbindung", `Der Validator ist nicht erreichbar${RETRY}`],
  UNPROCESSABLE: () => ["HTTP 422", `Der Validator konnte das Dokument nicht verarbeiten${RETRY}`],
  ERROR: (a) => [`HTTP ${a.httpStatus}`, `Der Validator meldet einen Fehler${RETRY}`],
  NOT_CONFIGURED: () => ["kein Validator", "Kein offizieller Validator konfiguriert; im Produktivbetrieb erforderlich"],
  INVALID_RESPONSE: (a) => [a.error, `Antwort des Validators nicht verwertbar: ${a.error}`],
};

const noVerdict = (record) => {
  const [actual, reason] = NO_VERDICT[record.outcome](record);
  return failed(CHECK, SEVERITY.HIGH, { expected: EXPECTED, actual, reason });
};

/** Why this answer cannot be trusted as a verdict about this document; null when it can. */
function distrust(report, attempt, documentSha256) {
  if (!report || !report.assessment) return "kein lesbarer Prüfbericht";
  if (report.assessment !== attempt.outcome)
    return `Bewertung im Bericht (${report.assessment}) widerspricht dem HTTP-Status ${attempt.httpStatus}`;
  if (report.engine !== KOSIT_PINS.validator.engine)
    return `Validator-Version ${report.engine ?? "unbekannt"} statt ${KOSIT_PINS.validator.engine}`;
  // The matched scenario names the rule sets it applied; another configuration
  // names others. No scenario is a rejection of its own and names none; an
  // acceptance must always name them.
  const named = report.scenario || report.assessment === "ACCEPTED";
  if (named && !KOSIT_PINS.configuration.rules.every((rules) => attempt.report.includes(rules))) {
    return `Konfiguration weicht von ${KOSIT_PINS.configuration.version} ab`;
  }
  if (report.documentSha256 !== documentSha256) return "der Bericht betrifft ein anderes Dokument (SHA-256 weicht ab)";
  return null;
}

function verdictCheck(record) {
  const errors = record.messages.filter((m) => m.level === "error");
  const warnings = record.messages.filter((m) => m.level === "warning");
  if (record.verdict === "ACCEPTED") {
    return passed(CHECK, SEVERITY.HIGH, {
      expected: EXPECTED,
      actual: `annehmbar, ${warnings.length} Warnungen`,
      reason: `Der KoSIT-Validator bewertet das Dokument als annehmbar (${record.scenario})`,
    });
  }
  const codes = [...new Set(errors.map((m) => m.code))];
  return failed(CHECK, SEVERITY.HIGH, {
    expected: EXPECTED,
    actual: `nicht annehmbar: ${errors.length} Fehler (${codes.slice(0, 5).join(", ") || "ohne Regelkennung"})`,
    reason: `KoSIT: ${(errors[0]?.text ?? "Dokument nicht annehmbar").slice(0, 300)}`,
  });
}

/**
 * Asks the validator about a document and says what the answer means.
 * `record` is the evidence to keep, null when no validation was attempted
 * or required. An unreadable document is not sent: the parser has already
 * failed it, and hostile input goes no further than it must.
 */
export async function validateOfficially(validator, { buffer, name, documentSha256, readable }) {
  if (!readable) {
    return {
      check: skipped(CHECK, {
        expected: EXPECTED,
        actual: "nicht gesendet",
        reason: "Nicht an den Validator gesendet: Dokument nicht als UBL lesbar",
      }),
      record: null,
    };
  }
  const base = {
    verdict: null,
    validator_version: null,
    configuration_version: KOSIT_PINS.configuration.version,
    scenario: null,
    document_sha256: documentSha256,
    reported_document_sha256: null,
    messages: [],
    error: null,
    http_status: null,
    duration_ms: null,
    report: null,
  };
  if (!validator.client) {
    if (!validator.required) {
      return {
        check: skipped(CHECK, {
          expected: EXPECTED,
          actual: "kein Validator konfiguriert",
          reason: "Kein Validator konfiguriert (nur außerhalb des Produktivbetriebs zulässig): nicht offiziell geprüft",
        }),
        record: null,
      };
    }
    const record = { ...base, outcome: "NOT_CONFIGURED" };
    return { check: noVerdict(record), record };
  }

  const attempt = await validator.client.validate(buffer, name);
  const answered = {
    ...base,
    outcome: attempt.outcome,
    http_status: attempt.httpStatus,
    duration_ms: attempt.durationMs,
    error: attempt.error ?? null,
    report: attempt.report,
  };
  if (!["ACCEPTED", "REJECTED"].includes(attempt.outcome)) return { check: noVerdict(answered), record: answered };

  const report = readReport(attempt.report);
  const problem = distrust(report, attempt, documentSha256);
  if (problem) {
    const record = { ...answered, outcome: "INVALID_RESPONSE", error: problem, validator_version: report?.engine ?? null };
    return { check: noVerdict(record), record };
  }
  const record = {
    ...answered,
    verdict: attempt.outcome,
    validator_version: report.engine,
    scenario: report.scenario,
    reported_document_sha256: report.documentSha256,
    messages: report.messages,
  };
  return { check: verdictCheck(record), record };
}

/** Kept beside the run's check results; insert-only, like the audit trail. */
export async function saveOfficialValidation(client, invoiceId, runNo, record) {
  const reportSha256 = record.report === null ? null : createHash("sha256").update(record.report).digest("hex");
  await client.query(
    `insert into finops.official_validations (invoice_id, run_no, outcome, verdict, http_status, validator_version,
       configuration_version, scenario, document_sha256, reported_document_sha256, messages, error, duration_ms, report, report_sha256)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      invoiceId,
      runNo,
      record.outcome,
      record.verdict,
      record.http_status,
      record.validator_version,
      record.configuration_version,
      record.scenario,
      record.document_sha256,
      record.reported_document_sha256,
      JSON.stringify(record.messages),
      record.error,
      record.duration_ms,
      record.report,
      reportSha256,
    ],
  );
}
