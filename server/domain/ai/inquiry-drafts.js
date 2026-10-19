import { NotFoundError, RuleError } from "../errors.js";
import { loadEvidence } from "./evidence.js";
import { buildInquiryInput, inquiryInputSha256 } from "./inquiry-input.js";
import { INQUIRY_SCHEMA_VERSION, verifyInquiry } from "./inquiry-grounding.js";
import { INQUIRY_PROMPT_VERSION, inquirySystemPrompt, inquiryTool, inquiryUserMessage } from "./inquiry-prompt.js";
import { INQUIRY_STATES } from "../inquiries/inquiries.js";
import { inquiryRefusal } from "../inquiries/requests.js";
import { availablePlaceholders, fill, placeholderValues } from "../inquiries/placeholders.js";

/**
 * AI drafts of a supplier inquiry (ADR-084): on demand, verified before anyone
 * sees them, kept in their own table, with the placeholders filled in by the
 * application only afterwards. Nothing here moves an invoice; approving and
 * sending are people's actions (domain/inquiries). The provider is called with
 * no database connection held.
 */
const KEY = ["invoice_id", "run_no", "input_sha256", "prompt_version", "schema_version", "provider", "model"];
const KEY_MATCH = KEY.map((column, i) => `${column} = $${i + 1}`).join(" and ");
const COLUMNS = [...KEY, "input", "status", "output", "rejection_reasons", "error", "duration_ms", "input_tokens", "output_tokens", "requested_by"];

async function prepare(deps, invoiceId) {
  const evidence = await loadEvidence(deps.pool, deps.company, invoiceId);
  if (!evidence) throw new NotFoundError("INVOICE_NOT_FOUND", "Rechnung nicht gefunden");
  const values = await placeholderValues(deps.pool, deps.company, invoiceId);
  if (!INQUIRY_STATES.includes(evidence.invoice.state)) return { eligible: false, code: "INQUIRY_NOT_IN_REVIEW" };
  const built = buildInquiryInput(evidence, availablePlaceholders(values));
  if (!built.eligible) return { eligible: false, code: built.code };
  const { explainer } = deps.ai;
  const key = {
    invoice_id: invoiceId, run_no: evidence.runNo, input_sha256: inquiryInputSha256(built.input),
    prompt_version: INQUIRY_PROMPT_VERSION, schema_version: INQUIRY_SCHEMA_VERSION,
    provider: explainer?.provider ?? deps.ai.provider, model: explainer?.model ?? deps.ai.model,
  };
  return { eligible: true, input: built.input, key, values };
}

async function latest(pool, key) {
  const { rows: [row] } = await pool.query(
    `select * from finops.ai_supplier_inquiries where ${KEY_MATCH} order by (status = 'ACCEPTED') desc, created_at desc limit 1`,
    KEY.map((column) => key[column]),
  );
  return row ?? null;
}

const view = (row, values) => (row.status !== "ACCEPTED" ? { status: "UNAVAILABLE", ai_generated: true } : {
  status: "ACCEPTED", ai_generated: true, id: row.id,
  subject: fill(row.output.subject, values), body: fill(row.output.body, values),
  cited_checks: row.output.cited_checks, requests: row.output.requests,
  provider: row.provider, model: row.model, run_no: row.run_no, created_at: row.created_at,
});

/** The provider's answer, verified; never thrown, whatever the provider does. */
async function ask(explainer, input) {
  if (!explainer) return { status: "FAILED", error: "Kein API-Schlüssel konfiguriert" };
  const result = await explainer.explain({ system: inquirySystemPrompt(), message: inquiryUserMessage(input), tool: inquiryTool(input) });
  const measured = { duration_ms: result.durationMs ?? null, input_tokens: result.usage?.input_tokens ?? null, output_tokens: result.usage?.output_tokens ?? null };
  if (!result.ok) return { ...measured, status: "FAILED", error: String(result.error).slice(0, 200) };
  const { accepted, reasons } = verifyInquiry(input, result.output);
  return { ...measured, status: accepted ? "ACCEPTED" : "REJECTED", output: result.output, rejection_reasons: reasons };
}

async function record(pool, key, input, attempt, actor) {
  const { rows: [row] } = await pool.query(
    `insert into finops.ai_supplier_inquiries (${COLUMNS.join(", ")})
     values (${COLUMNS.map((column, i) => `$${i + 1}`).join(", ")})
     on conflict (${KEY.join(", ")}) where status = 'ACCEPTED' do nothing
     returning *`,
    [...KEY.map((column) => key[column]), JSON.stringify(input), attempt.status,
      attempt.output === undefined ? null : JSON.stringify(attempt.output), JSON.stringify(attempt.rejection_reasons ?? []),
      attempt.error ?? null, attempt.duration_ms ?? null, attempt.input_tokens ?? null, attempt.output_tokens ?? null, actor.id],
  );
  return row ?? latest(pool, key);
}

/** What the panel shows: the accepted draft for the invoice's current run, from this model. */
export async function currentInquiryDraft(deps, invoiceId) {
  if (!deps.ai?.enabled) return { enabled: false };
  const prepared = await prepare(deps, invoiceId);
  if (!prepared.eligible) return { enabled: true, eligible: false, code: prepared.code, status: "NONE", draft: null };
  const row = await latest(deps.pool, prepared.key);
  return {
    enabled: true, eligible: true, code: null,
    status: !row ? "NONE" : row.status === "ACCEPTED" ? "ACCEPTED" : "UNAVAILABLE",
    draft: row?.status === "ACCEPTED" ? view(row, prepared.values) : null,
  };
}

export async function requestInquiryDraft(deps, invoiceId, actor) {
  if (!deps.ai?.enabled) throw new RuleError(409, "AI_DISABLED", "KI-Funktionen sind nicht eingeschaltet");
  const prepared = await prepare(deps, invoiceId);
  if (!prepared.eligible) throw inquiryRefusal(prepared.code);
  const cached = await latest(deps.pool, prepared.key);
  if (cached?.status === "ACCEPTED") return view(cached, prepared.values);
  return view(await record(deps.pool, prepared.key, prepared.input, await ask(deps.ai.explainer, prepared.input), actor), prepared.values);
}
