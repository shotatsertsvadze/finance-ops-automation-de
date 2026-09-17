import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "./app.js";
import { testDeps, USERS } from "./test-support/db.js";

let deps, server, base;
const fixture = (name) => readFileSync(new URL(`../fixtures/xrechnung/${name}`, import.meta.url));
const upload = async (name, headers = {}) => {
  const form = new FormData();
  form.append("file", new Blob([fixture(name)], { type: "application/xml" }), name);
  form.append("source_channel", "upload");
  return fetch(`${base}/api/invoices`, { method: "POST", body: form, headers });
};

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await deps.pool.end();
});

test("POST /api/invoices returns 201 with the full detail", async () => {
  const res = await upload("A_clean_1240.xml", { "x-actor-id": USERS.clerk });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.state, "READY_FOR_APPROVAL");
  assert.equal(body.audit_events[0].actor_name, "Anna Berger");
  assert.equal(body.validation.business.length > 5, true);
});

test("GET /api/invoices lists and filters by state", async () => {
  await upload("G_clean_380.xml");
  const all = await (await fetch(`${base}/api/invoices`)).json();
  assert.equal(all.length, 2);
  const approved = await (await fetch(`${base}/api/invoices?state=APPROVED`)).json();
  assert.equal(approved.length, 1);
  assert.equal(approved[0].supplier_name, "Berliner Bürobedarf GmbH");
  assert.equal((await fetch(`${base}/api/invoices?state=NOPE`)).status, 400);
});

test("non-XML upload is refused with 400", async () => {
  const form = new FormData();
  form.append("file", new Blob([Buffer.from("%PDF")], { type: "application/pdf" }), "scan.pdf");
  const res = await fetch(`${base}/api/invoices`, { method: "POST", body: form });
  assert.equal(res.status, 400);
});

test("unknown actor id is refused with 400", async () => {
  const res = await upload("E_high_value_30000.xml", { "x-actor-id": "00000000-0000-0000-0000-0000000000ff" });
  assert.equal(res.status, 400);
});

test("GET /api/invoices/:id/file serves the immutable original", async () => {
  const [inv] = await (await fetch(`${base}/api/invoices?state=APPROVED`)).json();
  const res = await fetch(`${base}/api/invoices/${inv.id}/file`);
  assert.equal(res.status, 200);
  assert.equal((await res.text()).length, fixture("G_clean_380.xml").toString().length);
});

test("POST /api/invoices/:id/reprocess on an approved invoice is a 409", async () => {
  const [inv] = await (await fetch(`${base}/api/invoices?state=APPROVED`)).json();
  const res = await fetch(`${base}/api/invoices/${inv.id}/reprocess`, { method: "POST" });
  assert.equal(res.status, 409);
});

test("unknown invoice is a 404", async () => {
  assert.equal((await fetch(`${base}/api/invoices/00000000-0000-0000-0000-000000000000`)).status, 404);
});
