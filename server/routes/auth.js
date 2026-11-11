import { Router } from "express";
import { verifyNobody, verifyPassword } from "../auth/passwords.js";
import { createSession, csrfCookieOptions, revokeSession, sessionCookieOptions, SESSION_COOKIE, CSRF_COOKIE } from "../auth/sessions.js";
import { permissionsFor } from "../auth/authorize.js";
import { LOGIN_LIMITS, admitAttempt, forgiveAttempts } from "../auth/throttle.js";

// One answer for every failure. Saying "unknown address" would turn the login
// form into a way to enumerate who works here.
const REFUSED = { error: "E-Mail-Adresse oder Passwort ist falsch", code: "SIGN_IN_REFUSED" };

export function authRouter({ pool }) {
  const router = Router();

  router.post("/login", async (req, res, next) => {
    try {
      const email = String(req.body?.email ?? "")
        .trim()
        .toLowerCase();
      const password = String(req.body?.password ?? "");
      if (!email || !password)
        return res.status(400).json({ error: "E-Mail und Passwort sind erforderlich", code: "CREDENTIALS_REQUIRED" });

      // Checked before the account is even looked up, so a throttled answer is
      // the same for an address that exists and one that does not.
      if (!(await admitAttempt(pool, req.ip, email))) {
        res.set("Retry-After", String(LOGIN_LIMITS.windowMinutes * 60));
        return res
          .status(429)
          .json({ error: "Zu viele Fehlversuche von dieser Adresse. Bitte später erneut versuchen.", code: "LOGIN_THROTTLED" });
      }

      const {
        rows: [user],
      } = await pool.query("select id, name, email, role, password_hash, password_salt from finops.users where lower(email) = $1", [email]);

      // An unknown address spends the same work as a known one, so the answer
      // cannot be told apart by how long it took.
      const ok = user ? verifyPassword(password, user.password_hash, user.password_salt) : verifyNobody(password);
      if (!ok) return res.status(401).json(REFUSED);

      await forgiveAttempts(pool, req.ip, email);
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
    if (!req.user) return res.status(401).json({ error: "Nicht angemeldet", code: "NOT_SIGNED_IN" });
    res.json({ user: req.user, permissions: permissionsFor(req.user.role) });
  });

  return router;
}
