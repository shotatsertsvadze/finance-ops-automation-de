/**
 * The migration runner (ADR-061). It recorded only file names, so a migration
 * edited after it was applied was silently skipped, and two runs at once
 * raced each other through the same files.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createPool } from "./db.js";
import { testDeps } from "./test-support/db.js";
import { migrate } from "../scripts/migrate.js";
import { reset } from "../scripts/reset.js";

let deps;
before(async () => {
  deps = await testDeps();
});
after(async () => {
  await reset(deps.pool);
  await deps.pool.end();
});

test("every applied migration is recorded with the checksum of its file", async () => {
  const { rows } = await deps.pool.query("select filename, checksum from finops.schema_migrations order by filename");
  assert.ok(rows.length > 10);
  for (const row of rows) assert.match(row.checksum, /^[0-9a-f]{64}$/, row.filename);
});

test("a migration edited after it was applied stops the run", async () => {
  await deps.pool.query("update finops.schema_migrations set checksum = repeat('0', 64) where filename = '0003_accounting_payment.sql'");
  await assert.rejects(() => migrate(deps.pool), /0003.*geändert/);
  await reset(deps.pool);
});

test("a migration recorded before checksums existed gets one, once", async () => {
  await deps.pool.query("update finops.schema_migrations set checksum = null");
  await migrate(deps.pool);
  const { rows } = await deps.pool.query("select count(*)::int as n from finops.schema_migrations where checksum is null");
  assert.equal(rows[0].n, 0);
});

test("two runs at once apply each migration exactly once", async () => {
  await deps.pool.query("drop schema finops cascade");
  const second = createPool(process.env.TEST_DATABASE_URL);
  try {
    await Promise.all([migrate(deps.pool), migrate(second)]);
  } finally {
    await second.end();
  }
  const { rows } = await deps.pool.query("select count(*)::int as n, count(distinct filename)::int as files from finops.schema_migrations");
  assert.equal(rows[0].n, rows[0].files);
});
