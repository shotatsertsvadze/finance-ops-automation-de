/**
 * The supplier inquiry endpoints (ADR-084): who may draft, approve and mark
 * sent, what a caller sees, and that nothing is offered with AI off.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { loginAs, testDeps } from "../test-support/db.js";
import { runScenario } from "../test-support/ai-scenarios.js";
import { AI_OFF, aiEnabled, fakeExplainer, replies } from "../test-support/ai.js";

let deps, server, clients, id;

const DRAFT = {
  subject: "Rückfrage zu Ihrer Rechnung {{rechnungsnummer}}",
  body: "Sehr geehrte Damen und Herren,\n\nder Nettobetrag von 8500.00 EUR übersteigt den offenen Betrag der Bestellung {{bestellnummer}}. Bitte erläutern Sie die Differenz.\n\nMit freundlichen Grüßen\nKreditorenbuchhaltung",
  cited_checks: ["po_amount_within_tolerance"],
  requests: ["betrag_klaeren"],
  language: "de",
};

before(async () => {
  deps = await testDeps();
  deps.ai = AI_OFF;
  server = createApp(deps).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  clients = { clerk: await loginAs(base, "clerk"), manager: await loginAs(base, "manager"), finance: await loginAs(base, "finance") };
});
after(async () => {
  server.close();
  await deps.pool.end();
});
beforeEach(async () => {
  deps.ai = AI_OFF;
  id = await runScenario(deps, "2_po_overrun");
});

const path = (suffix = "") => `/api/invoices/${id}/supplier-inquiry${suffix}`;

test("off: the endpoint says so, and every action is refused with a code", async () => {
  assert.deepEqual(await (await clients.clerk.get(path())).json(), { enabled: false });
  for (const suffix of ["/draft", "/approve"]) {
    const res = await clients.clerk.post(path(suffix), {});
    assert.deepEqual([res.status, (await res.json()).code], [409, "AI_DISABLED"], suffix);
  }
});

test("a reviewer drafts, approves and marks sent; the view follows each step", async () => {
  deps.ai = aiEnabled(fakeExplainer(replies.output(DRAFT)));
  const start = await (await clients.clerk.get(path())).json();
  assert.deepEqual([start.enabled, start.eligible, start.ai.status, start.inquiries], [true, true, "NONE", []]);
  const draft = await (await clients.clerk.post(path("/draft"), {})).json();
  assert.equal(draft.status, "ACCEPTED");
  const approved = await (
    await clients.clerk.post(path("/approve"), { source: "AI", ai_inquiry_id: draft.id, subject: draft.subject, body: draft.body })
  ).json();
  assert.equal(approved.inquiries[0].status, "APPROVED");
  const sent = await (await clients.finance.post(path(`/${approved.inquiries[0].id}/sent`), {})).json();
  assert.deepEqual([sent.state, sent.inquiries[0].status], ["INFO_REQUESTED", "SENT"]);
});

test("only someone who may decide a review can draft, approve or mark sent; anyone signed in can read", async () => {
  deps.ai = aiEnabled(fakeExplainer(replies.output(DRAFT)));
  assert.equal((await clients.manager.get(path())).status, 200);
  for (const suffix of ["/draft", "/approve", "/00000000-0000-0000-0000-000000000000/sent"]) {
    assert.equal((await clients.manager.post(path(suffix), {})).status, 403, suffix);
  }
});

test("an id that cannot be an inquiry or a draft is refused before the database sees it", async () => {
  deps.ai = aiEnabled(fakeExplainer(replies.output(DRAFT)));
  const sent = await clients.clerk.post(path("/not-a-uuid/sent"), {});
  assert.deepEqual([sent.status, (await sent.json()).code], [404, "INQUIRY_NOT_FOUND"]);
  const approve = await clients.clerk.post(path("/approve"), { source: "AI", ai_inquiry_id: "x", subject: "a", body: "b" });
  assert.deepEqual([approve.status, (await approve.json()).code], [400, "INQUIRY_DRAFT_UNKNOWN"]);
});
