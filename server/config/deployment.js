import { existsSync } from "node:fs";
import path from "node:path";
import { PUBLISHED_DEMO_PASSWORD, verifyPassword } from "../auth/passwords.js";

/** The accounts anyone who has read the README can sign in to. */
async function demoPasswordAccounts(pool) {
  const { rows } = await pool.query("select email, password_hash, password_salt from finops.users order by email");
  return rows.filter((u) => verifyPassword(PUBLISHED_DEMO_PASSWORD, u.password_hash, u.password_salt)).map((u) => u.email);
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
  if (env.DEMO_MODE !== "true") {
    const accounts = await demoPasswordAccounts(pool);
    if (accounts.length) {
      problems.push(`Diese Konten haben noch das veröffentlichte Demo-Passwort (npm run user:password): ${accounts.join(", ")}`);
    }
  }
  return problems;
}
