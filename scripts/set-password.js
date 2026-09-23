import { text } from "node:stream/consumers";
import { createPool } from "../server/db.js";
import { setPassword } from "../server/auth/set-password.js";

// The password comes on stdin, never as an argument, so it stays out of the
// shell history and the process list.
const email = process.argv[2];
if (!email || process.stdin.isTTY) {
  console.error("Aufruf: printf '%s' \"$PASSWORT\" | npm run user:password -- <email>");
  process.exit(2);
}
const password = (await text(process.stdin)).replace(/\r?\n$/, "");

const pool = createPool();
try {
  await setPassword(pool, email, password);
  console.log(`Passwort für ${email} gesetzt; offene Sitzungen beendet`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
