import { createHash } from "node:crypto";
import { outboundValue } from "./outbound.js";

/**
 * The only data an AI explanation is given (ADR-080): the latest run's failed
 * checks and warnings with their evidence, the other checks by name, and the
 * next steps the reviewer could take anyway. No document, no identity, no
 * history. What this returns is stored as sent.
 */
const INPUT_SCHEMA = "finops.ai-explanation-input/1";
export const LANGUAGES = ["de", "en"];

// Steps that never move an invoice on: nothing here accepts, approves or pays.
const STEP_FOR_CHECK = { supplier_iban_match: "verify_bank_account", duplicate_invoice_number: "confirm_duplicate" };
const ALWAYS = ["request_info", "reject"];
export const NEXT_STEPS = [...Object.values(STEP_FOR_CHECK), ...ALWAYS];

const MAX_TEXT = 240;
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

const maskIban = (iban) => {
  const compact = iban.replace(/\s/g, "");
  return `${compact.slice(0, 4)} **** ${compact.slice(-4)}`;
};

/** A string safe to send: no full IBAN, name, e-mail or control characters, and short. */
function clean(text, names) {
  if (text === null || text === undefined) return null;
  let out = String(text)
    .replace(/\p{Cc}+/gu, " ")
    .replace(IBAN, maskIban)
    .replace(EMAIL, "[E-Mail]");
  for (const name of names) out = out.replaceAll(name, "[Name]");
  out = out.replace(/\s+/g, " ").trim();
  return out.length > MAX_TEXT ? `${out.slice(0, MAX_TEXT - 1)}…` : out;
}

/** Longest first, so a name that contains another is removed whole. */
const usableNames = (names) =>
  [...new Set(names.filter((n) => typeof n === "string" && n.trim().length >= 3))].sort((a, b) => b.length - a.length);

export function buildExplanationInput({ invoice, runNo, checks, names = [] }, language) {
  const redact = usableNames(names);
  const withStatus = (status) => checks.filter((c) => c.status === status);
  // Which evidence may leave is decided per check in outbound.js (ADR-082).
  // The evidence on screen and in the database is unchanged.
  const field = (c, f) => {
    if (f === "check") return c.check_code;
    if (f === "phase" || f === "severity") return c[f];
    return outboundValue(c, f, (text) => clean(text, redact));
  };
  const evidence = (c, fields) => Object.fromEntries(fields.map((f) => [f, field(c, f)]));
  const failed = withStatus("FAILED");
  return {
    schema: INPUT_SCHEMA,
    language,
    document: { kind: invoice.document_type, state: invoice.state, review_reason: invoice.review_reason, run_no: runNo },
    failed: failed.map((c) => evidence(c, ["check", "phase", "severity", "expected", "actual", "reason"])),
    warnings: withStatus("WARNING").map((c) => evidence(c, ["check", "phase", "expected", "actual", "reason"])),
    passed: withStatus("PASSED").map((c) => c.check_code),
    not_checked: withStatus("SKIPPED").map((c) => c.check_code),
    allowed_next_steps: [...new Set([...failed.map((c) => STEP_FOR_CHECK[c.check_code]).filter(Boolean), ...ALWAYS])],
  };
}

/** Built in a fixed key order, so the same content always hashes the same. */
export const inputSha256 = (input) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
