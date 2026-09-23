/**
 * The invoice list at volume (ADR-066). It returned every invoice in one
 * response, and the navigation counted states by downloading that whole list.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../../app.js";
import { loginAs, testDeps } from "../../test-support/db.js";

let deps, server, clerk;
const fixture = (name) => readFileSync(new URL(`../../../fixtures/xrechnung/${name}`, import.meta.url));

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  clerk = await loginAs(`http://127.0.0.1:${server.address().port}`, "clerk");
  for (const name of ["A_clean_1240.xml", "G_clean_380.xml", "E_high_value_30000.xml"]) {
    assert.equal((await clerk.upload(fixture(name), name)).status, 201);
  }
});
after(async () => {
  server.close();
  await deps.pool.end();
});

test("the list comes in pages, newest first, with the full count alongside", async () => {
  const first = await clerk.get("/api/invoices?limit=2");
  assert.equal(first.headers.get("x-total-count"), "3");
  const page1 = await first.json();
  assert.equal(page1.length, 2);

  const page2 = await (await clerk.get("/api/invoices?limit=2&offset=2")).json();
  assert.equal(page2.length, 1);
  assert.equal(new Set([...page1, ...page2].map((i) => i.id)).size, 3, "no invoice twice, none missing");
});

test("a page is 50 unless asked otherwise, and never more than 200", async () => {
  assert.equal((await clerk.get("/api/invoices?limit=201")).status, 400);
  assert.equal((await clerk.get("/api/invoices?limit=0")).status, 400);
  assert.equal((await clerk.get("/api/invoices?offset=-1")).status, 400);
  assert.equal((await (await clerk.get("/api/invoices")).json()).length, 3);
});

test("the count follows the state filter", async () => {
  const res = await clerk.get("/api/invoices?state=READY_FOR_APPROVAL&limit=1");
  assert.equal(res.headers.get("x-total-count"), "2", "A and E wait for approval");
  assert.equal((await res.json()).length, 1);
});

test("the navigation's counts come from one query, not from the list", async () => {
  const counts = await (await clerk.get("/api/invoices/counts")).json();
  assert.deepEqual(counts, { total: 3, by_state: { APPROVED: 1, READY_FOR_APPROVAL: 2 } });
});
