/**
 * Replacing a demo password (ADR-058). A production start refuses the
 * published one, so there has to be a way to set another.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { loginAs, testDeps } from "../test-support/db.js";
import { setPassword } from "./set-password.js";

let deps, server, base;
before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await deps.pool.end();
});

test("a new password replaces the old one and ends the sessions opened with it", async () => {
  const before = await loginAs(base, "cfo");
  await setPassword(deps.pool, "sabine.vogt@nordwerk.example", "ein-eigenes-langes-passwort");

  assert.equal((await before.get("/api/auth/me")).status, 401, "the old session is over");
  await assert.rejects(() => loginAs(base, "cfo"), /401/, "the demo password no longer works");
  const after = await loginAs(base, "cfo", "ein-eigenes-langes-passwort");
  assert.equal((await after.get("/api/auth/me")).status, 200);
});

test("a short password or an unknown account is refused", async () => {
  await assert.rejects(() => setPassword(deps.pool, "sabine.vogt@nordwerk.example", "kurz"), /mindestens 12/);
  await assert.rejects(() => setPassword(deps.pool, "niemand@nordwerk.example", "ein-eigenes-langes-passwort"), /Kein Konto/);
});
