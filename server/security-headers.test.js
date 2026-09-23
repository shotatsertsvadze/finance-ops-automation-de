/**
 * Browser security headers (ADR-074). Only nosniff was set, so the approval
 * screens could be framed by another site (clickjacking), and nothing limited
 * where scripts could come from.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "./app.js";

let server, base;
before(() => {
  const clientDir = mkdtempSync(path.join(tmpdir(), "finops-headers-"));
  writeFileSync(path.join(clientDir, "index.html"), "<!doctype html>");
  server = createApp({ pool: null }, { clientDir }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

for (const route of ["/", "/api/health"]) {
  test(`${route} carries the security headers`, async () => {
    const headers = (await fetch(`${base}${route}`)).headers;
    const csp = headers.get("content-security-policy") ?? "";
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/, "no other site may frame the approval screens");
    assert.match(csp, /object-src 'none'/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    assert.equal(headers.get("x-frame-options"), "DENY");
    assert.equal(headers.get("referrer-policy"), "no-referrer");
    assert.equal(headers.get("x-content-type-options"), "nosniff");
  });
}

test("HSTS is sent in production only, where HTTPS is required anyway", async () => {
  assert.equal((await fetch(`${base}/api/health`)).headers.get("strict-transport-security"), null);
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.match((await fetch(`${base}/api/health`)).headers.get("strict-transport-security"), /max-age=31536000/);
  } finally {
    process.env.NODE_ENV = before;
  }
});
