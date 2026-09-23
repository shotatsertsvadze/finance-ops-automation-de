/**
 * Sessions at volume (ADR-065). Every request wrote last_seen_at, a write per
 * read, and ended sessions were never removed, so the table only grew.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { loginAs, testDeps } from "../test-support/db.js";

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

const lastSeen = async () =>
  (await deps.pool.query("select last_seen_at from finops.sessions where revoked_at is null order by created_at desc limit 1")).rows[0].last_seen_at;

test("a request within a minute of the last one writes nothing", async () => {
  const clerk = await loginAs(base, "clerk");
  await deps.pool.query("update finops.sessions set last_seen_at = now() - interval '30 seconds'");
  const before = await lastSeen();
  await clerk.get("/api/auth/me");
  assert.deepEqual(await lastSeen(), before);
});

test("a request after a minute refreshes last_seen_at", async () => {
  const clerk = await loginAs(base, "clerk");
  await deps.pool.query("update finops.sessions set last_seen_at = now() - interval '2 minutes'");
  const before = await lastSeen();
  await clerk.get("/api/auth/me");
  assert.ok(await lastSeen() > before);
});

test("signing in clears sessions that ended more than a day ago", async () => {
  const { rows: [user] } = await deps.pool.query("select id from finops.users where email = 'anna.berger@nordwerk.example'");
  const add = (hash, expires, revoked) => deps.pool.query(
    "insert into finops.sessions (user_id, token_hash, csrf_token, expires_at, revoked_at) values ($1, $2, 'x', $3, $4)",
    [user.id, hash, expires, revoked],
  );
  await add("old-expired", new Date(Date.now() - 2 * 86400000), null);
  await add("old-revoked", new Date(Date.now() + 3600000), new Date(Date.now() - 2 * 86400000));
  await add("just-expired", new Date(Date.now() - 3600000), null);

  await loginAs(base, "manager");
  const { rows } = await deps.pool.query("select token_hash from finops.sessions where token_hash in ('old-expired', 'old-revoked', 'just-expired')");
  assert.deepEqual(rows.map((r) => r.token_hash), ["just-expired"], "a day's history stays for anyone asking who was signed in");
});
