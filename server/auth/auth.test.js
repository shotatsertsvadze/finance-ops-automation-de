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
import { hashPassword, verifyNobody, verifyPassword } from "./passwords.js";

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
        if (value === "") cookies.delete(name);
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
  await deps.pool.query("delete from finops.login_failures");
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

test("repeated failures stop that address, even with the right password", async () => {
  for (let i = 0; i < 5; i += 1) {
    await call("/api/auth/login", { method: "POST", body: { email: MANAGER, password: "falsch" } });
  }
  const res = await call("/api/auth/login", { method: "POST", body: { email: MANAGER, password: DEMO_PASSWORD } });
  assert.equal(res.status, 429, "guessing must not stay free");
  assert.equal((await res.json()).code, "LOGIN_THROTTLED");
  assert.equal(res.headers.get("retry-after"), "900");
});

test("an unknown address is throttled exactly like a real one", async () => {
  // A 429 that only real accounts earned would enumerate them.
  const guess = (email) => call("/api/auth/login", { method: "POST", body: { email, password: "falsch" } });
  for (let i = 0; i < 5; i += 1) {
    await guess(CLERK);
    await guess("niemand@nordwerk.example");
  }
  const known = await guess(CLERK);
  const unknown = await guess("niemand@nordwerk.example");
  assert.equal(known.status, 429);
  assert.equal(unknown.status, 429);
  assert.deepEqual(await known.json(), await unknown.json());
});

test("one address guessing across many accounts is stopped", async () => {
  // Password spraying: one guess per account never reaches the per-account
  // limit, so the address has a limit of its own.
  const spray = (i) => call("/api/auth/login", { method: "POST", body: { email: `person${i}@nordwerk.example`, password: "Sommer2026!" } });
  for (let i = 0; i < 20; i += 1) assert.equal((await spray(i)).status, 401);
  assert.equal((await spray(20)).status, 429);
  const elsewhere = await call("/api/auth/login", {
    method: "POST",
    body: { email: CLERK, password: DEMO_PASSWORD },
    headers: { "X-Forwarded-For": "198.51.100.4" },
  });
  assert.equal(elsewhere.status, 200, "other addresses are untouched");
});

test("someone guessing a password does not lock its owner out", async () => {
  // Five wrong passwords used to lock the account itself, so anyone who knew
  // an address could shut the CFO out at will (ADR-059).
  const from = (ip) => ({ "X-Forwarded-For": ip });
  for (let i = 0; i < 6; i += 1) {
    await call("/api/auth/login", { method: "POST", body: { email: MANAGER, password: "falsch" }, headers: from("203.0.113.9") });
  }
  const owner = await call("/api/auth/login", {
    method: "POST",
    body: { email: MANAGER, password: DEMO_PASSWORD },
    headers: from("198.51.100.4"),
  });
  assert.equal(owner.status, 200, "the owner signs in from their own address");
});

test("a successful login clears the failure counter", async () => {
  await call("/api/auth/login", { method: "POST", body: { email: FINANCE, password: "falsch" } });
  const { res } = await login(FINANCE);
  assert.equal(res.status, 200);
  const { rows } = await deps.pool.query("select count(*)::int as n from finops.login_failures where email = $1", [FINANCE]);
  assert.equal(rows[0].n, 0);
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
  const {
    rows: [user],
  } = await deps.pool.query("select id from finops.users where email = $1", [FINANCE]);
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
    method: "POST",
    body: form,
    headers: { Cookie: clerk.header(), "X-CSRF-Token": clerkCsrf },
  });
  const invoice = await upload.json();
  assert.equal(invoice.state, "REVIEW_REQUIRED");

  const { cookies: manager, csrf: managerCsrf } = await login(MANAGER);
  const res = await call(`/api/invoices/${invoice.id}/review/accept`, {
    method: "POST",
    cookies: manager,
    csrf: managerCsrf,
    body: { comment: "x" },
  });
  assert.equal(res.status, 403, "review belongs to accounts payable and finance");
});

