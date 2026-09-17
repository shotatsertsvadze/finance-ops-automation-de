import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "../server/db.js";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

/** Applies every db/migrations/*.sql not yet recorded in finops.schema_migrations. */
export async function migrate(pool) {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const client = await pool.connect();
  try {
    await client.query("create schema if not exists finops");
    await client.query(
      "create table if not exists finops.schema_migrations (filename text primary key, applied_at timestamptz not null default now())",
    );
    const { rows } = await client.query("select filename from finops.schema_migrations");
    const applied = new Set(rows.map((r) => r.filename));
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into finops.schema_migrations (filename) values ($1)", [file]);
        await client.query("commit");
        console.log(`applied ${file}`);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    client.release();
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
