/**
 * Authentication and authorization.
 *
 * Phase 5 replaces the trusted X-Actor-Id header. These tests are written from
 * the attacker's side: the interesting cases are the ones that must fail.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../app.js";
import { testDeps, DEMO_PASSWORD } from "../test-support/db.js";
import { hashPassword, verifyPassword } from "./passwords.js";

let deps, server, base;

const fixture = (name) => readFileSync(new URL(`../../fixtures/xrechnung/${name}`, import.meta.url), "utf8");

/** Minimal cookie jar: these tests care about what the browser would send. */
function jar() {
  const cookies = new Map();
  return {
    absorb(res) {
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(";");
        const idx = pair.indexOf("=");
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (value === "" ) cookies.delete(name);
        else cookies.set(name, value);
      }
      return res;
    },
    header: () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    get: (name) => cookies.get(name),
    raw: cookies,
  };
}

const call = (path, { method = "GET", cookies, body, headers = {}, csrf } = {}) =>
  fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookies ? { Cookie: cookies.header() } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function login(email, password = DEMO_PASSWORD) {
  const cookies = jar();
  const res = cookies.absorb(await call("/api/auth/login", { method: "POST", body: { email, password } }));
  return { res, cookies, csrf: cookies.get("finops_csrf") };
}

const CLERK = "anna.berger@nordwerk.example";
const MANAGER = "tim.kessler@nordwerk.example";
const FINANCE = "jonas.weber@nordwerk.example";

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await deps.pool.end();
});
beforeEach(async () => {
  await deps.pool.query("delete from finops.invoices");
  await deps.pool.query("delete from finops.sessions");
  await deps.pool.query("update finops.users set failed_attempts = 0, locked_until = null");
});

// ---------------------------------------------------------------- hashing ---

test("a password verifies against its own hash and nothing else", () => {
  const { hash, salt } = hashPassword("korrekt-pferd-batterie");
  assert.equal(verifyPassword("korrekt-pferd-batterie", hash, salt), true);
  assert.equal(verifyPassword("korrekt-pferd-batterei", hash, salt), false);
  assert.equal(verifyPassword("", hash, salt), false);
});

test("the same password hashes differently for two users", () => {
  const a = hashPassword("gleiches-passwort");
  const b = hashPassword("gleiches-passwort");
  assert.notEqual(a.hash, b.hash, "a per-user salt means no shared rainbow table");
  assert.notEqual(a.salt, b.salt);
});

// ----------------------------------------------------------------- login ----

test("a correct password logs in and returns the user without any secret", async () => {
  const { res } = await login(CLERK);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.email, CLERK);
  assert.equal(body.user.role, "AP_CLERK");
  const serialised = JSON.stringify(body);
  assert.ok(!/password|hash|salt|token/i.test(serialised), `no secret in the response: ${serialised}`);
});

test("the session cookie is HttpOnly and SameSite=Strict", async () => {
  const res = await call("/api/auth/login", { method: "POST", body: { email: CLERK, password: DEMO_PASSWORD } });
  const setCookies = res.headers.getSetCookie();
  const session = setCookies.find((c) => c.startsWith("finops_session="));
  assert.ok(session, "a session cookie is set");
  assert.match(session, /HttpOnly/i, "script must not be able to read the session");
  assert.match(session, /SameSite=Strict/i);
});

test("a wrong password is refused, and so is an unknown address, with the same answer", async () => {
  const wrong = await call("/api/auth/login", { method: "POST", body: { email: CLERK, password: "falsch" } });
  const unknown = await call("/api/auth/login", { method: "POST", body: { email: "niemand@nordwerk.example", password: "falsch" } });

  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json(), "the answer must not reveal whether the account exists");
});

test("repeated failures lock the account, and the lock outlives a correct password", async () => {
  for (let i = 0; i < 5; i += 1) {
    await call("/api/auth/login", { method: "POST", body: { email: MANAGER, password: "falsch" } });
  }
  const res = await call("/api/auth/login", { method: "POST", body: { email: MANAGER, password: DEMO_PASSWORD } });
  assert.equal(res.status, 429, "guessing must not stay free");
});

test("a successful login clears the failure counter", async () => {
  await call("/api/auth/login", { method: "POST", body: { email: FINANCE, password: "falsch" } });
  const { res } = await login(FINANCE);
  assert.equal(res.status, 200);
  const { rows } = await deps.pool.query("select failed_attempts from finops.users where email = $1", [FINANCE]);
  assert.equal(rows[0].failed_attempts, 0);
});

// --------------------------------------------------------------- sessions ---

test("a protected route refuses a request with no session", async () => {
  const res = await call("/api/invoices");
  assert.equal(res.status, 401);
});

test("a forged session token is refused", async () => {
  const forged = jar();
  forged.raw.set("finops_session", "not-a-real-token");
  const res = await call("/api/invoices", { cookies: forged });
  assert.equal(res.status, 401);
});

test("the old X-Actor-Id header no longer grants an identity", async () => {
  const { rows: [user] } = await deps.pool.query("select id from finops.users where email = $1", [FINANCE]);
  const res = await call("/api/invoices", { headers: { "x-actor-id": user.id } });
  assert.equal(res.status, 401, "the trusted header is gone, not merely deprecated");
});

