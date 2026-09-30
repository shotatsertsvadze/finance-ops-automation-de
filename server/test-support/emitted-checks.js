import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// Every module that emits checks. A check kept in its own module is still a
// check, and a scan that misses it passes for the wrong reason.
const CHECK_SOURCES = [
  "../domain/validation/business-checks.js",
  "../domain/validation/tax-breakdown.js",
  "../domain/invoice/technical-validation.js",
  "../domain/invoice/official-validation.js",
];

/**
 * Every `passed("code", …)` / `failed(…)` / … the checks can emit, as
 * "code:STATUS", read from the source. Includes the case where the code is
 * chosen into a variable first:
 *   const check = error.code === "NOT_WELL_FORMED" ? "xml_well_formed" : "format_recognised";
 *   checks.push(failed(check, …));
 * Missing that form would have wrongly reported a correct entry as stale.
 */
export function emittedChecks() {
  const pairs = new Set();
  for (const text of CHECK_SOURCES.map(source)) {
    for (const [, fn, code] of text.matchAll(/\b(passed|failed|warning|skipped|info)\("([a-z_]+)"/g)) {
      pairs.add(`${code}:${fn.toUpperCase()}`);
    }
    for (const [, fn, name] of text.matchAll(/\b(passed|failed|warning|skipped|info)\(([a-zA-Z_$][\w$]*),/g)) {
      const assignment = text.match(new RegExp(`\\b(?:const|let)\\s+${name}\\s*=([^;]*);`));
      if (!assignment) continue;
      for (const [, code] of assignment[1].matchAll(/"([a-z_]+)"/g)) pairs.add(`${code}:${fn.toUpperCase()}`);
    }
  }
  return [...pairs].sort();
}
