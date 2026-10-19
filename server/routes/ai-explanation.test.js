/**
 * The AI explanation endpoints (ADR-080): who may ask, what a caller sees,
 * and that the invoice itself is served the same whether AI is on or off.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { loginAs, testDeps } from "../test-support/db.js";
import { runScenario, scenarioFixture } from "../test-support/ai-scenarios.js";
import { AI_OFF, aiEnabled, fakeExplainer, replies } from "../test-support/ai.js";

let deps, server, clients, id;
const [GERMAN] = scenarioFixture("1_iban_mismatch").good;

before(async () => {
  deps = await testDeps();
  deps.ai = AI_OFF;
  server = createApp(deps).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  clients = { clerk: await loginAs(base, "clerk"), manager: await loginAs(base, "manager") };
});
after(async () => {
  server.close();
  await deps.pool.end();
});
beforeEach(async () => {
  deps.ai = AI_OFF;
  id = await runScenario(deps, "1_iban_mismatch");
});

const path = (language = "de") => `/api/invoices/${id}/ai-explanation?language=${language}`;

test("off: the endpoint says so, and asking is refused with a code", async () => {
  assert.deepEqual(await (await clients.clerk.get(path())).json(), { enabled: false });
  const res = await clients.clerk.post(path(), {});
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "AI_DISABLED");
});

test("a reviewer asks and gets the explanation, marked as AI-generated", async () => {
  deps.ai = aiEnabled(fakeExplainer(replies.output(GERMAN)));
  const res = await clients.clerk.post(path(), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual([body.status, body.ai_generated, body.summary, body.model], ["ACCEPTED", true, GERMAN.summary, "claude-sonnet-5-5"]);
  const current = await (await clients.clerk.get(path())).json();
  assert.deepEqual([current.enabled, current.eligible, current.explanation.summary], [true, true, GERMAN.summary]);
});

test("only someone who may decide a review can ask; anyone who can read the invoice can read the answer", async () => {
  deps.ai = aiEnabled(fakeExplainer(replies.output(GERMAN)));
  assert.equal((await clients.manager.post(path(), {})).status, 403);
  assert.equal((await clients.manager.get(path())).status, 200);
});

test("an unknown language is refused", async () => {
  deps.ai = aiEnabled(fakeExplainer(replies.output(GERMAN)));
  const res = await clients.clerk.post(path("fr"), {});
  assert.deepEqual([res.status, (await res.json()).code], [400, "AI_LANGUAGE_UNKNOWN"]);
});

test("the invoice is served the same with AI on or off, and carries no AI text", async () => {
  const off = await (await clients.clerk.get(`/api/invoices/${id}`)).json();
  deps.ai = aiEnabled(fakeExplainer(replies.output(GERMAN)));
  await clients.clerk.post(path(), {});
  const on = await (await clients.clerk.get(`/api/invoices/${id}`)).json();
  assert.deepEqual(on, off);
  assert.ok(!JSON.stringify(on).includes(GERMAN.summary));
});
