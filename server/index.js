import { createApp } from "./app.js";
import { createPool } from "./db.js";
import { createStorage } from "./storage/files.js";
import { loadPolicy } from "./config/policy.js";
import { loadCompany } from "./config/company.js";

// API_PORT, not PORT: the UI dev server and some hosts set PORT for
// themselves, and an ambient PORT overrides --env-file. Sharing the name made
// the API bind to the UI's port.
const port = Number(process.env.API_PORT ?? 4400);
const deps = {
  pool: createPool(),
  storage: createStorage(process.env.STORAGE_DIR ?? "./storage"),
  policy: loadPolicy(),
  company: loadCompany(),
};

// Loopback by default. Exposing a demo on every interface should be a
// deliberate act, not the default.
const host = process.env.API_HOST ?? "127.0.0.1";

createApp(deps).listen(port, host, () => console.log(`finops api listening on http://${host}:${port}`));
