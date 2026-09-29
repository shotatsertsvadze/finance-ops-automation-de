import path from "node:path";
import express from "express";
import cors from "cors";
import { invoicesRouter } from "./routes/invoices.js";
import { masterDataRouter, usersRouter } from "./routes/master-data.js";
import { accountingRouter, bankRouter, dashboardRouter, reconciliationRouter } from "./routes/money.js";
import { authRouter } from "./routes/auth.js";
import { requireSession, sessionMiddleware } from "./routes/session.js";
import { healthRouter } from "./routes/health.js";
import { STATE_LABELS, TRANSITIONS } from "./domain/workflow/states.js";
import { requestLog } from "./request-log.js";
import { log } from "./log.js";

/**
 * Same-origin only. The UI is served by Vite in development, which proxies
 * /api, so the browser never makes a cross-origin call. A wildcard origin plus
 * credentials is the combination that turns a session cookie into everyone's
 * session cookie.
 */
function corsOptions() {
  const allowed = (process.env.CORS_ORIGINS ?? "")
    .split(",").map((o) => o.trim()).filter(Boolean);
  return {
    origin: allowed.length === 0 ? false : allowed,
    credentials: true,
    methods: ["GET", "POST"],
  };
}

// Scripts, styles and data from this origin only; fonts from Google Fonts,
// which the page links. No plugins, no framing: an approval screen inside
// someone else's page is a clickjacking target (ADR-074).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function securityHeaders(req, res, next) {
  res.set({
    // Content types are declared, never guessed: a sniffed type can run.
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": CSP,
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  // Production runs behind HTTPS (ADR-058); telling a browser so over plain
  // local HTTP would only confuse it.
  if (process.env.NODE_ENV === "production") res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}

const MAX_COMMENT = 1000;

/**
 * Every decision's reason arrives as `comment` and ends up in the audit trail,
 * so it is checked once here: text, and short enough to read (ADR-073).
 */
function commentGuard(req, res, next) {
  const comment = req.body?.comment;
  if (comment === undefined || comment === null) return next();
  if (typeof comment !== "string" || comment.length > MAX_COMMENT) {
    return res.status(400).json({ error: `Begründung muss Text mit höchstens ${MAX_COMMENT} Zeichen sein`, code: "COMMENT_INVALID", details: { max: MAX_COMMENT } });
  }
  next();
}

/**
 * The built client, when there is one. Any GET outside /api gets index.html,
 * so a route the browser reloads (`/rechnung/:id`) reaches the client router.
 */
function serveClient(app, clientDir) {
  const index = path.resolve(clientDir, "index.html");
  app.use(express.static(clientDir, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(index);
  });
}

/**
 * Express app without listen(), so tests can mount it on any port.
 * `clientDir` is the built client (`dist/`); in development Vite serves it.
 */
export function createApp(deps, { clientDir } = {}) {
  const app = express();
  app.disable("x-powered-by");
  // req.ip is the client, not the reverse proxy in front: X-Forwarded-For is
  // believed only from a proxy on this host, so a client connecting directly
  // cannot choose its own address to dodge the login throttle (ADR-059).
  app.set("trust proxy", "loopback");
  app.use(requestLog);
  app.use(securityHeaders);
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: "1mb" }));
  app.use(commentGuard);

  app.use("/api/health", healthRouter(deps));

  app.use("/api", sessionMiddleware(deps.pool));
  app.use("/api/auth", authRouter(deps));

  // Everything past this point requires a signed-in user.
  app.use("/api", requireSession);
  app.get("/api/meta/states", (req, res) => res.json({ labels: STATE_LABELS, transitions: TRANSITIONS, policy: deps.policy }));
  app.use("/api/invoices", invoicesRouter(deps));
  app.use("/api/master-data", masterDataRouter(deps));
  app.use("/api/users", usersRouter(deps));
  app.use("/api/accounting", accountingRouter(deps));
  app.use("/api/bank", bankRouter(deps));
  app.use("/api/reconciliation", reconciliationRouter(deps));
  app.use("/api/dashboard", dashboardRouter(deps));
  if (clientDir) serveClient(app, clientDir);

  app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed") return res.status(400).json({ error: "Anfrage ist kein gültiges JSON", code: "INVALID_JSON", details: null });
    if (error.type === "entity.too.large") return res.status(413).json({ error: "Anfrage ist zu groß", code: "BODY_TOO_LARGE", details: null });
    if (error.status) return res.status(error.status).json({ error: error.message, code: error.code ?? null, details: error.details ?? null });
    if (error.name === "MulterError") return res.status(400).json({ error: error.message, code: "UPLOAD_REJECTED" });
    // The cause stays in the log; the caller gets the id to quote.
    log("error", "internal error", { request_id: req.id, error: error.message, stack: error.stack });
    res.status(500).json({ error: `Interner Fehler (Referenz ${req.id})`, code: "INTERNAL_ERROR", details: { request_id: req.id } });
  });
  return app;
}
