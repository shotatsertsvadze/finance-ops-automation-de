import { Router } from "express";
import { verifyPassword } from "../auth/passwords.js";
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

      const ok = user && verifyPassword(password, user.password_hash, user.password_salt);
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

async function registerFailure(pool, user) {
  const attempts = user.failed_attempts + 1;
  const lock = attempts >= MAX_ATTEMPTS ? `now() + interval '${LOCK_MINUTES} minutes'` : "null";
  await pool.query(`update finops.users set failed_attempts = $2, locked_until = ${lock} where id = $1`, [user.id, attempts]);
}
