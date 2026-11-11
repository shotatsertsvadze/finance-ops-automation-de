import { AI_PROVIDER, DEFAULT_MODEL } from "../integrations/ai-explainer.js";

/**
 * A stand-in for the AI provider (ADR-080). Tests never call a real model:
 * this records every request and answers as the test says, in the shape the
 * real adapter returns. `scripts/ai-eval.js` is the only real call, by hand.
 */
export function fakeExplainer(answer, { model = DEFAULT_MODEL } = {}) {
  const fake = {
    provider: AI_PROVIDER,
    model,
    answer,
    calls: [],
    async explain(request) {
      fake.calls.push(request);
      return { durationMs: 3, ...(await fake.answer(request)) };
    },
  };
  return fake;
}

/** The deps.ai an enabled app has; `explainer` null is enabled without a key. */
export const aiEnabled = (explainer) => ({
  enabled: true,
  provider: AI_PROVIDER,
  model: explainer?.model ?? DEFAULT_MODEL,
  explainer,
});

export const AI_OFF = { enabled: false, provider: AI_PROVIDER, model: DEFAULT_MODEL, explainer: null };

export const replies = {
  output: (output) => () => ({ ok: true, output, usage: { input_tokens: 700, output_tokens: 120 } }),
  timeout: () => ({ ok: false, error: "Zeitüberschreitung nach 20000 ms" }),
  unavailable: () => ({ ok: false, error: "Nicht erreichbar (ECONNREFUSED)" }),
};

/** The input a request carried, as the model saw it. */
export const sentInput = (request) => JSON.parse(request.message.match(/```json\n([\s\S]*)\n```/)[1]);
