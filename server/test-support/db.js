import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPool } from "../db.js";
import { createStorage } from "../storage/files.js";
import { loadPolicy } from "../config/policy.js";
import { loadCompany } from "../config/company.js";
import { reset } from "../../scripts/reset.js";
// Imported as well as re-exported: a bare `export ... from` does not bind it locally.
import { DEMO_PASSWORD } from "../../scripts/seed.js";
export { DEMO_PASSWORD };

/**
 * Fresh schema in TEST_DATABASE_URL (dropped and rebuilt), temp storage dir,
 * default policy. Returns deps for the domain functions and createApp().
 */
export async function testDeps() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  // reset() drops the schema. Refusing to run against the development
  // database turns a catastrophic typo into an error message.
  if (process.env.DATABASE_URL && url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL darf nicht auf dieselbe Datenbank zeigen wie DATABASE_URL: die Tests löschen das Schema");
  }
  const pool = createPool(url);
  await reset(pool);
  const storage = createStorage(await mkdtemp(path.join(tmpdir(), "finops-test-")));
  return { pool, storage, policy: loadPolicy({}), company: loadCompany({}) };
}

export const USERS = {
  clerk: "00000000-0000-0000-0000-000000000001",
  manager: "00000000-0000-0000-0000-000000000002",
  manager2: "00000000-0000-0000-0000-000000000003",
  finance: "00000000-0000-0000-0000-000000000004",
  cfo: "00000000-0000-0000-0000-000000000005",
  finance2: "00000000-0000-0000-0000-000000000007",
};

// Note: every test file that calls testDeps() drops and rebuilds the schema in
// TEST_DATABASE_URL. The test script therefore runs files with
// --test-concurrency=1; without it two files reset the database under each other.

/** Demo accounts by role shorthand. */
export const EMAILS = {
  clerk: "anna.berger@nordwerk.example",
  manager: "tim.kessler@nordwerk.example",
  manager2: "lea.sommer@nordwerk.example",
  finance: "jonas.weber@nordwerk.example",
  finance2: "mira.hoffmann@nordwerk.example",
  cfo: "sabine.vogt@nordwerk.example",
  admin: "admin@nordwerk.example",
};

/**
 * An authenticated HTTP client for one demo user: logs in, keeps the session
 * cookie and echoes the CSRF token, exactly as a browser would.
 */
export async function loginAs(base, key, password = DEMO_PASSWORD) {
  const email = EMAILS[key] ?? key;
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login für ${email} fehlgeschlagen: ${res.status}`);
  const cookies = (res.headers.getSetCookie() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  const csrf = /finops_csrf=([^;]+)/.exec(cookies)?.[1];
  const user = (await res.json()).user;

  const headers = (extra = {}) => ({ Cookie: cookies, "X-CSRF-Token": csrf, ...extra });
  return {
    user,
    cookies,
    csrf,
    get: (path) => fetch(`${base}${path}`, { headers: headers() }),
    post: (path, body) =>
      fetch(`${base}${path}`, {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify(body ?? {}),
      }),
    upload: (xml, filename) => {
      const form = new FormData();
      form.append("file", new Blob([xml], { type: "application/xml" }), filename);
      return fetch(`${base}/api/invoices`, { method: "POST", body: form, headers: headers() });
    },
  };
}
