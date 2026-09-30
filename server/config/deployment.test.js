/**
 * What stops a production start (ADR-058). Every seeded account, ADMIN
 * included, shares a password printed in the README; nothing refused to run a
 * deployment on it.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { testDeps } from "../test-support/db.js";
import { hashPassword } from "../auth/passwords.js";
import { deploymentProblems } from "./deployment.js";

let deps, clientDir;
const PRODUCTION = { NODE_ENV: "production", KOSIT_URL: "http://127.0.0.1:8081" };

before(async () => {
  deps = await testDeps();
  clientDir = mkdtempSync(path.join(tmpdir(), "finops-dist-"));
  writeFileSync(path.join(clientDir, "index.html"), "<!doctype html>");
});
after(() => deps.pool.end());

// These tests connect as the schema owner, which the audit-trail check also
// refuses; that check has its own tests in audit-role.test.js (ADR-068).
const problems = async (env, dir = clientDir) =>
  (await deploymentProblems({ pool: deps.pool, env, clientDir: dir })).filter((p) => !/Prüfpfad/.test(p));

test("a development start is never refused", async () => {
  assert.deepEqual(await problems({}, path.join(clientDir, "missing")), []);
});

test("production refuses accounts that still have the published demo password", async () => {
  const [problem, ...rest] = await problems(PRODUCTION);
  assert.equal(rest.length, 0);
  assert.match(problem, /Demo-Passwort/);
  assert.match(problem, /admin@nordwerk\.example/, "the ADMIN account is named");
});

test("an account with its own password is no longer named", async () => {
  const { hash, salt } = hashPassword("ein-eigenes-langes-passwort");
  await deps.pool.query("update finops.users set password_hash = $1, password_salt = $2 where email = 'admin@nordwerk.example'", [hash, salt]);
  const [problem] = await problems(PRODUCTION);
  assert.doesNotMatch(problem, /admin@nordwerk\.example/);
  assert.match(problem, /jonas\.weber@nordwerk\.example/);
});

test("demo mode runs production on the demo accounts deliberately", async () => {
  assert.deepEqual(await problems({ ...PRODUCTION, DEMO_MODE: "true" }), []);
});

test("production refuses to start without the built client", async () => {
  const found = await problems({ ...PRODUCTION, DEMO_MODE: "true" }, path.join(clientDir, "missing"));
  assert.equal(found.length, 1);
  assert.match(found[0], /npm run build/);
});

test("production refuses to start without an official validator", async () => {
  // Every invoice would fail closed; better to say so once, at the start (ADR-078).
  const found = await problems({ NODE_ENV: "production", DEMO_MODE: "true" });
  assert.equal(found.length, 1);
  assert.match(found[0], /KOSIT_URL/);
});

test("production refuses AI explanations switched on without a key (ADR-080)", async () => {
  const found = await problems({ ...PRODUCTION, DEMO_MODE: "true", AI_EXPLANATIONS: "true" });
  assert.equal(found.length, 1);
  assert.match(found[0], /ANTHROPIC_API_KEY/);
});

test("AI explanations off need no key, and on with a key start normally", async () => {
  assert.deepEqual(await problems({ ...PRODUCTION, DEMO_MODE: "true" }), []);
  assert.deepEqual(await problems({ ...PRODUCTION, DEMO_MODE: "true", AI_EXPLANATIONS: "true", ANTHROPIC_API_KEY: "k" }), []);
});
