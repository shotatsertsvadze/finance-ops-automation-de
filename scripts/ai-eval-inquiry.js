import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { aiExplanationsFromEnv, createAnthropicExplainer } from "../server/integrations/ai-explainer.js";
import { verifyInquiry } from "../server/domain/ai/inquiry-grounding.js";
import { INQUIRY_PROMPT_VERSION, inquirySystemPrompt, inquiryTool, inquiryUserMessage } from "../server/domain/ai/inquiry-prompt.js";
import { templateInquiry } from "../server/domain/inquiries/template.js";
import { fill } from "../server/domain/inquiries/placeholders.js";

/**
 * `npm run ai:eval:inquiry`: the inquiry evaluation cases against the real
 * model, by hand (ADR-084). Needs ANTHROPIC_API_KEY and costs money; CI never
 * runs it. Each eligible case is drafted AI_EVAL_RUNS times (default 3) and
 * every draft goes through the same deterministic checks the application
 * applies; the fixed template goes through them too. The two IBAN cases must
 * be refused before any call. Output:
 *
 * - AI_EVAL_OUT (default ai-inquiry-eval-report.json): every draft, verdict,
 *   latency and token count, and a summary.
 * - ai-inquiry-eval-blind.md and ai-inquiry-eval-key.json: per case one
 *   accepted AI draft and the template, as A and B in an order the reader
 *   cannot infer, with a rating table; the key says which is which.
 *
 * The checks say whether a draft is admissible, not whether it is good; the
 * blind sheet is for a person to judge that. AI_EVAL_URL points at a stand-in
 * instead of Anthropic, to try the script itself; its results say nothing
 * about the model. AI_EVAL_CASES (comma-separated scenario names) limits a run
 * to those cases, for a follow-up after a change. All output files go to the
 * working directory, so a follow-up run elsewhere leaves an earlier one intact.
 */
const RUNS = Number(process.env.AI_EVAL_RUNS ?? 3);
const ONLY = process.env.AI_EVAL_CASES?.split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const OUT = process.env.AI_EVAL_OUT ?? "ai-inquiry-eval-report.json";
const configured = aiExplanationsFromEnv({ ...process.env, AI_EXPLANATIONS: "true" });
if (!configured.explainer) {
  console.error("ANTHROPIC_API_KEY fehlt: die Auswertung gegen das echte Modell läuft nur mit Schlüssel");
  process.exit(1);
}
const explainer = process.env.AI_EVAL_URL
  ? createAnthropicExplainer({ ...configured.explainer, apiKey: process.env.ANTHROPIC_API_KEY, url: process.env.AI_EVAL_URL })
  : configured.explainer;

const dir = new URL("../fixtures/ai/inquiry/", import.meta.url);
const cases = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")))
  .filter((c) => !ONLY || ONLY.includes(c.scenario));
const rendered = (draft, values) => ({ subject: fill(draft.subject, values), body: fill(draft.body, values) });
const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);

const results = [];
const templates = {};
console.log(
  `Modell ${explainer.model}, Prompt ${INQUIRY_PROMPT_VERSION}, ${RUNS} Läufe je Fall, ${cases.length} Fälle${process.env.AI_EVAL_URL ? ` (Stand-in ${process.env.AI_EVAL_URL})` : ""}`,
);
for (const c of cases) {
  if (!c.eligible) {
    results.push({ scenario: c.scenario, eligible: false, code: c.code, calls: 0 });
    console.log(`${c.scenario}: verweigert vor jedem Aufruf (${c.code})`);
    continue;
  }
  const failed = c.input.failed.map((check) => check.check);
  const template = templateInquiry(failed, c.input.placeholders);
  const templateVerdict = verifyInquiry(c.input, { ...template, cited_checks: failed, requests: c.input.allowed_requests, language: "de" });
  templates[c.scenario] = { ...rendered(template, c.placeholder_values), accepted: templateVerdict.accepted };
  for (let run = 1; run <= RUNS; run += 1) {
    const answer = await explainer.explain({
      system: inquirySystemPrompt(),
      message: inquiryUserMessage(c.input),
      tool: inquiryTool(c.input),
    });
    const verdict = answer.ok ? verifyInquiry(c.input, answer.output) : null;
    const status = !answer.ok ? "FAILED" : verdict.accepted ? "ACCEPTED" : "REJECTED";
    const result = {
      scenario: c.scenario,
      eligible: true,
      run,
      status,
      reasons: verdict?.reasons ?? [],
      error: answer.error ?? null,
      latency_ms: answer.durationMs,
      input_tokens: answer.usage?.input_tokens ?? null,
      output_tokens: answer.usage?.output_tokens ?? null,
      output: answer.output ?? null,
      rendered: answer.ok && typeof answer.output?.body === "string" ? rendered(answer.output, c.placeholder_values) : null,
    };
    results.push(result);
    const why =
      status === "REJECTED"
        ? ` ${result.reasons.map((r) => `${r.rule}(${r.detail})`).join("; ")}`
        : status === "FAILED"
          ? ` ${result.error}`
          : "";
    console.log(
      `${c.scenario} #${run}: ${status}${why} | ${result.latency_ms} ms, ${result.input_tokens ?? "?"}/${result.output_tokens ?? "?"} Tokens`,
    );
  }
}

