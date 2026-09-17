import {
  CSRF_HEADER, SESSION_COOKIE, csrfMatches, parseCookies, resolveSession,
} from "../auth/sessions.js";
import { human } from "../domain/workflow/transitions.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Resolves the signed-in user from the session cookie and enforces CSRF on
 * every state-changing request.
 *
 * The identity comes from the cookie only. Nothing a caller states about who
 * they are is trusted, which is the whole point of replacing X-Actor-Id.
 */
export function sessionMiddleware(pool) {
  return async (req, res, next) => {
    try {
      const cookies = parseCookies(req.get("cookie"));
      const token = cookies[SESSION_COOKIE];
      req.sessionToken = token;

      const session = await resolveSession(pool, token);
      if (session) {
        req.user = session.user;
        req.actor = human(session.user.id);
      }

      if (!SAFE_METHODS.has(req.method) && session) {
        // Double submit: the token lives in a readable cookie and must be
        // echoed in a header. A cross-site form can send the cookie but
        // cannot set the header.
        if (!csrfMatches(session.csrfToken, req.get(CSRF_HEADER))) {
          return res.status(403).json({ error: "CSRF-Token fehlt oder passt nicht" });
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Everything under /api needs a session, except logging in. */
export function requireSession(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Nicht angemeldet" });
  next();
}
