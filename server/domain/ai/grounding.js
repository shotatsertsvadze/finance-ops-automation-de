/**
 * Whether an AI explanation may be shown (ADR-080). Deterministic, and applied
 * to every answer before anyone sees it: the answer must restate exactly the
 * failed checks it was given, cite only checks it was given, suggest only a
 * step it was offered, and mention no date, number or identifier the evidence
 * does not contain. Phrases that decide, contact routes and unsupported claims
 * that money moved are refused. This checks facts and form; it cannot prove
 * that free text never contradicts the evidence, which is why the evidence is
 * always shown beside it.
 */
export const SCHEMA_VERSION = "finops.ai-explanation/1";
export const LIMITS = { summary: 200, explanation: 700 };
const FIELDS = ["summary", "explanation", "failed_checks", "cited_checks", "next_step", "language"];

// What the invoice may or should have done to it, in either language. A
// sentence such as "kann nicht freigegeben werden" is refused as well: the
// prompt asks for no statement about releasing or paying at all.
const FEW_WORDS = "(?:\\p{L}+\\s+){0,3}";
const phrase = (words) => new RegExp(`(?<!\\p{L})${words}(?!\\p{L})`, "iu");
const DECISION_PATTERNS = [
  `(kann|können|darf|dürfen|sollte|sollten|muss|müssen)\\s+${FEW_WORDS}(freigegeben|genehmigt|bezahlt|überwiesen)\\s+werden`,
  `(rechnung|sie)\\s+${FEW_WORDS}(freigeben|genehmigen|bezahlen|überweisen)`,
  "(freigeben|genehmigen|bezahlen|überweisen)\\s+sie",
  "unbedenklich", "keine bedenken", "ist in ordnung",
  `(can|could|may|should|must)\\s+${FEW_WORDS}(be\\s+)?(approved|released|paid)`,
  "(approve|release|pay)\\s+(the\\s+invoice|it)", "safe to (pay|approve|release)", "no (issues|concerns|problems)",
  "nothing to worry",
].map(phrase);
const PAYMENT_CLAIM = phrase("(bezahlt|überwiesen|gezahlt|paid|transferred)");
const PAID_IN_EVIDENCE = phrase("(paid|bezahlt)");
const CONTACT = [/\bhttps?:\/\//i, /\bwww\./i, /[^\s@]+@[^\s@]+\.[^\s@]+/, /\+\s?\d/];

const DATE = /\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g;
const WORD = /[\p{L}\d]+(?:[-/._:][\p{L}\d]+)*/gu;
const NUMBER = /\d+(?:[.,]\d+)*/g;

const isoDate = (m) => (m[1] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[6]}-${m[5].padStart(2, "0")}-${m[4].padStart(2, "0")}`);
const isIdentifier = (word) => /\p{L}/u.test(word) && /\d/.test(word);

/** The values a written number can mean: German and English notation both. */
function values(token) {
  const out = [];
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(token)) out.push(Number(token.replaceAll(".", "").replace(",", ".")));
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(token)) out.push(Number(token.replaceAll(",", "")));
  if (/^\d+,\d+$/.test(token)) out.push(Number(token.replace(",", ".")));
  if (/^\d+(\.\d+)?$/.test(token)) out.push(Number(token));
  return out;
}

/** The dates, identifiers and numbers a text states. */
function facts(text) {
  const dates = [...text.matchAll(DATE)].map(isoDate);
  const rest = text.replace(DATE, " ");
  const identifiers = (rest.match(WORD) ?? []).filter(isIdentifier);
  const numbers = rest.replace(WORD, (word) => (isIdentifier(word) ? " " : word)).match(NUMBER) ?? [];
  return { dates, identifiers, numbers };
}

function evidenceFacts(input) {
  const corpus = [...input.failed, ...input.warnings].flatMap((c) => [c.expected, c.actual, c.reason]).filter(Boolean).join(" \n ");
  const { dates, identifiers } = facts(corpus);
  const numbers = corpus.replace(DATE, " ").match(NUMBER) ?? [];
  return {
    corpus,
    dates: new Set(dates),
    identifiers: new Set(identifiers),
    rawNumbers: new Set(numbers),
    numbers: new Set(numbers.flatMap(values)),
  };
}

function schemaProblems(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return ["not an object"];
  const keys = Object.keys(output);
  const problems = [];
  const missing = FIELDS.filter((f) => !keys.includes(f));
  const extra = keys.filter((k) => !FIELDS.includes(k));
  if (missing.length) problems.push(`missing: ${missing.join(", ")}`);
  if (extra.length) problems.push(`not in the contract: ${extra.join(", ")}`);
  if (missing.length) return problems;
  for (const field of ["summary", "explanation"]) {
    const value = output[field];
    if (typeof value !== "string" || !value.trim() || value.length > LIMITS[field]) problems.push(`${field}: empty, too long or not text`);
  }
  for (const field of ["failed_checks", "cited_checks"]) {
    const list = output[field];
    if (!Array.isArray(list) || list.some((c) => typeof c !== "string") || new Set(list).size !== list.length) {
      problems.push(`${field}: not a list of distinct check codes`);
    }
  }
  if (output.next_step !== null && typeof output.next_step !== "string") problems.push("next_step: neither null nor a step");
  if (typeof output.language !== "string") problems.push("language: not text");
  return problems;
}

export function verifyExplanation(input, output) {
  const schema = schemaProblems(output);
  if (schema.length) return { accepted: false, reasons: schema.map((detail) => ({ rule: "SCHEMA", detail })) };

  const reasons = [];
  const refuse = (rule, detail) => reasons.push({ rule, detail });
  if (output.language !== input.language) refuse("LANGUAGE", `${output.language} statt ${input.language}`);

  const failed = input.failed.map((c) => c.check);
  const claimed = output.failed_checks;
  if (claimed.length !== failed.length || !failed.every((c) => claimed.includes(c))) {
    refuse("FAILED_CHECKS", `angegeben ${claimed.join(", ") || "keine"}, fehlgeschlagen ${failed.join(", ")}`);
  }
  const known = new Set([...failed, ...input.warnings.map((c) => c.check), ...input.passed, ...input.not_checked]);
  const unknown = output.cited_checks.filter((c) => !known.has(c));
  if (unknown.length) refuse("UNKNOWN_CHECK", unknown.join(", "));
  if (output.next_step !== null && !input.allowed_next_steps.includes(output.next_step)) refuse("NEXT_STEP", output.next_step);

  const text = `${output.summary}\n${output.explanation}`;
  const evidence = evidenceFacts(input);
  const stated = facts(text);
  const ungrounded = [
    ...stated.dates.filter((d) => !evidence.dates.has(d)),
    ...stated.identifiers.filter((i) => !evidence.identifiers.has(i)),
    ...stated.numbers.filter((n) => !evidence.rawNumbers.has(n) && !values(n).some((v) => evidence.numbers.has(v))),
  ];
  if (ungrounded.length) refuse("UNGROUNDED", [...new Set(ungrounded)].join(", "));
  if (CONTACT.some((pattern) => pattern.test(text))) refuse("CONTACT", "Link, E-Mail-Adresse oder Telefonnummer");
  const decision = DECISION_PATTERNS.find((pattern) => pattern.test(text));
  if (decision) refuse("DECISION", text.match(decision)[0]);
  if (PAYMENT_CLAIM.test(text) && !PAID_IN_EVIDENCE.test(evidence.corpus)) refuse("PAYMENT_CLAIM", text.match(PAYMENT_CLAIM)[0]);

  return { accepted: reasons.length === 0, reasons };
}
