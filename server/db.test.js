import { test } from "node:test";
import assert from "node:assert/strict";
import { createPool } from "./db.js";
import { logOutput } from "./log.js";

test("a dropped idle connection is logged, not fatal", async () => {
  // pg emits 'error' on the pool when an idle client's connection dies (a
  // database restart, a network blip). With no listener Node treats it as
  // unhandled and the whole API process exits.
  const pool = createPool("postgresql://localhost/unused");
  assert.ok(pool.listenerCount("error") > 0);
  const logged = [];
  const original = logOutput.write;
  logOutput.write = (line) => logged.push(JSON.parse(line));
  try {
    pool.emit("error", new Error("terminating connection due to administrator command"));
  } finally {
    logOutput.write = original;
  }
  assert.equal(logged[0].level, "error");
  assert.match(logged[0].error, /terminating connection/);
  await pool.end();
});
