import { CONTACT, PAID_IN_EVIDENCE, PAYMENT_CLAIM, decision, evidenceFacts, facts, values } from "./grounding.js";
import { BANK_DETAILS } from "../inquiries/requests.js";

/**
 * Whether an inquiry draft may be shown (ADR-084). Deterministic, applied to
 * every answer before anyone sees it. The draft must cover exactly the failed
 * checks and the allowed requests, use only placeholders the invoice has
 * values for, state no number, date or identifier the evidence does not hold,
 * and contain no contact route, no bank details, no decision and no claim that
 * money moved. It cannot judge tone or whether the letter is clear: a person
 * reads every draft before it is approved.
 */
export const INQUIRY_SCHEMA_VERSION = "finops.ai-inquiry/1";
export const INQUIRY_LIMITS = { subject: 120, body: 1500 };
const FIELDS = ["subject", "body", "cited_checks", "requests", "language"];
const PLACEHOLDER = /\{\{([a-z_]+)\}\}/g;

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

function schemaProblems(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return ["not an object"];
  const keys = Object.keys(output);
  const missing = FIELDS.filter((f) => !keys.includes(f));
  const extra = keys.filter((k) => !FIELDS.includes(k));
  const problems = [];
  if (missing.length) problems.push(`missing: ${missing.join(", ")}`);
  if (extra.length) problems.push(`not in the contract: ${extra.join(", ")}`);
  if (missing.length) return problems;
  for (const field of ["subject", "body"]) {
    const value = output[field];
    if (typeof value !== "string" || !value.trim() || value.length > INQUIRY_LIMITS[field])
      problems.push(`${field}: empty, too long or not text`);
  }
  for (const field of ["cited_checks", "requests"]) {
    const list = output[field];
    if (!Array.isArray(list) || list.some((c) => typeof c !== "string") || new Set(list).size !== list.length) {
      problems.push(`${field}: not a list of distinct codes`);
    }
  }
  if (typeof output.language !== "string") problems.push("language: not text");
  return problems;
}

export function verifyInquiry(input, output) {
  const schema = schemaProblems(output);
  if (schema.length) return { accepted: false, reasons: schema.map((detail) => ({ rule: "SCHEMA", detail })) };

  const reasons = [];
  const refuse = (rule, detail) => reasons.push({ rule, detail });
  if (output.language !== "de") refuse("LANGUAGE", output.language);

  const failed = input.failed.map((check) => check.check);
  if (!sameSet(output.cited_checks, failed))
    refuse("FAILED_CHECKS", `angegeben ${output.cited_checks.join(", ") || "keine"}, fehlgeschlagen ${failed.join(", ")}`);
  if (!sameSet(output.requests, input.allowed_requests))
    refuse("REQUESTS", `angegeben ${output.requests.join(", ") || "keine"}, erlaubt ${input.allowed_requests.join(", ")}`);

  const text = `${output.subject}\n${output.body}`;
  const used = [...text.matchAll(PLACEHOLDER)].map((match) => match[1]);
  const unknown = [...new Set(used.filter((name) => !input.placeholders.includes(name)))];
  if (unknown.length) refuse("PLACEHOLDER", unknown.join(", "));
  const plain = text.replace(PLACEHOLDER, " ");
  if (/[{}]/.test(plain)) refuse("PLACEHOLDER", "unvollständiger Platzhalter");

  const evidence = evidenceFacts({ failed: input.failed, warnings: [] });
  const stated = facts(plain);
  const ungrounded = [
    ...stated.dates.filter((d) => !evidence.dates.has(d)),
    ...stated.identifiers.filter((i) => !evidence.identifiers.has(i)),
    ...stated.numbers.filter((n) => !evidence.rawNumbers.has(n) && !values(n).some((v) => evidence.numbers.has(v))),
  ];
  if (ungrounded.length) refuse("UNGROUNDED", [...new Set(ungrounded)].join(", "));
  if (CONTACT.some((pattern) => pattern.test(plain))) refuse("CONTACT", "Link, E-Mail-Adresse oder Telefonnummer");
  const bank = plain.match(BANK_DETAILS);
  if (bank) refuse("BANK_DETAILS", bank[0]);
  const decided = decision(plain);
  if (decided) refuse("DECISION", decided);
  if (PAYMENT_CLAIM.test(plain) && !PAID_IN_EVIDENCE.test(evidence.corpus)) refuse("PAYMENT_CLAIM", plain.match(PAYMENT_CLAIM)[0]);

  return { accepted: reasons.length === 0, reasons };
}
