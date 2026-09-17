import { Router } from "express";
import { verifyNobody, verifyPassword } from "../auth/passwords.js";
import { createSession, csrfCookieOptions, revokeSession, sessionCookieOptions, SESSION_COOKIE, CSRF_COOKIE } from "../auth/sessions.js";
import { permissionsFor } from "../auth/authorize.js";

const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5);
const LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES ?? 15);

// One answer for every failure. Saying "unknown address" would turn the login
// form into a way to enumerate who works here.
const REFUSED = { error: "E-Mail-Adresse oder Passwort ist falsch" };

export function authRouter({ pool }) {
  const router = Router();

  router.post("/login", async (req, res, next) => {
    try {
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "");
      if (!email || !password) return res.status(400).json({ error: "E-Mail und Passwort sind erforderlich" });

      const { rows: [user] } = await pool.query(
        "select id, name, email, role, password_hash, password_salt, failed_attempts, locked_until from finops.users where lower(email) = $1",
        [email],
      );

      if (user?.locked_until && new Date(user.locked_until) > new Date()) {
        return res.status(429).json({ error: "Konto ist vorübergehend gesperrt. Bitte später erneut versuchen." });
      }

      // A lock that has run out starts the count again, rather than leaving the
      // account one wrong attempt away from being locked for another quarter hour.
      if (user?.locked_until) {
        await pool.query("update finops.users set failed_attempts = 0, locked_until = null where id = $1", [user.id]);
        user.failed_attempts = 0;
      }

      // An unknown address spends the same work as a known one, so the answer
      // cannot be told apart by how long it took.
      const ok = user ? verifyPassword(password, user.password_hash, user.password_salt) : verifyNobody(password);
      if (!ok) {
        if (user) await registerFailure(pool, user);
        return res.status(401).json(REFUSED);
      }

      await pool.query("update finops.users set failed_attempts = 0, locked_until = null where id = $1", [user.id]);
      const { token, csrfToken, expiresAt } = await createSession(pool, user.id, req.get("user-agent"));
      res.cookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
      res.cookie(CSRF_COOKIE, csrfToken, csrfCookieOptions(expiresAt));
      res.json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        permissions: permissionsFor(user.role),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", async (req, res, next) => {
    try {
      await revokeSession(pool, req.sessionToken);
      res.clearCookie(SESSION_COOKIE, { path: "/" });
      res.clearCookie(CSRF_COOKIE, { path: "/" });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get("/me", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Nicht angemeldet" });
    res.json({ user: req.user, permissions: permissionsFor(req.user.role) });
  });

  return router;
}

/**
 * Counts one failed attempt. The increment and the lock decision happen in the
 * database, in one statement: computing `attempts + 1` in Node from a row read
 * earlier lets parallel attempts overwrite each other's counts, so eight
 * simultaneous guesses register as one and never reach the threshold.
 */
async function registerFailure(pool, user) {
  await pool.query(
    `update finops.users
       set failed_attempts = failed_attempts + 1,
           locked_until = case
             when failed_attempts + 1 >= $2 then now() + ($3 || ' minutes')::interval
             else locked_until
           end
     where id = $1`,
    [user.id, MAX_ATTEMPTS, String(LOCK_MINUTES)],
  );
}
