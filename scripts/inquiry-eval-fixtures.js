import { writeFileSync } from "node:fs";
import { testDeps } from "../server/test-support/db.js";
import { INQUIRY_SCENARIOS, inquiryScenarioCase } from "../server/test-support/inquiry-scenarios.js";

/**
 * Writes fixtures/ai/inquiry/*.json from the real pipeline (ADR-084), in
 * TEST_DATABASE_URL, which it rebuilds. Run after a change to the scenarios,
 * the checks or the inquiry input; a test fails until the files match.
 */
const deps = await testDeps();
for (const name of Object.keys(INQUIRY_SCENARIOS)) {
  const found = await inquiryScenarioCase(deps, name);
  writeFileSync(new URL(`../fixtures/ai/inquiry/${name}.json`, import.meta.url), `${JSON.stringify(found, null, 2)}\n`);
  console.log(name, found.eligible ? found.input.failed.map((c) => c.check).join(", ") : found.code);
}
await deps.pool.end();
