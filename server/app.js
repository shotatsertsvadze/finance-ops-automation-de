import express from "express";
import cors from "cors";
import { invoicesRouter } from "./routes/invoices.js";
import { masterDataRouter, usersRouter } from "./routes/master-data.js";
import { accountingRouter, bankRouter, dashboardRouter, reconciliationRouter } from "./routes/money.js";
import { authRouter } from "./routes/auth.js";
import { requireSession, sessionMiddleware } from "./routes/session.js";
import { STATE_LABELS, TRANSITIONS } from "./domain/workflow/states.js";

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

/** Express app without listen(), so tests can mount it on any port. */
export function createApp(deps) {
  const app = express();
  app.disable("x-powered-by");
  // Content types on this API are declared, never guessed. Without this a
  // browser may sniff bytes back into a renderable type and run them.
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (req, res) => res.json({ ok: true }));

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

  app.use((error, req, res, next) => {
    if (error.status) return res.status(error.status).json({ error: error.message, code: error.code ?? null, details: error.details ?? null });
    if (error.name === "MulterError") return res.status(400).json({ error: error.message, code: "UPLOAD_REJECTED" });
    console.error(error);
    res.status(500).json({ error: "Interner Fehler", code: "INTERNAL_ERROR" });
  });
  return app;
}