test("a clerk cannot hand an invoice to accounting or instruct a payment", async () => {
  const { cookies, csrf } = await login(CLERK);
  const form = new FormData();
  form.append("file", new Blob([fixture("G_clean_380.xml")], { type: "application/xml" }), "G.xml");
  const upload = await fetch(`${base}/api/invoices`, {
    method: "POST",
    body: form,
    headers: { Cookie: cookies.header(), "X-CSRF-Token": csrf },
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
    method: "POST",
    body: form,
    headers: { Cookie: clerk.header(), "X-CSRF-Token": clerkCsrf },
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
    method: "POST",
    body: form,
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

test("parallel wrong passwords cannot outrun the throttle", async () => {
  // Each attempt is recorded before its password is checked, so simultaneous
  // guesses count one another: of twelve at once, no more than the limit get
  // as far as a password check.
  const guess = () => call("/api/auth/login", { method: "POST", body: { email: CLERK, password: "falsch" } });
  const results = await Promise.all(Array.from({ length: 12 }, guess));
  const checked = results.filter((r) => r.status === 401).length;
  assert.ok(results.every((r) => [401, 429].includes(r.status)));
  assert.ok(checked <= 5, `at most five guesses may be checked, ${checked} were`);

  const after = await call("/api/auth/login", { method: "POST", body: { email: CLERK, password: DEMO_PASSWORD } });
  assert.equal(after.status, 429, "guessing in parallel must not stay free");
});

test("a further guess while throttled keeps the address throttled", async () => {
  for (let i = 0; i < 6; i += 1) {
    await call("/api/auth/login", { method: "POST", body: { email: MANAGER, password: "falsch" } });
  }
  const res = await call("/api/auth/login", { method: "POST", body: { email: MANAGER, password: DEMO_PASSWORD } });
  assert.equal(res.status, 429);
});

// ------------------------------------------------------- user enumeration ---

test("verifying nobody costs the same work as verifying somebody", () => {
  // The unit-level guarantee behind the timing test below: both paths run
  // scrypt once. Compared as a ratio, because absolute timings depend on the
  // machine, and with a generous bound, because the difference this guards
  // against was roughly forty-fold.
  const { hash, salt } = hashPassword("ein-passwort");
  const measure = (fn) => {
    const runs = [];
    for (let i = 0; i < 5; i += 1) {
      const t0 = process.hrtime.bigint();
      fn();
      runs.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    return runs.sort((a, b) => a - b)[2];
  };

  const real = measure(() => verifyPassword("falsch", hash, salt));
  const nobody = measure(() => verifyNobody("falsch"));
  assert.equal(verifyNobody("falsch"), false, "it never succeeds");
  assert.ok(nobody > real / 3, `an unknown address must not be cheap: ${nobody.toFixed(1)}ms vs ${real.toFixed(1)}ms`);
});

test("a wrong password and an unknown address take comparable time", async () => {
  // Identical wording is not enough: answering an unknown address in a
  // millisecond and a known one in forty enumerates the staff list.
  const attempt = async (email) => {
    await deps.pool.query("delete from finops.login_failures");
    const t0 = process.hrtime.bigint();
    const res = await call("/api/auth/login", { method: "POST", body: { email, password: "definitiv-falsch" } });
    await res.text();
    return { ms: Number(process.hrtime.bigint() - t0) / 1e6, status: res.status };
  };

  const known = [],
    unknown = [];
  for (let i = 0; i < 7; i += 1) {
    const u = await attempt("niemand.gibtesnicht@nordwerk.example");
    const k = await attempt(CLERK);
    assert.equal(u.status, 401);
    assert.equal(k.status, 401);
    unknown.push(u.ms);
    known.push(k.ms);
  }
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const ratio = median(known) / median(unknown);
  assert.ok(ratio < 3, `timing must not reveal whether the account exists: ${ratio.toFixed(2)}x`);
});

test("failures older than the window no longer count", async () => {
  for (let i = 0; i < 6; i += 1) {
    await call("/api/auth/login", { method: "POST", body: { email: FINANCE, password: "falsch" } });
  }
  // Move the failures into the past, as time would.
  await deps.pool.query("update finops.login_failures set failed_at = now() - interval '16 minutes'");

  const one = await call("/api/auth/login", { method: "POST", body: { email: FINANCE, password: "falsch" } });
  assert.equal(one.status, 401, "the address may try again");
  const {
    rows: [left],
  } = await deps.pool.query("select count(*)::int as n from finops.login_failures");
  assert.equal(left.n, 1, "the old failures are gone, and one wrong attempt does not throttle again");
});
