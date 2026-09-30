/**
 * The AI provider adapter against a stand-in HTTP server (ADR-080): what it
 * sends, what it takes from an answer, and that no failure carries a secret
 * or the provider's raw text into what is stored.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { DEFAULT_MODEL, aiExplanationsFromEnv, createAnthropicExplainer } from "./ai-explainer.js";

const KEY = "sk-ant-test-0123456789";
const TOOL = { name: "record_explanation", description: "d", input_schema: { type: "object" } };
const OUTPUT = { summary: "s", explanation: "e", failed_checks: [], cited_checks: [], next_step: null, language: "de" };

let server, url;
const seen = [];
let reply;

before(async () => {
  server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url, headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString() || "null") });
      reply(req, res);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const json = (status, body) => (req, res) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const toolAnswer = (input = OUTPUT, extra = {}) => json(200, {
  content: [{ type: "text", text: "Here you go." }, { type: "tool_use", id: "t1", name: TOOL.name, input }],
  stop_reason: "tool_use", usage: { input_tokens: 812, output_tokens: 143 }, ...extra,
});
const explainer = (options = {}) => createAnthropicExplainer({ apiKey: KEY, url, timeoutMs: 2000, maxTokens: 800, ...options });
const ask = (options) => explainer(options).explain({ system: "sys", message: "evidence", tool: TOOL });

test("the pinned model is asked once, at temperature 0, forced to answer through the tool, without extended thinking", async () => {
  reply = toolAnswer();
  await ask();
  const { method, path, headers, body } = seen.at(-1);
  assert.deepEqual([method, path], ["POST", "/v1/messages"]);
  assert.equal(headers["x-api-key"], KEY);
  assert.equal(headers["anthropic-version"], "2023-06-01");
  assert.equal(body.model, "claude-sonnet-4-6");
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, 800);
  assert.deepEqual(body.tool_choice, { type: "tool", name: TOOL.name });
  assert.deepEqual(body.tools, [TOOL]);
  assert.equal(body.system, "sys");
  assert.deepEqual(body.messages, [{ role: "user", content: "evidence" }]);
  assert.equal(body.thinking, undefined);
});

test("an answer through the tool is returned with the model and token counts; any text beside it is dropped", async () => {
  reply = toolAnswer();
  const result = await ask();
  assert.equal(result.ok, true);
  assert.deepEqual(result.output, OUTPUT);
  assert.deepEqual(result.usage, { input_tokens: 812, output_tokens: 143 });
  assert.ok(result.durationMs >= 0);
});

test("an answer without the tool call, or cut off, is a failure", async () => {
  reply = json(200, { content: [{ type: "text", text: "I think it is fine." }], stop_reason: "end_turn", usage: {} });
  assert.deepEqual([(await ask()).ok, (await ask()).error], [false, "Antwort ohne Aufruf des Werkzeugs"]);
  reply = toolAnswer(OUTPUT, { stop_reason: "max_tokens" });
  assert.deepEqual([(await ask()).ok, (await ask()).error], [false, "Antwort abgeschnitten (max_tokens)"]);
});

test("an HTTP error keeps its status and the provider's error type, never its message or the key", async () => {
  reply = json(401, { type: "error", error: { type: "authentication_error", message: `invalid x-api-key ${KEY}` } });
  const result = await ask();
  assert.deepEqual([result.ok, result.error], [false, "HTTP 401 authentication_error"]);
  reply = (req, res) => res.writeHead(529, { "Content-Type": "text/html" }).end(`<html>${KEY}</html>`);
  assert.equal((await ask()).error, "HTTP 529");
});

test("no answer within the timeout is a failure, not a wait", async () => {
  reply = () => {};
  const result = await ask({ timeoutMs: 150 });
  assert.deepEqual([result.ok, result.error], [false, "Zeitüberschreitung nach 150 ms"]);
});

test("an unreachable provider is a failure that names the cause and nothing else", async () => {
  const closed = createServer();
  await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve));
  const { port } = closed.address();
  await new Promise((resolve) => closed.close(resolve));
  const result = await ask({ url: `http://127.0.0.1:${port}` });
  assert.deepEqual([result.ok, result.error], [false, "Nicht erreichbar (ECONNREFUSED)"]);
});

test("off unless AI_EXPLANATIONS=true; on without a key it has no explainer to call", () => {
  assert.deepEqual(aiExplanationsFromEnv({}), { enabled: false, provider: "anthropic", model: DEFAULT_MODEL, explainer: null });
  assert.deepEqual(aiExplanationsFromEnv({ AI_EXPLANATIONS: "1", ANTHROPIC_API_KEY: KEY }).enabled, false);
  const unkeyed = aiExplanationsFromEnv({ AI_EXPLANATIONS: "true" });
  assert.deepEqual([unkeyed.enabled, unkeyed.explainer], [true, null]);
  const keyed = aiExplanationsFromEnv({ AI_EXPLANATIONS: "true", ANTHROPIC_API_KEY: KEY, AI_MODEL: "claude-opus-4-1" });
  assert.deepEqual([keyed.enabled, keyed.model, keyed.explainer.model], [true, "claude-opus-4-1", "claude-opus-4-1"]);
});

test("the default model is claude-sonnet-4-6, and the timeout and output limit stay within bounds", () => {
  assert.equal(DEFAULT_MODEL, "claude-sonnet-4-6");
  const env = { AI_EXPLANATIONS: "true", ANTHROPIC_API_KEY: KEY };
  assert.deepEqual([aiExplanationsFromEnv(env).explainer.timeoutMs, aiExplanationsFromEnv(env).explainer.maxTokens], [20_000, 800]);
  assert.throws(() => aiExplanationsFromEnv({ ...env, AI_TIMEOUT_MS: "60000" }), /AI_TIMEOUT_MS/);
  assert.throws(() => aiExplanationsFromEnv({ ...env, AI_MAX_OUTPUT_TOKENS: "20000" }), /AI_MAX_OUTPUT_TOKENS/);
});