const drafts = results.filter((r) => r.eligible);
const rules = {};
for (const r of drafts) for (const { rule } of r.reasons) rules[rule] = (rules[rule] ?? 0) + 1;
const accepted = drafts.filter((r) => r.status === "ACCEPTED");
const summary = {
  model: explainer.model,
  stand_in: Boolean(process.env.AI_EVAL_URL),
  runs_per_case: RUNS,
  run_at: new Date().toISOString(),
  prompt_version: INQUIRY_PROMPT_VERSION,
  cases: cases.map((c) => c.scenario),
  drafts: drafts.length,
  accepted: accepted.length,
  rejected: drafts.filter((r) => r.status === "REJECTED").length,
  failed: drafts.filter((r) => r.status === "FAILED").length,
  acceptance_rate: drafts.length ? Math.round((accepted.length / drafts.length) * 1000) / 10 : 0,
  rejections_by_rule: rules,
  refused_before_call: results.filter((r) => !r.eligible).map((r) => `${r.scenario} (${r.code})`),
  templates_accepted: Object.values(templates).filter((t) => t.accepted).length,
  templates: Object.keys(templates).length,
  median_latency_ms: median(drafts.map((r) => r.latency_ms).filter(Number.isFinite)),
  max_latency_ms: Math.max(0, ...drafts.map((r) => r.latency_ms).filter(Number.isFinite)),
  median_output_tokens: median(drafts.map((r) => r.output_tokens).filter(Number.isFinite)),
  median_body_chars_ai: median(accepted.map((r) => r.rendered.body.length)),
  median_body_chars_template: median(Object.values(templates).map((t) => t.body.length)),
};
writeFileSync(OUT, `${JSON.stringify({ summary, templates, results }, null, 2)}\n`);

// Blind sheet: one accepted draft per case beside the template, in an order taken from a hash.
const key = {};
const sheet = [
  "# Blindbewertung Lieferantenrückfrage",
  "",
  `Modell ${summary.model}${summary.stand_in ? " (STAND-IN, keine Aussage über das Modell)" : ""}, ${summary.run_at}.`,
  "Pro Fall zwei Texte, A und B. Einer ist die feste Vorlage, einer ein KI-Entwurf; welcher, steht in ai-inquiry-eval-key.json. Erst bewerten, dann nachsehen.",
  "Skala 1 (schlecht) bis 5 (sehr gut).",
  "",
];
for (const c of cases.filter((x) => x.eligible)) {
  const ai = accepted.find((r) => r.scenario === c.scenario);
  if (!ai) {
    sheet.push(`## ${c.scenario}`, "", "Kein angenommener KI-Entwurf; nichts zu vergleichen.", "");
    continue;
  }
  const aiFirst = createHash("sha256").update(c.scenario).digest()[0] % 2 === 0;
  const [a, b] = aiFirst ? [ai.rendered, templates[c.scenario]] : [templates[c.scenario], ai.rendered];
  key[c.scenario] = { A: aiFirst ? "AI" : "TEMPLATE", B: aiFirst ? "TEMPLATE" : "AI", ai_run: ai.run };
  sheet.push(`## ${c.scenario}`, "", `Fehlgeschlagene Prüfungen: ${c.input.failed.map((x) => x.check).join(", ")}`, "");
  for (const [label, text] of [
    ["A", a],
    ["B", b],
  ])
    sheet.push(`### ${label}`, "", `**${text.subject}**`, "", "```text", text.body, "```", "");
  sheet.push(
    "| Kriterium | A | B |",
    "|---|---|---|",
    "| Sachlich richtig (passt zu den Prüfergebnissen) | | |",
    "| Vollständig (alle Punkte, klare Bitte) | | |",
    "| Verständlich für den Lieferanten | | |",
    "| Ton angemessen | | |",
    "| So versenden? (ja / mit Änderungen / nein) | | |",
    "",
  );
}
writeFileSync("ai-inquiry-eval-blind.md", `${sheet.join("\n")}\n`);
writeFileSync("ai-inquiry-eval-key.json", `${JSON.stringify(key, null, 2)}\n`);

console.log(
  `\n${summary.accepted}/${summary.drafts} Entwürfe angenommen (${summary.acceptance_rate} %), abgelehnt ${summary.rejected}, fehlgeschlagen ${summary.failed}`,
);
console.log(`Ablehnungen nach Regel: ${JSON.stringify(rules)}; vor dem Aufruf verweigert: ${summary.refused_before_call.join(", ")}`);
console.log(
  `Vorlagen bestehen die Prüfung: ${summary.templates_accepted}/${summary.templates}; Median ${summary.median_latency_ms} ms, max ${summary.max_latency_ms} ms`,
);
console.log(`Bericht: ${OUT}; Blindbogen: ai-inquiry-eval-blind.md`);
