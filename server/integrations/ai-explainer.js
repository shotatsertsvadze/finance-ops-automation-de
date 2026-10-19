import { envNumber } from "../config/env.js";

/**
 * Transport to the AI provider (ADR-080, ADR-084). It sends one request and
 * returns the structured answer, or why there is none. It knows nothing about
 * invoices or whether an answer is true: that is the domain's
 * (server/domain/ai/). A failure is described by status, error type or cause
 * only, never by the provider's text, which could echo what was sent.
 *
 * The domain describes the answer as a tool schema. Claude Sonnet 5.5 refuses
 * a forced tool choice and a non-default temperature, so the schema is sent as
 * structured output and the JSON is read from the text block.
 */
export const AI_PROVIDER = "anthropic";
export const DEFAULT_MODEL = "claude-sonnet-5-5";
const API_VERSION = "2023-06-01";

function parseJson(text) {
  if (typeof text !== "string") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function errorType(response) {
  try {
    const type = (await response.json())?.error?.type;
    return typeof type === "string" && /^[a-z_]{1,64}$/.test(type) ? ` ${type}` : "";
  } catch {
    return "";
  }
}

function failure(error, timeoutMs) {
  if (error.name === "TimeoutError") return `Zeitüberschreitung nach ${timeoutMs} ms`;
  const code = error.cause?.code;
  return `Nicht erreichbar${typeof code === "string" && /^[A-Z_]{1,32}$/.test(code) ? ` (${code})` : ""}`;
}

// Keywords structured output does not accept; the domain checks them itself.
const UNSUPPORTED = new Set(["maxLength", "minLength", "uniqueItems", "minimum", "maximum", "multipleOf"]);

/** The tool's input schema as structured output accepts it. */
export function outputSchema(schema) {
  if (Array.isArray(schema)) return schema.map(outputSchema);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(Object.entries(schema).filter(([key]) => !UNSUPPORTED.has(key)).map(([key, value]) => [key, outputSchema(value)]));
}

export function createAnthropicExplainer({ apiKey, model = DEFAULT_MODEL, timeoutMs, maxTokens, url = "https://api.anthropic.com" }) {
  return {
    provider: AI_PROVIDER,
    model,
    timeoutMs,
    maxTokens,
    async explain({ system, message, tool }) {
      const started = Date.now();
      const done = (result) => ({ durationMs: Date.now() - started, ...result });
      try {
        // One signal bounds the whole exchange, the body included.
        const response = await fetch(new URL("/v1/messages", url), {
          method: "POST",
          headers: { "x-api-key": apiKey, "anthropic-version": API_VERSION, "content-type": "application/json" },
          body: JSON.stringify({
            model, max_tokens: maxTokens, system,
            messages: [{ role: "user", content: message }],
            thinking: { type: "between_tools" },
            output_config: { format: { type: "json_schema", schema: outputSchema(tool.input_schema) } },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) return done({ ok: false, error: `HTTP ${response.status}${await errorType(response)}` });
        const body = await response.json();
        if (body.stop_reason === "max_tokens") return done({ ok: false, error: "Antwort abgeschnitten (max_tokens)" });
        if (body.stop_reason === "refusal") return done({ ok: false, error: "Anfrage vom Modell abgelehnt (refusal)" });
        const text = body.content?.find((part) => part.type === "text")?.text;
        const output = parseJson(text);
        if (output === undefined) return done({ ok: false, error: "Antwort ohne gültiges JSON" });
        const usage = { input_tokens: body.usage?.input_tokens ?? null, output_tokens: body.usage?.output_tokens ?? null };
        return done({ ok: true, output, usage });
      } catch (error) {
        return done({ ok: false, error: failure(error, timeoutMs) });
      }
    },
  };
}

/**
 * The AI configuration the app starts with. Off unless AI_EXPLANATIONS=true.
 * On without a key there is nothing to call: requests fail and say so, and a
 * production start is refused (deployment.js). The timeout stays below the
 * server's 30 s request limit.
 */
export function aiExplanationsFromEnv(env = process.env) {
  const model = env.AI_MODEL?.trim() || DEFAULT_MODEL;
  const enabled = env.AI_EXPLANATIONS === "true";
  if (!enabled) return { enabled, provider: AI_PROVIDER, model, explainer: null };
  const timeoutMs = envNumber("AI_TIMEOUT_MS", 20_000, { min: 1000, max: 25_000 }, env);
  const maxTokens = envNumber("AI_MAX_OUTPUT_TOKENS", 800, { min: 200, max: 2000 }, env);
  const explainer = env.ANTHROPIC_API_KEY ? createAnthropicExplainer({ apiKey: env.ANTHROPIC_API_KEY, model, timeoutMs, maxTokens }) : null;
  return { enabled, provider: AI_PROVIDER, model, explainer };
}
