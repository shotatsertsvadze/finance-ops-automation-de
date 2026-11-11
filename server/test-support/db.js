import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPool } from "../db.js";
import { createStorage } from "../storage/files.js";
import { loadPolicy } from "../config/policy.js";
import { loadCompany } from "../config/company.js";
import { aiExplanationsFromEnv } from "../integrations/ai-explainer.js";
import { reset } from "../../scripts/reset.js";
// Imported as well as re-exported: a bare `export ... from` does not bind it locally.
import { DEMO_PASSWORD, seed } from "../../scripts/seed.js";
export { DEMO_PASSWORD };

/**
 * Fresh schema in TEST_DATABASE_URL (dropped and rebuilt), temp storage dir,
 * default policy. Returns deps for the domain functions and createApp().
 */
export async function testDeps() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const pool = createPool(url);
  // reset() drops the schema, so this asks both connections which database
  // they actually reached rather than comparing the two URL strings. Two
  // spellings of one database ("localhost" and "127.0.0.1", a trailing
  // parameter, the default port written out) compare as different text and
  // name the same rows.
  await refuseSharedDatabase(pool);
  await reset(pool);
  const storage = createStorage(await mkdtemp(path.join(tmpdir(), "finops-test-")));
  // No validator unless a test brings one (test-support/kosit.js); the real
  // one is exercised by kosit-real.test.js, never by accident through .env.
  // AI is off in the same way; test-support/ai.js has the stand-in.
  return {
    pool,
    storage,
    policy: loadPolicy({}),
    company: loadCompany({}),
    officialValidator: { client: null, required: false },
    ai: aiExplanationsFromEnv({}),
  };
}

/**
 * Removes every bank-account change and the accounts they added, then puts
 * the seeded accounts back. An approved change and its account point at each
 * other, so a plain delete in either order is refused.
 */
export async function resetBankChanges(pool) {
  await pool.query(
    `truncate finops.bank_change_revalidations, finops.bank_change_events, finops.bank_change_verifications,
       finops.bank_account_changes, finops.supplier_bank_accounts cascade`,
  );
  await seed(pool);
}

/** The server and database a connection actually reached. */
async function identity(pool) {
  const {
    rows: [row],
  } = await pool.query("select current_database() as db, current_setting('data_directory', true) as dir");
  return `${row.dir ?? "?"}::${row.db}`;
}

async function refuseSharedDatabase(testPool) {
  if (!process.env.DATABASE_URL) return;
  const devPool = createPool(process.env.DATABASE_URL);
  try {
    const [test, dev] = await Promise.all([identity(testPool), identity(devPool)]);
    if (test === dev) {
      throw new Error(`TEST_DATABASE_URL und DATABASE_URL zeigen auf dieselbe Datenbank (${test}): die Tests löschen das Schema`);
    }
  } finally {
    await devPool.end();
  }
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
const EMAILS = {
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
  const cookies = (res.headers.getSetCookie() ?? []).map((c) => c.split(";")[0]).join("; ");
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
