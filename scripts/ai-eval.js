import { readdirSync, readFileSync } from "node:fs";
import { aiExplanationsFromEnv } from "../server/integrations/ai-explainer.js";
import { verifyExplanation } from "../server/domain/ai/grounding.js";
import { explanationTool, systemPrompt, userMessage } from "../server/domain/ai/prompt.js";

/**
 * `npm run ai:eval`: the five evaluation scenarios against the real model,
 * run by hand (ADR-080). Needs ANTHROPIC_API_KEY and costs money, so CI never
 * runs it; CI verifies the committed good and bad answers instead. Reports how
 * many answers pass the grounding check, and why the others do not.
 */
const RUNS = Number(process.env.AI_EVAL_RUNS ?? 2);
const env = { ...process.env, AI_EXPLANATIONS: "true" };
const { explainer, model } = aiExplanationsFromEnv(env);
if (!explainer) {
  console.error("ANTHROPIC_API_KEY fehlt: die Auswertung gegen das echte Modell läuft nur mit Schlüssel");
  process.exit(1);
}

const dir = new URL("../fixtures/ai/", import.meta.url);
const scenarios = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));
let accepted = 0;
let total = 0;
console.log(`Modell ${model}, ${RUNS} Läufe je Szenario und Sprache`);
for (const { scenario, input: german } of scenarios) {
  for (const language of ["de", "en"]) {
    const input = { ...german, language };
    for (let run = 1; run <= RUNS; run += 1) {
      total += 1;
      const result = await explainer.explain({ system: systemPrompt(language), message: userMessage(input), tool: explanationTool(input) });
      if (!result.ok) {
        console.log(`${scenario} ${language} #${run}: FAILED ${result.error}`);
        continue;
      }
      const { accepted: ok, reasons } = verifyExplanation(input, result.output);
      if (ok) accepted += 1;
      console.log(`${scenario} ${language} #${run}: ${ok ? "ACCEPTED" : `REJECTED ${reasons.map((r) => `${r.rule}(${r.detail})`).join("; ")}`}`);
      if (ok || process.env.AI_EVAL_VERBOSE) console.log(`  ${result.output.summary}\n  ${result.output.explanation}`);
    }
  }
}
console.log(`${accepted} von ${total} Antworten angenommen`);
