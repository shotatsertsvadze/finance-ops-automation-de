/**
 * Serving the stored original safely.
 *
 * The XML gate decides what the system will *process*. It does not decide what
 * a browser will *render*: a rejected document stays downloadable, and one that
 * was refused as an invoice can still be a perfectly good XHTML page. Served
 * inline as application/xml on the API's own origin, its script runs with the
 * session of whoever opened the link.
 *
 * Reproduced against the running app on 2026-09-17: an uploaded XHTML named
 * `.xml` was routed to review as expected, and opening its original-file URL in
 * a browser authenticated as a manager executed its script, which then read
 * /api/auth/me and got back role MANAGER.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { loginAs, testDeps } from "../test-support/db.js";

let deps, server, base, clerk;

const ACTIVE_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>probe</title></head>
  <body><p id="marker">not-executed</p>
    <script type="application/javascript"><![CDATA[
      document.getElementById("marker").textContent = "executed";
    ]]></script>
  </body>
</html>`;

const upload = async (content, name) => {
  const res = await clerk.upload(content, name);
  assert.equal(res.status, 201, `upload ${name}`);
  return res.json();
};

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  clerk = await loginAs(base, "clerk");
});
after(async () => {
  server.close();
  await deps.pool.end();
});
beforeEach(async () => {
  await deps.pool.query("delete from finops.invoices");
});

test("an uploaded document is never served as a type the browser will render", async () => {
  const invoice = await upload(ACTIVE_CONTENT, "active-content.xml");
  assert.equal(invoice.state, "REVIEW_REQUIRED", "it is refused as an invoice");

  const res = await clerk.get(`/api/invoices/${invoice.id}/file`);
  assert.equal(res.status, 200, "but it is still downloadable, so serving must be safe");

  const type = res.headers.get("content-type") ?? "";
  assert.ok(!/xml|html|svg/i.test(type), `a renderable type lets the document run: ${type}`);
  assert.match(type, /^text\/plain/, "the original is shown as source text");
  assert.match(type, /charset=utf-8/i, "so a UTF-8 document is not re-interpreted");
});

test("the browser is told not to sniff a renderable type back out of the bytes", async () => {
  const invoice = await upload(ACTIVE_CONTENT, "active-content.xml");
  const res = await clerk.get(`/api/invoices/${invoice.id}/file`);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});

test("the response carries a policy that forbids scripts and embedding", async () => {
  const invoice = await upload(ACTIVE_CONTENT, "active-content.xml");
  const res = await clerk.get(`/api/invoices/${invoice.id}/file`);

  const csp = res.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'none'/, `no policy on the served original: ${csp}`);
  assert.match(csp, /sandbox/, "a sandboxed document cannot run script or navigate");
});

test("the stored bytes are still returned exactly as received", async () => {
  // Safety must come from how it is served, never from rewriting the evidence.
  const invoice = await upload(ACTIVE_CONTENT, "active-content.xml");
  const res = await clerk.get(`/api/invoices/${invoice.id}/file`);
  assert.equal(await res.text(), ACTIVE_CONTENT);
});

test("the filename in the disposition cannot break out of the header", async () => {
  const invoice = await upload(ACTIVE_CONTENT, 'weird";\r\nX-Injected: yes.xml');
  const res = await clerk.get(`/api/invoices/${invoice.id}/file`);
  const disposition = res.headers.get("content-disposition") ?? "";

  assert.equal(res.headers.get("x-injected"), null, "a filename must not add headers");
  assert.ok(!/[\r\n]/.test(disposition), `no line breaks in the disposition: ${disposition}`);
});

test("every API response says not to sniff its type", async () => {
  const res = await clerk.get("/api/invoices");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});
