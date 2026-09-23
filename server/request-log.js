import { randomUUID } from "node:crypto";
import { log } from "./log.js";

// A proxy's id is kept so one request can be followed across both logs; one
// that could smuggle a line break or bloat every line is replaced.
const USABLE_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Names every request and logs one line when it finishes: method, path
 * without its query, status, duration and who asked. Never the body, which
 * can hold a password (ADR-060).
 */
export function requestLog(req, res, next) {
  const inbound = req.get("X-Request-Id");
  req.id = inbound && USABLE_ID.test(inbound) ? inbound : randomUUID();
  res.set("X-Request-Id", req.id);
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    log("info", "request", {
      request_id: req.id,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      status: res.statusCode,
      ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
      user_id: req.user?.id ?? null,
    });
  });
  next();
}
