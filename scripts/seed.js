import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "../server/db.js";
import { PUBLISHED_DEMO_PASSWORD, hashPassword } from "../server/auth/passwords.js";

const SEED_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "seed");
const SEED_FILES = ["master_data.sql", "callback_numbers.sql"].map((file) => path.join(SEED_DIR, file));

/**
 * Demo accounts all share one password, documented in the README. These are
 * synthetic accounts in a local demo; the value is a placeholder, not a secret,
 * and it is set here rather than in SQL because the hash needs scrypt.
 */
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? PUBLISHED_DEMO_PASSWORD;

export async function seed(pool) {
  for (const file of SEED_FILES) await pool.query(await readFile(file, "utf8"));
  const { rows } = await pool.query("select id from finops.users where password_hash is null");
  for (const user of rows) {
    const { hash, salt } = hashPassword(DEMO_PASSWORD);
    await pool.query("update finops.users set password_hash = $2, password_salt = $3 where id = $1", [user.id, hash, salt]);
  }
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
