/**
 * Timeouts and shutdown (ADR-075). The pool had no connection or statement
 * limit, so a database that hung took every request with it, and the process
 * ignored SIGTERM, so a deploy cut requests off mid-flight.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createPool } from "./db.js";

test("a statement that runs too long is cancelled", async () => {
  const pool = createPool(process.env.TEST_DATABASE_URL, { statementTimeoutMs: 200 });
  try {
    await assert.rejects(() => pool.query("select pg_sleep(2)"), /statement timeout/);
  } finally {
    await pool.end();
  }
});

test("a database that cannot be reached fails fast instead of hanging", async () => {
  // A non-routable address: without a timeout the connect waits for the OS.
  const pool = createPool("postgresql://10.255.255.1:5432/none", { connectTimeoutMs: 300 });
  const started = Date.now();
  try {
    await assert.rejects(() => pool.query("select 1"));
    assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
  } finally {
    await pool.end();
  }
});

test("SIGTERM stops the server cleanly", async () => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, API_PORT: "4417", NODE_ENV: "development", LOG_LEVEL: "info" },
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`did not start: ${output}`)), 10000);
    child.stdout.on("data", () => { if (output.includes("listening")) { clearTimeout(timer); resolve(); } });
  });
  assert.equal((await fetch("http://127.0.0.1:4417/api/health")).status, 200);

  child.kill("SIGTERM");
  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.equal(code, 0, output);
  assert.match(output, /shutting down/);
  assert.match(output, /stopped/);
});
