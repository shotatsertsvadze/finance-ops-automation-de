/**
 * The built client served by the API itself (ADR-058). Until now only Vite's
 * dev server could show the UI, so there was no way to run the app outside a
 * development checkout.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "./app.js";

let server, base;

before(() => {
  const clientDir = mkdtempSync(path.join(tmpdir(), "finops-client-"));
  writeFileSync(path.join(clientDir, "index.html"), "<!doctype html><title>Nordwerk</title>");
  mkdirSync(path.join(clientDir, "assets"));
  writeFileSync(path.join(clientDir, "assets", "app.js"), "console.log(1)");
  // No request here carries a session cookie, so the pool is never asked.
  server = createApp({ pool: null }, { clientDir }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test("the built client is served from the API", async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>Nordwerk/);

  const asset = await fetch(`${base}/assets/app.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /javascript/);
});

test("a client route reloaded in the browser gets the page, not a 404", async () => {
  const res = await fetch(`${base}/rechnung/5f0c6f0e-0000-4000-8000-000000000000`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<title>Nordwerk/);
});

test("an unknown API path is never answered with the page", async () => {
  const res = await fetch(`${base}/api/nothing-here`);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, "NOT_SIGNED_IN");
});
