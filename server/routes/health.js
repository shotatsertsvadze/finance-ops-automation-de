import { Router } from "express";
import { log } from "../log.js";

const DATABASE_TIMEOUT_MS = 2000;

/**
 * Liveness says the process answers; readiness says it can do its work, which
 * needs the database. A load balancer routes on readiness; restarting the
 * process on a database outage would not help, so liveness does not ask.
 */
export function healthRouter({ pool }) {
  const router = Router();

  router.get("/", (req, res) => res.json({ ok: true }));

  router.get("/ready", async (req, res) => {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`keine Antwort nach ${DATABASE_TIMEOUT_MS} ms`)), DATABASE_TIMEOUT_MS);
    });
    try {
      await Promise.race([pool.query("select 1"), timeout]);
      res.json({ ok: true, database: "ok" });
    } catch (error) {
      log("warn", "database not ready", { request_id: req.id, error: error.message });
      res.status(503).json({ ok: false, database: "unreachable" });
    } finally {
      clearTimeout(timer);
    }
  });

  return router;
}
