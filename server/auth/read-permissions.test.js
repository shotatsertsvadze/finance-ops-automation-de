/**
 * Who may read money data (ADR-064). Every signed-in role could read the
 * accounting export, the bank transactions and the supplier master data,
 * IBANs included; only writing was guarded.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { loginAs, testDeps } from "../test-support/db.js";

let deps, server, clients;
before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  clients = {};
  for (const key of ["clerk", "manager", "finance", "cfo", "admin"]) clients[key] = await loginAs(base, key);
});
after(async () => {
  server.close();
  await deps.pool.end();
});

const status = async (who, path) => (await clients[who].get(path)).status;

const READS = {
  "/api/accounting/export": ["finance", "admin"],
  "/api/bank/transactions": ["finance", "admin"],
  "/api/master-data/suppliers": ["clerk", "finance", "admin"],
  "/api/master-data/purchase-orders": ["clerk", "finance", "admin"],
};

for (const [path, allowed] of Object.entries(READS)) {
  test(`${path} is read only by ${allowed.join(", ")}`, async () => {
    for (const who of Object.keys(clients)) {
      assert.equal(await status(who, path), allowed.includes(who) ? 200 : 403, `${who} on ${path}`);
    }
  });
}
