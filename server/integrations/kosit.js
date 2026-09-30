import { envNumber } from "../config/env.js";

/**
 * Transport to a running KoSIT validator daemon (ADR-078). It posts the
 * original bytes and reports what came back; it knows nothing about invoices,
 * routing or what a report means. The daemon has no authentication, so it is
 * reached on localhost or an internal network only.
 */
const OUTCOME_BY_STATUS = { 200: "ACCEPTED", 406: "REJECTED", 422: "UNPROCESSABLE" };

export function createKositClient({ url, timeoutMs }) {
  return {
    url,
    timeoutMs,
    async validate(buffer, name) {
      const started = Date.now();
      const took = () => Date.now() - started;
      try {
        // One signal bounds the whole exchange, body included: a daemon that
        // answers the status line and then stalls is as unavailable as one
        // that never answers.
        const response = await fetch(new URL(`/${name}.xml`, url), {
          method: "POST",
          headers: { "Content-Type": "application/xml" },
          body: buffer,
          signal: AbortSignal.timeout(timeoutMs),
        });
        const report = await response.text();
        return { outcome: OUTCOME_BY_STATUS[response.status] ?? "ERROR", httpStatus: response.status, report, durationMs: took() };
      } catch (error) {
        const outcome = error.name === "TimeoutError" ? "TIMEOUT" : "UNAVAILABLE";
        return { outcome, httpStatus: null, report: null, durationMs: took(), error: error.cause?.message ?? error.message };
      }
    },
    /** The daemon's own health endpoint says it is up. */
    async available() {
      try {
        const response = await fetch(new URL("/server/health", url), { signal: AbortSignal.timeout(timeoutMs) });
        return response.ok && (await response.text()).includes("UP");
      } catch {
        return false;
      }
    },
  };
}

/**
 * The validator the app is started with. Outside production an absent
 * KOSIT_URL is allowed and the check says it was skipped; in production the
 * start is refused (deployment.js) and the check fails closed regardless.
 * The call runs inside the invoice's transaction, so its timeout stays well
 * below the database's 30 s idle-in-transaction limit (ADR-075).
 */
export function officialValidatorFromEnv(env = process.env) {
  const required = env.NODE_ENV === "production";
  if (!env.KOSIT_URL) return { client: null, required };
  const timeoutMs = envNumber("KOSIT_TIMEOUT_MS", 10_000, { min: 100, max: 20_000 }, env);
  return { client: createKositClient({ url: env.KOSIT_URL, timeoutMs }), required };
}
