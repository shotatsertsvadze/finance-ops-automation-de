import { fileURLToPath } from "node:url";
import { createPool } from "../server/db.js";
import { migrate } from "./migrate.js";
import { seed } from "./seed.js";

/** Drops schema finops and rebuilds it. Demo/test use only. */
export async function reset(pool) {
  await pool.query("drop schema if exists finops cascade");
  await migrate(pool);
  await seed(pool);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool();
  reset(pool)
    .then(() => {
      console.log("schema finops reset and seeded");
      return pool.end();
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
