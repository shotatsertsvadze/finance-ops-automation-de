import { fileURLToPath } from "node:url";
import { envNumber } from "./config/env.js";
import { createApp } from "./app.js";
import { createPool } from "./db.js";
import { createStorage } from "./storage/files.js";
import { loadPolicy } from "./config/policy.js";
import { loadCompany } from "./config/company.js";
import { deploymentProblems } from "./config/deployment.js";
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
};

// Loopback by default. Exposing a demo on every interface should be a
// deliberate act, not the default.
const host = process.env.API_HOST ?? "127.0.0.1";

// In production the API serves the built client; in development Vite does.
const clientDir = fileURLToPath(new URL("../dist", import.meta.url));
const production = process.env.NODE_ENV === "production";

const problems = await deploymentProblems({ pool: deps.pool, env: process.env, clientDir });
if (problems.length) {
  for (const problem of problems) log("error", `Start abgelehnt: ${problem}`);
  await deps.pool.end();
  process.exitCode = 1;
} else {
  createApp(deps, { clientDir: production ? clientDir : undefined })
    .listen(port, host, () => log("info", `finops api listening on http://${host}:${port}`, { production }));
}
