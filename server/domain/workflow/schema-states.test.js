/**
 * A partial index names its states in SQL, where states.js cannot reach. This
 * reads the index as Postgres holds it and compares it with the derived list,
 * so the two cannot drift apart when a state is added (ADR-051).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { testDeps } from "../../test-support/db.js";
import { PAYABLE_STATES } from "./states.js";

let deps;
before(async () => { deps = await testDeps(); });
after(async () => { await deps.pool.end(); });

async function indexStates(name) {
  const { rows: [row] } = await deps.pool.query(
    "select indexdef from pg_indexes where schemaname = 'finops' and indexname = $1", [name],
  );
  // The schema prefix is printed or not depending on the session's search_path.
  return [...row.indexdef.matchAll(/'([A-Z_]+)'::(?:finops\.)?invoice_state/g)].map((m) => m[1]).sort();
}

test("one payable record per supplier invoice number covers every payable state", async () => {
  assert.deepEqual(await indexStates("invoices_one_payable_per_number"), [...PAYABLE_STATES].sort());
});