test("logout revokes the session so the same cookie stops working", async () => {
  const { cookies, csrf } = await login(CLERK);
  assert.equal((await call("/api/invoices", { cookies })).status, 200);

  const out = await call("/api/auth/logout", { method: "POST", cookies, csrf, body: {} });
  assert.equal(out.status, 200);

  const after = await call("/api/invoices", { cookies });
  assert.equal(after.status, 401, "a revoked session is dead even if the cookie is replayed");
});

test("an expired session is refused", async () => {
  const { cookies } = await login(CLERK);
  await deps.pool.query("update finops.sessions set expires_at = now() - interval '1 minute'");
  const res = await call("/api/invoices", { cookies });
  assert.equal(res.status, 401);
});

test("GET /api/auth/me reports the signed-in user, or 401", async () => {
  assert.equal((await call("/api/auth/me")).status, 401);
  const { cookies } = await login(MANAGER);
  const res = await call("/api/auth/me", { cookies });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user.role, "MANAGER");
});

// ------------------------------------------------------------------ CSRF ----

test("a state-changing request without the CSRF token is refused", async () => {
  const { cookies } = await login(FINANCE);
  const res = await call("/api/reconciliation/run", { method: "POST", cookies, body: {} });
  assert.equal(res.status, 403, "a cookie alone must not be enough to act");
});

test("a state-changing request with a mismatched CSRF token is refused", async () => {
  const { cookies } = await login(FINANCE);
  const res = await call("/api/reconciliation/run", { method: "POST", cookies, csrf: "wrong-token", body: {} });
  assert.equal(res.status, 403);
});

test("reads do not need a CSRF token", async () => {
  const { cookies } = await login(CLERK);
  assert.equal((await call("/api/invoices", { cookies })).status, 200);
});

// --------------------------------------------------------- authorization ---

test("a manager cannot make review decisions", async () => {
  const { cookies: clerk, csrf: clerkCsrf } = await login(CLERK);
  const form = new FormData();
  form.append("file", new Blob([fixture("B_iban_changed_2499.xml")], { type: "application/xml" }), "B.xml");
  const upload = await fetch(`${base}/api/invoices`, {
    method: "POST", body: form, headers: { Cookie: clerk.header(), "X-CSRF-Token": clerkCsrf },
  });
  const invoice = await upload.json();
  assert.equal(invoice.state, "REVIEW_REQUIRED");

  const { cookies: manager, csrf: managerCsrf } = await login(MANAGER);
  const res = await call(`/api/invoices/${invoice.id}/review/accept`, {
    method: "POST", cookies: manager, csrf: managerCsrf, body: { comment: "x" },
  });
  assert.equal(res.status, 403, "review belongs to accounts payable and finance");
});

test("a clerk cannot hand an invoice to accounting or instruct a payment", async () => {
  const { cookies, csrf } = await login(CLERK);
  const form = new FormData();
  form.append("file", new Blob([fixture("G_clean_380.xml")], { type: "application/xml" }), "G.xml");
  const upload = await fetch(`${base}/api/invoices`, {
    method: "POST", body: form, headers: { Cookie: cookies.header(), "X-CSRF-Token": csrf },
  });
  const invoice = await upload.json();
  assert.equal(invoice.state, "APPROVED");

  const res = await call(`/api/invoices/${invoice.id}/accounting-record`, { method: "POST", cookies, csrf, body: {} });
  assert.equal(res.status, 403);
});

test("finance can do the money path that the clerk cannot", async () => {
  const { cookies: clerk, csrf: clerkCsrf } = await login(CLERK);
  const form = new FormData();
  form.append("file", new Blob([fixture("G_clean_380.xml")], { type: "application/xml" }), "G.xml");
  const upload = await fetch(`${base}/api/invoices`, {
    method: "POST", body: form, headers: { Cookie: clerk.header(), "X-CSRF-Token": clerkCsrf },
  });
  const invoice = await upload.json();

  const { cookies, csrf } = await login(FINANCE);
  const res = await call(`/api/invoices/${invoice.id}/accounting-record`, { method: "POST", cookies, csrf, body: {} });
  assert.equal(res.status, 200);
});

test("the audit trail records the authenticated user, not a claimed one", async () => {
  const { cookies, csrf } = await login(CLERK);
  const form = new FormData();
  form.append("file", new Blob([fixture("A_clean_1240.xml")], { type: "application/xml" }), "A.xml");
  const upload = await fetch(`${base}/api/invoices`, {
    method: "POST", body: form,
    // A claimed identity in the old header must be ignored entirely.
    headers: { Cookie: cookies.header(), "X-CSRF-Token": csrf, "x-actor-id": "00000000-0000-0000-0000-000000000005" },
  });
  const invoice = await upload.json();
  assert.equal(invoice.audit_events[0].actor_name, "Anna Berger");
});

test("the session reports what the role may do, so the UI need not guess", async () => {
  const { cookies } = await login(MANAGER);
  const body = await (await call("/api/auth/me", { cookies })).json();
  assert.ok(body.permissions.includes("approval:decide"));
  assert.ok(!body.permissions.includes("review:decide"), "a manager does not review");
  assert.ok(!body.permissions.includes("payment:instruct"));

  const { cookies: finance } = await login(FINANCE);
  const financeBody = await (await call("/api/auth/me", { cookies: finance })).json();
  assert.ok(financeBody.permissions.includes("review:decide"));
  assert.ok(financeBody.permissions.includes("payment:instruct"));
});
