import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { envNumber } from "./config/env.js";
import { createApp } from "./app.js";
import { createPool } from "./db.js";
import { createStorage } from "./storage/files.js";
import { loadPolicy } from "./config/policy.js";
import { loadCompany } from "./config/company.js";
import { deploymentProblems } from "./config/deployment.js";
import { officialValidatorFromEnv } from "./integrations/kosit.js";
import { aiExplanationsFromEnv } from "./integrations/ai-explainer.js";
import { log } from "./log.js";

// API_PORT, not PORT: the UI dev server and some hosts set PORT for
// themselves, and an ambient PORT overrides --env-file. Sharing the name made
// the API bind to the UI's port.
const port = envNumber("API_PORT", 4400, { max: 65535 });
const deps = {
  pool: createPool(),
  storage: createStorage(process.env.STORAGE_DIR ?? "./storage"),
  policy: loadPolicy(),
  company: loadCompany(),
  officialValidator: officialValidatorFromEnv(),
  ai: aiExplanationsFromEnv(),
};

// Loopback by default. Exposing a demo on every interface should be a
// deliberate act, not the default.
const host = process.env.API_HOST ?? "127.0.0.1";

// The API serves the built client whenever there is one (production requires
// it); during development Vite serves the source instead (ADR-076).
const clientDir = fileURLToPath(new URL("../dist", import.meta.url));
const hasClient = existsSync(path.join(clientDir, "index.html"));
const production = process.env.NODE_ENV === "production";

const problems = await deploymentProblems({ pool: deps.pool, env: process.env, clientDir });
if (problems.length) {
  for (const problem of problems) log("error", `Start abgelehnt: ${problem}`);
  await deps.pool.end();
  process.exitCode = 1;
} else {
  const server = createApp(deps, { clientDir: hasClient ? clientDir : undefined })
    .listen(port, host, () => log("info", `finops api listening on http://${host}:${port}`, { production }));
  server.requestTimeout = 30_000;
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => shutDown(server, signal));
}

/**
 * Stops taking requests, lets the ones in flight finish, then closes the
 * pool, so a deploy or a Ctrl-C never cuts a transaction off halfway
 * (ADR-075). Gives up after ten seconds rather than hang the deploy.
 */
function shutDown(server, signal) {
  log("info", "shutting down", { signal });
  setTimeout(() => {
    log("error", "shutdown timed out, exiting");
    process.exit(1);
  }, 10_000).unref();
  server.close(async () => {
    await deps.pool.end();
    log("info", "stopped");
  });
  server.closeIdleConnections();
}
