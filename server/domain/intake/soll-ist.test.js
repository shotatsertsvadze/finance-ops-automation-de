import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { testDeps } from "../../test-support/db.js";
import { runSollIst } from "../../test-support/soll-ist.js";

let deps;
before(async () => {
  deps = await testDeps();
});
after(() => deps.pool.end());

test("Soll/Ist: each of the 20 invoices ends in the expected state, with the expected reason or approvers", async () => {
  const rows = await runSollIst(deps);
  assert.equal(rows.length, 20);
  for (const r of rows) assert.deepEqual(r.ist, r.soll, `Nr. ${r.no}: ${r.case}`);

  const goesThrough = (o) => o.state !== "REVIEW_REQUIRED";
  assert.equal(rows.filter((r) => goesThrough(r.ist)).length, 16);
  // Nothing that should stop went through, and nothing that should go through stopped.
  assert.deepEqual(
    rows.filter((r) => goesThrough(r.ist) !== goesThrough(r.soll)),
    [],
  );
  assert.deepEqual(
    rows.filter((r) => r.soll.reason === "SUPPLIER_IBAN_MATCH").map((r) => r.ist.state),
    ["REVIEW_REQUIRED", "REVIEW_REQUIRED"],
  );
});
