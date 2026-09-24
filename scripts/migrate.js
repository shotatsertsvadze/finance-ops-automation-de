import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "../server/db.js";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

// Any fixed number: every run takes the same session lock, so a second run
// waits for the first instead of racing it through the same files.
const MIGRATION_LOCK = 4_400_2026;

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/**
 * Applies every db/migrations/*.sql not yet recorded in finops.schema_migrations,
 * one transaction each, under an advisory lock (ADR-061). An applied migration
 * whose file has changed stops the run: migrations are append-only, and an
 * edit to one already applied would never reach the databases that have it.
 */
export async function migrate(pool) {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await client.query("create schema if not exists finops");
    await client.query(
      "create table if not exists finops.schema_migrations (filename text primary key, applied_at timestamptz not null default now())",
    );
    await client.query("alter table finops.schema_migrations add column if not exists checksum text");
    const { rows } = await client.query("select filename, checksum from finops.schema_migrations");
    const applied = new Map(rows.map((r) => [r.filename, r.checksum]));

    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      const checksum = sha256(sql);
      if (applied.has(file)) {
        await checkUnchanged(client, file, applied.get(file), checksum);
        continue;
      }
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into finops.schema_migrations (filename, checksum) values ($1, $2)", [file, checksum]);
        await client.query("commit");
        console.log(`applied ${file}`);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => {});
    client.release();
  }
}

/** A row from before checksums existed is trusted once and recorded. */
async function checkUnchanged(client, file, recorded, checksum) {
  if (recorded === null) {
    await client.query("update finops.schema_migrations set checksum = $2 where filename = $1", [file, checksum]);
    return;
  }
  if (recorded !== checksum) {
    throw new Error(`Migration ${file} wurde nach dem Anwenden geändert; neue Änderungen gehören in eine neue Migration`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool();
  migrate(pool)
    .then(() => pool.end())
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
