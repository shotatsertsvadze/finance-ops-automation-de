/**
 * Tracing a request in production (ADR-060). There was no request id, the only
 * log line was a bare console.error of a 500, and /api/health said "ok" with
 * the database down.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { testDeps } from "./test-support/db.js";
import { logOutput } from "./log.js";

let deps;
before(async () => {
  deps = await testDeps();
});
after(() => deps.pool.end());

/** Serves `app` for one callback, collecting the JSON lines it logs. */
async function withServer(app, fn) {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const lines = [];
  // Not process.stdout: the test runner reports through it.
  const write = logOutput.write;
  const level = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "info";
  logOutput.write = (line) => lines.push(JSON.parse(line));
  try {
    await fn(base, lines);
    // The request line is written when the response finishes, a tick later.
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    logOutput.write = write;
    process.env.LOG_LEVEL = level;
    server.close();
  }
  return lines;
}

test("every response names its request, and a caller's id is kept", async () => {
  await withServer(createApp(deps), async (base) => {
    const fresh = await fetch(`${base}/api/health`);
    assert.match(fresh.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);

    const kept = await fetch(`${base}/api/health`, { headers: { "X-Request-Id": "lb-7f3a" } });
    assert.equal(kept.headers.get("x-request-id"), "lb-7f3a");

    const bad = await fetch(`${base}/api/health`, { headers: { "X-Request-Id": "x".repeat(200) } });
    assert.match(bad.headers.get("x-request-id"), /^[0-9a-f-]{36}$/, "an unusable id is replaced");
  });
});

test("each request is logged as one JSON line, without its query or body", async () => {
  const lines = await withServer(createApp(deps), async (base) => {
    await fetch(`${base}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Request-Id": "req-1" },
      body: JSON.stringify({ email: "anna.berger@nordwerk.example", password: "geheim-falsch" }),
    });
    await fetch(`${base}/api/invoices?state=APPROVED`, { headers: { "X-Request-Id": "req-2" } });
  });
  const login = lines.find((l) => l.request_id === "req-1");
  assert.equal(login.msg, "request");
  assert.equal(login.level, "info");
  assert.deepEqual([login.method, login.path, login.status], ["POST", "/api/auth/login", 401]);
  assert.equal(typeof login.ms, "number");
  assert.ok(login.time);
  assert.equal(lines.find((l) => l.request_id === "req-2").path, "/api/invoices");
  assert.doesNotMatch(JSON.stringify(lines), /geheim-falsch|state=APPROVED/, "no secret and no query string in the log");
});

test("an internal error is logged with its request id, which the caller is given", async () => {
  const broken = { query: async () => { throw new Error("connection terminated unexpectedly"); } };
  const lines = await withServer(createApp({ pool: broken }), async (base) => {
    const res = await fetch(`${base}/api/invoices`, { headers: { Cookie: "finops_session=abc", "X-Request-Id": "req-500" } });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.code, "INTERNAL_ERROR");
    assert.equal(body.details.request_id, "req-500");
    assert.doesNotMatch(JSON.stringify(body), /connection terminated/, "the cause stays on the server");
  });
  const error = lines.find((l) => l.level === "error" && l.request_id === "req-500");
  assert.equal(error.error, "connection terminated unexpectedly");
  assert.match(error.stack, /Error: connection terminated/);
});

test("readiness asks the database, and says so when it cannot answer", async () => {
  await withServer(createApp(deps), async (base) => {
    const res = await fetch(`${base}/api/health/ready`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, database: "ok" });
  });

  const hanging = { query: () => new Promise(() => {}) };
  await withServer(createApp({ pool: hanging }), async (base) => {
    const started = Date.now();
    const res = await fetch(`${base}/api/health/ready`);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { ok: false, database: "unreachable" });
    assert.ok(Date.now() - started < 5000, "a database that never answers does not hang the check");
  });
});
