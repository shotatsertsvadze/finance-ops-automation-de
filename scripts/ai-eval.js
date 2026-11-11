import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { aiExplanationsFromEnv, createAnthropicExplainer } from "../server/integrations/ai-explainer.js";
import { verifyExplanation } from "../server/domain/ai/grounding.js";
import { explanationTool, systemPrompt, userMessage } from "../server/domain/ai/prompt.js";

/**
 * `npm run ai:eval`: the five evaluation scenarios against the real model,
 * run by hand (ADR-080). Needs ANTHROPIC_API_KEY and costs money, so CI never
 * runs it; CI verifies the committed good and bad answers instead.
 *
 * Every answer is printed with its verdict, rejection reasons, latency and
 * tokens, and written in full to AI_EVAL_OUT (default ai-eval-report.json), so
 * a person can judge whether each is grounded and useful: the verifier can
 * only say whether it is admissible. AI_EVAL_RUNS repeats each scenario and
 * language (default 3). AI_EVAL_URL points at a stand-in instead of Anthropic,
 * to try the script itself; its results say nothing about the model.
 */
const RUNS = Number(process.env.AI_EVAL_RUNS ?? 3);
const OUT = process.env.AI_EVAL_OUT ?? "ai-eval-report.json";
const env = { ...process.env, AI_EXPLANATIONS: "true" };
const configured = aiExplanationsFromEnv(env);
if (!configured.explainer) {
  console.error("ANTHROPIC_API_KEY fehlt: die Auswertung gegen das echte Modell läuft nur mit Schlüssel");
  process.exit(1);
}
const explainer = process.env.AI_EVAL_URL
  ? createAnthropicExplainer({ ...configured.explainer, apiKey: process.env.ANTHROPIC_API_KEY, url: process.env.AI_EVAL_URL })
  : configured.explainer;

const dir = new URL("../fixtures/ai/", import.meta.url);
const scenarios = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));

const results = [];
console.log(
  `Modell ${explainer.model}, ${RUNS} Läufe je Szenario und Sprache${process.env.AI_EVAL_URL ? ` (Stand-in ${process.env.AI_EVAL_URL})` : ""}`,
);
for (const { scenario, input: german } of scenarios) {
  for (const language of ["de", "en"]) {
    const input = { ...german, language };
    for (let run = 1; run <= RUNS; run += 1) {
      const answer = await explainer.explain({ system: systemPrompt(language), message: userMessage(input), tool: explanationTool(input) });
      const verdict = answer.ok ? verifyExplanation(input, answer.output) : null;
      const status = !answer.ok ? "FAILED" : verdict.accepted ? "ACCEPTED" : "REJECTED";
      const result = {
        scenario,
        language,
        run,
        status,
        reasons: verdict?.reasons ?? [],
        error: answer.error ?? null,
        latency_ms: answer.durationMs,
        input_tokens: answer.usage?.input_tokens ?? null,
        output_tokens: answer.usage?.output_tokens ?? null,
        output: answer.output ?? null,
      };
      results.push(result);
      const why =
        status === "REJECTED"
          ? ` ${result.reasons.map((r) => `${r.rule}(${r.detail})`).join("; ")}`
          : status === "FAILED"
            ? ` ${result.error}`
            : "";
      console.log(
        `${scenario} ${language} #${run}: ${status}${why} | ${result.latency_ms} ms, ${result.input_tokens ?? "?"}/${result.output_tokens ?? "?"} tokens`,
      );
      if (answer.ok) console.log(`  ${answer.output.summary}\n  ${answer.output.explanation}\n  next_step=${answer.output.next_step}`);
    }
  }
}

const rate = (language) => {
  const mine = results.filter((r) => r.language === language);
  const accepted = mine.filter((r) => r.status === "ACCEPTED").length;
  return { language, accepted, total: mine.length, rate: mine.length ? Math.round((accepted / mine.length) * 1000) / 10 : 0 };
};
const rules = {};
for (const r of results) for (const { rule } of r.reasons) rules[r.language + " " + rule] = (rules[r.language + " " + rule] ?? 0) + 1;
const latencies = results.map((r) => r.latency_ms).sort((a, b) => a - b);
const summary = {
  model: explainer.model,
  runs_per_case: RUNS,
  stand_in: Boolean(process.env.AI_EVAL_URL),
  de: rate("de"),
  en: rate("en"),
  rejections_by_rule: rules,
  failed: results.filter((r) => r.status === "FAILED").length,
  median_latency_ms: latencies[Math.floor(latencies.length / 2)] ?? null,
};
writeFileSync(OUT, `${JSON.stringify({ summary, results }, null, 2)}\n`);
console.log(
  `\nDE ${summary.de.accepted}/${summary.de.total} angenommen (${summary.de.rate} %), EN ${summary.en.accepted}/${summary.en.total} (${summary.en.rate} %)`,
);
console.log(`Ablehnungen nach Regel: ${JSON.stringify(rules)}; fehlgeschlagen: ${summary.failed}; Median ${summary.median_latency_ms} ms`);
console.log(`Bericht: ${OUT}`);
