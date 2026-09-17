import express from "express";
import cors from "cors";
import { invoicesRouter } from "./routes/invoices.js";
import { masterDataRouter, usersRouter } from "./routes/master-data.js";
import { actorMiddleware } from "./routes/actor.js";
import { STATE_LABELS, TRANSITIONS } from "./domain/workflow/states.js";

/** Express app without listen(), so tests can mount it on any port. */
export function createApp(deps) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api", actorMiddleware(deps.pool));
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.get("/api/meta/states", (req, res) => res.json({ labels: STATE_LABELS, transitions: TRANSITIONS, policy: deps.policy }));
  app.use("/api/invoices", invoicesRouter(deps));
  app.use("/api/master-data", masterDataRouter(deps));
  app.use("/api/users", usersRouter(deps));
  app.use((error, req, res, next) => {
    if (error.status) return res.status(error.status).json({ error: error.message, details: error.details ?? null });
    if (error.name === "MulterError" || /XML-Dateien/.test(error.message)) return res.status(400).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: "Interner Fehler" });
  });
  return app;
}
