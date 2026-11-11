import { withTransaction } from "../db.js";
import { hashPassword } from "./passwords.js";

const MIN_LENGTH = 12;

/**
 * Sets an account's password and ends every session opened with the old one,
 * so a leaked password stops working the moment it is replaced (ADR-058).
 */
export async function setPassword(pool, email, password) {
  if ((password ?? "").length < MIN_LENGTH) throw new Error(`Das Passwort muss mindestens ${MIN_LENGTH} Zeichen lang sein`);
  const { hash, salt } = hashPassword(password);
  await withTransaction(pool, async (client) => {
    const {
      rows: [user],
    } = await client.query("update finops.users set password_hash = $2, password_salt = $3 where lower(email) = lower($1) returning id", [
      email,
      hash,
      salt,
    ]);
    if (!user) throw new Error(`Kein Konto mit der E-Mail-Adresse ${email}`);
    await client.query("update finops.sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [user.id]);
  });
}
