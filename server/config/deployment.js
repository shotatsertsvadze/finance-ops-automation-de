import { existsSync } from "node:fs";
import path from "node:path";
import { PUBLISHED_DEMO_PASSWORD, verifyPassword } from "../auth/passwords.js";

/** The accounts anyone who has read the README can sign in to. */
async function demoPasswordAccounts(pool) {
  const { rows } = await pool.query("select email, password_hash, password_salt from finops.users order by email");
  return rows.filter((u) => verifyPassword(PUBLISHED_DEMO_PASSWORD, u.password_hash, u.password_salt)).map((u) => u.email);
}

const EVIDENCE_TABLES = [
  "audit_events", "bank_change_events", "bank_change_verifications", "bank_change_revalidations", "official_validations",
];

/** Every privilege that would let the app rewrite history, as [privilege, table]. */
const HISTORY_PRIVILEGES = [
  ...EVIDENCE_TABLES.flatMap((table) => ["UPDATE", "DELETE", "TRUNCATE"].map((privilege) => [privilege, table])),
  ["DELETE", "invoices"],
  ["UPDATE", "bank_account_changes"],
  ["DELETE", "bank_account_changes"],
  ["UPDATE", "supplier_bank_accounts"],
  ["DELETE", "supplier_bank_accounts"],
  // Not evidence, but the record of what left the system (ADR-080).
  ...["UPDATE", "DELETE", "TRUNCATE"].map((privilege) => [privilege, "ai_explanations"]),
];

/**
 * What the connected role could do to history; empty for a role set up by
 * grantAppRole (ADR-068, ADR-077). A table-level UPDATE on a change would
 * include its proposal columns; the column grant for its decision is expected.
 */
async function trailWriters(pool) {
  const found = [];
  for (const [privilege, table] of HISTORY_PRIVILEGES) {
    const { rows: [row] } = await pool.query("select has_table_privilege($1, $2) as allowed", [`finops.${table}`, privilege]);
    if (row.allowed) found.push(`${privilege.toLowerCase()} ${table}`);
  }
  return found;
}

/**
 * Why a production start must not go ahead; empty when it may (ADR-058).
 * Development is never refused. DEMO_MODE=true runs production on the demo
 * accounts on purpose, for a hosted demo.
 */
export async function deploymentProblems({ pool, env, clientDir }) {
  if (env.NODE_ENV !== "production") return [];
  const problems = [];
  if (!existsSync(path.join(clientDir, "index.html"))) {
    problems.push(`Kein gebauter Client in ${clientDir}: zuerst npm run build`);
  }
  // Without it every invoice would fail closed into review (ADR-078).
  if (!env.KOSIT_URL) {
    problems.push("Kein offizieller Validator konfiguriert: KOSIT_URL setzen (npm run kosit startet ihn lokal)");
  }
  const trail = await trailWriters(pool);
  if (trail.length) {
    problems.push(`Die Datenbankrolle kann den Prüfpfad ändern (${trail.join(", ")}); als eigene Rolle verbinden, eingerichtet mit npm run db:grant`);
  }
  if (env.DEMO_MODE !== "true") {
    const accounts = await demoPasswordAccounts(pool);
    if (accounts.length) {
      problems.push(`Diese Konten haben noch das veröffentlichte Demo-Passwort (npm run user:password): ${accounts.join(", ")}`);
    }
  }
  return problems;
}
