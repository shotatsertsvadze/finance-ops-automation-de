import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "finops_session";
export const CSRF_COOKIE = "finops_csrf";
export const CSRF_HEADER = "x-csrf-token";

const SESSION_HOURS = Number(process.env.SESSION_HOURS ?? 12);

/** Only the hash is stored, so a dump of the table yields no usable session. */
const hashToken = (token) => createHash("sha256").update(token).digest("hex");

export async function createSession(pool, userId, userAgent) {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  await pool.query(
    `insert into finops.sessions (user_id, token_hash, csrf_token, expires_at, user_agent)
     values ($1, $2, $3, $4, $5)`,
    [userId, hashToken(token), csrfToken, expiresAt, (userAgent ?? "").slice(0, 200)],
  );
  return { token, csrfToken, expiresAt };
}

/** The signed-in user, or null. Also refreshes last_seen_at. */
export async function resolveSession(pool, token) {
  if (!token) return null;
  const { rows: [row] } = await pool.query(
    `select s.id, s.csrf_token, s.expires_at, u.id as user_id, u.name, u.email, u.role
     from finops.sessions s join finops.users u on u.id = s.user_id
     where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()`,
    [hashToken(token)],
  );
  if (!row) return null;
  await pool.query("update finops.sessions set last_seen_at = now() where id = $1", [row.id]);
  return {
    sessionId: row.id,
    csrfToken: row.csrf_token,
    user: { id: row.user_id, name: row.name, email: row.email, role: row.role },
  };
}

export async function revokeSession(pool, token) {
  if (!token) return;
  await pool.query("update finops.sessions set revoked_at = now() where token_hash = $1 and revoked_at is null", [hashToken(token)]);
}

export function csrfMatches(expected, given) {
  if (!expected || !given) return false;
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(given));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Parses the Cookie header. Express does not do this without a dependency. */
export function parseCookies(header) {
  const out = {};
  for (const part of (header ?? "").split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function sessionCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

/** Readable by the client on purpose: it is echoed back in a header. */
export function csrfCookieOptions(expiresAt) {
  return { httpOnly: false, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt };
}
