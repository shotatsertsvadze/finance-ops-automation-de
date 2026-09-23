import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "./app.js";
import { loginAs, testDeps } from "./test-support/db.js";

let deps, server, base, clients;
const fixture = (name) => readFileSync(new URL(`../fixtures/xrechnung/${name}`, import.meta.url));
const upload = (name, client = clients.clerk) => client.upload(fixture(name), name);

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  clients = { clerk: await loginAs(base, "clerk"), manager: await loginAs(base, "manager") };
});
after(async () => {
  server.close();
  await deps.pool.end();
});

test("POST /api/invoices returns 201 with the full detail", async () => {
  const res = await upload("A_clean_1240.xml");
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.state, "READY_FOR_APPROVAL");
  assert.equal(body.audit_events[0].actor_name, "Anna Berger");
  assert.equal(body.validation.business.length > 5, true);
});

test("GET /api/invoices lists and filters by state", async () => {
  await upload("G_clean_380.xml");
  const all = await (await clients.clerk.get(`/api/invoices`)).json();
  assert.equal(all.length, 2);
  const approved = await (await clients.clerk.get(`/api/invoices?state=APPROVED`)).json();
  assert.equal(approved.length, 1);
  assert.equal(approved[0].supplier_name, "Berliner Bürobedarf GmbH");
  assert.equal((await clients.clerk.get(`/api/invoices?state=NOPE`)).status, 400);
});

test("non-XML upload is refused with 400", async () => {
  const res = await clients.clerk.upload(Buffer.from("%PDF"), "scan.pdf");
  assert.equal(res.status, 400);
});

test("an unauthenticated upload is refused", async () => {
  const form = new FormData();
  form.append("file", new Blob([fixture("E_high_value_30000.xml")], { type: "application/xml" }), "E.xml");
  const res = await fetch(`${base}/api/invoices`, { method: "POST", body: form });
  assert.equal(res.status, 401);
});

test("GET /api/invoices/:id/file serves the immutable original", async () => {
  const [inv] = await (await clients.clerk.get(`/api/invoices?state=APPROVED`)).json();
  const res = await clients.clerk.get(`/api/invoices/${inv.id}/file`);
  assert.equal(res.status, 200);
  assert.equal((await res.text()).length, fixture("G_clean_380.xml").toString().length);
});

test("POST /api/invoices/:id/reprocess on an approved invoice is a 409", async () => {
  const [inv] = await (await clients.clerk.get(`/api/invoices?state=APPROVED`)).json();
  const res = await clients.clerk.post(`/api/invoices/${inv.id}/reprocess`);
  assert.equal(res.status, 409);
});

test("unknown invoice is a 404", async () => {
  assert.equal((await clients.clerk.get(`/api/invoices/00000000-0000-0000-0000-000000000000`)).status, 404);
});

test("an id that is not a UUID is a 404, on reads and on actions alike", async () => {
  // Postgres refuses the cast, which used to surface as a 500.
  for (const res of [
    await clients.clerk.get("/api/invoices/not-a-uuid"),
    await clients.clerk.get("/api/invoices/not-a-uuid/file"),
    await clients.clerk.post("/api/invoices/not-a-uuid/reprocess"),
  ]) {
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, "INVOICE_NOT_FOUND");
  }
});

test("a malformed cookie is an unknown session, not a server error", async () => {
  const res = await fetch(`${base}/api/invoices`, { headers: { Cookie: "finops_session=%E0%A4%A" } });
  assert.equal(res.status, 401);
});

test("a refused upload says why, by code", async () => {
  const res = await clients.clerk.upload(Buffer.from("%PDF"), "scan.pdf");
  assert.equal((await res.json()).code, "UPLOAD_REJECTED");
});
