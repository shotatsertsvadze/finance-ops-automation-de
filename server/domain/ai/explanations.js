import { NotFoundError, RuleError } from "../errors.js";
import { loadEvidence } from "./evidence.js";
import { LANGUAGES, buildExplanationInput, inputSha256 } from "./explanation-input.js";
import { SCHEMA_VERSION, verifyExplanation } from "./grounding.js";
import { PROMPT_VERSION, explanationTool, systemPrompt, userMessage } from "./prompt.js";

/**
 * AI explanations of why an invoice stopped (ADR-080): on demand, verified
 * before anyone sees them, and kept in their own table. Nothing here reads or
 * writes an invoice's state, checks, routing, approvals, master data or
 * payments, and nothing there reads this. The provider is called with no
 * database connection held.
 */
const AI_STATES = ["REVIEW_REQUIRED"];
const UNAVAILABLE = { status: "UNAVAILABLE", ai_generated: true };
const KEY = ["invoice_id", "run_no", "input_sha256", "prompt_version", "schema_version", "provider", "model", "language"];
const KEY_MATCH = KEY.map((column, i) => `${column} = $${i + 1}`).join(" and ");
const COLUMNS = [
  ...KEY,
  "input",
  "status",
  "output",
  "rejection_reasons",
  "error",
  "duration_ms",
  "input_tokens",
  "output_tokens",
  "requested_by",
];

async function prepare(deps, invoiceId, language) {
  if (!LANGUAGES.includes(language)) throw new RuleError(400, "AI_LANGUAGE_UNKNOWN", "Sprache der KI-Erklärung: de oder en");
  const evidence = await loadEvidence(deps.pool, deps.company, invoiceId);
  if (!evidence) throw new NotFoundError("INVOICE_NOT_FOUND", "Rechnung nicht gefunden");
  const input = buildExplanationInput(evidence, language);
  const { explainer } = deps.ai;
  // Everything that makes an answer this answer: a different run, evidence,
  // prompt, contract, model or language is a different explanation.
  const key = {
    invoice_id: invoiceId,
    run_no: evidence.runNo,
    input_sha256: inputSha256(input),
    prompt_version: PROMPT_VERSION,
    schema_version: SCHEMA_VERSION,
    provider: explainer?.provider ?? deps.ai.provider,
    model: explainer?.model ?? deps.ai.model,
    language,
  };
  return { input, key, eligible: AI_STATES.includes(evidence.invoice.state) && input.failed.length > 0 };
}

async function latest(pool, key) {
  const {
    rows: [row],
  } = await pool.query(
    `select * from finops.ai_explanations where ${KEY_MATCH} order by (status = 'ACCEPTED') desc, created_at desc limit 1`,
    KEY.map((column) => key[column]),
  );
  return row ?? null;
}

const view = (row) =>
  row.status !== "ACCEPTED"
    ? UNAVAILABLE
    : {
        status: "ACCEPTED",
        ai_generated: true,
        summary: row.output.summary,
        explanation: row.output.explanation,
        cited_checks: row.output.cited_checks,
        next_step: row.output.next_step,
        language: row.language,
        provider: row.provider,
        model: row.model,
        run_no: row.run_no,
        created_at: row.created_at,
      };

/** The provider's answer, verified; never thrown, whatever the provider does. */
async function ask(explainer, input) {
  if (!explainer) return { status: "FAILED", error: "Kein API-Schlüssel konfiguriert" };
  const result = await explainer.explain({
    system: systemPrompt(input.language),
    message: userMessage(input),
    tool: explanationTool(input),
  });
  const measured = {
    duration_ms: result.durationMs ?? null,
    input_tokens: result.usage?.input_tokens ?? null,
    output_tokens: result.usage?.output_tokens ?? null,
  };
  if (!result.ok) return { ...measured, status: "FAILED", error: String(result.error).slice(0, 200) };
  const { accepted, reasons } = verifyExplanation(input, result.output);
  return { ...measured, status: accepted ? "ACCEPTED" : "REJECTED", output: result.output, rejection_reasons: reasons };
}

/** Written once. A second accepted answer for the same key adds nothing; the first stands. */
async function record(pool, key, input, attempt, actor) {
  const {
    rows: [row],
  } = await pool.query(
    `insert into finops.ai_explanations (${COLUMNS.join(", ")})
     values (${COLUMNS.map((column, i) => `$${i + 1}`).join(", ")})
     on conflict (${KEY.join(", ")}) where status = 'ACCEPTED' do nothing
     returning *`,
    [
      ...KEY.map((column) => key[column]),
      JSON.stringify(input),
      attempt.status,
      attempt.output === undefined ? null : JSON.stringify(attempt.output),
      JSON.stringify(attempt.rejection_reasons ?? []),
      attempt.error ?? null,
      attempt.duration_ms ?? null,
      attempt.input_tokens ?? null,
      attempt.output_tokens ?? null,
      actor.id,
    ],
  );
  return row ?? latest(pool, key);
}

/** What the panel shows: the accepted explanation for the invoice's current run, in this language, from this model. */
export async function currentExplanation(deps, invoiceId, language) {
  if (!deps.ai?.enabled) return { enabled: false };
  const { key, eligible } = await prepare(deps, invoiceId, language);
  const row = eligible ? await latest(deps.pool, key) : null;
  return { enabled: true, eligible, status: row ? view(row).status : "NONE", explanation: row?.status === "ACCEPTED" ? view(row) : null };
}

export async function requestExplanation(deps, invoiceId, language, actor) {
  if (!deps.ai?.enabled) throw new RuleError(409, "AI_DISABLED", "KI-Erklärungen sind nicht eingeschaltet");
  const { input, key, eligible } = await prepare(deps, invoiceId, language);
  if (!eligible) {
    throw new RuleError(409, "AI_NOT_APPLICABLE", "Erklärt wird nur eine Rechnung in der Sichtprüfung mit fehlgeschlagener Prüfung");
  }
  const cached = await latest(deps.pool, key);
  if (cached?.status === "ACCEPTED") return view(cached);
  return view(await record(deps.pool, key, input, await ask(deps.ai.explainer, input), actor));
}
