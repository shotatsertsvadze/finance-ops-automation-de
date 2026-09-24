import { createPool } from "../server/db.js";
import { grantAppRole } from "../server/db-grants.js";

// Run with the owner's DATABASE_URL, after every migration (ADR-068).
const role = process.argv[2];
if (!role) {
  console.error("Aufruf: npm run db:grant -- <rolle>");
  process.exit(2);
}
const pool = createPool();
try {
  await grantAppRole(pool, role);
  console.log(`Rechte für ${role} gesetzt; der Prüfpfad ist für sie nur lesbar und erweiterbar`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
