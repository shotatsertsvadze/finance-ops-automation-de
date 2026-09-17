import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "../server/db.js";

const SEED_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "seed", "master_data.sql");

export async function seed(pool) {
  await pool.query(await readFile(SEED_FILE, "utf8"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool();
  seed(pool)
    .then(() => {
      console.log("seeded master data");
      return pool.end();
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
