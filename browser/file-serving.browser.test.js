/**
 * L9: proving in a browser that a stored original cannot execute.
 *
 * The header tests in `server/routes/file-serving.test.js` assert the contract:
 * text/plain, nosniff, a sandbox policy. They cannot assert the consequence,
 * because whether a document runs is the browser's decision, not the header's.
 * Until this existed that consequence was only ever checked by hand.
 *
 * The attack this reproduces: a file refused as an invoice is still
 * downloadable, and a refused invoice can be a perfectly good XHTML page. If it
 * renders on the API's own origin, its script runs with the session of whoever
 * opened the link.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { loginAs, testDeps } from "../server/test-support/db.js";
import { launchOrSkip } from "./support.js";

let deps, server, base, clerk;

/** Well-formed XHTML named `.xml`: refused as an invoice, valid as a page. */
const ACTIVE_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>probe</title></head>
  <body>
    <p id="marker">not-executed</p>
    <script type="application/javascript"><![CDATA[
      window.__executed = true;
      document.getElementById("marker").textContent = "executed";
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((d) => { window.__role = d.user ? d.user.role : "none"; })
        .catch((e) => { window.__role = "blocked:" + e.message; });
    ]]></script>
  </body>
</html>`;

/** The signed-in session as the browser would hold it. */
const sessionCookies = () =>
  clerk.cookies.split("; ").map((pair) => {
    const index = pair.indexOf("=");
    return {
      name: pair.slice(0, index),
      value: pair.slice(index + 1),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Strict",
    };
  });

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  clerk = await loginAs(base, "clerk");
  await deps.pool.query("delete from finops.invoices");
});
after(async () => {
  server.close();
  await deps.pool.end();
});

test("an uploaded document does not execute when a browser opens it", async (t) => {
  const browser = await launchOrSkip(t);
  if (!browser) return;

  try {
    const upload = await clerk.upload(ACTIVE_CONTENT, "active-content.xml");
    assert.equal(upload.status, 201);
    const invoice = await upload.json();
    assert.equal(invoice.state, "REVIEW_REQUIRED", "refused as an invoice, and still downloadable");

    // The victim's session, on the application's own origin.
    const context = await browser.newContext();
    await context.addCookies(sessionCookies());
    const page = await context.newPage();
    await page.goto(`${base}/api/invoices/${invoice.id}/file`, { waitUntil: "load" });
    await page.waitForTimeout(300);

    assert.equal(await page.evaluate(() => window.__executed ?? false), false, "the script must not run");
    assert.equal(await page.evaluate(() => window.__role ?? null), null, "and must not reach the API");
    assert.equal(await page.title(), "", "the document is not rendered as a page");

    const shown = await page.evaluate(() => document.body.textContent ?? "");
    assert.match(shown, /not-executed/, "the source is shown as text");
    assert.match(shown, /<script/, "including the script, as text rather than as script");
  } finally {
    await browser.close();
  }
});

test("a genuine invoice is still readable as source", async (t) => {
  const browser = await launchOrSkip(t);
  if (!browser) return;

  try {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>BROWSER-READ-1</cbc:ID>
</Invoice>`;
    const upload = await clerk.upload(xml, "readable.xml");
    const invoice = await upload.json();

    const context = await browser.newContext();
    await context.addCookies(sessionCookies());
    const page = await context.newPage();
    await page.goto(`${base}/api/invoices/${invoice.id}/file`, { waitUntil: "load" });

    // Defending the endpoint must not stop a reviewer reading the evidence.
    assert.match(await page.evaluate(() => document.body.textContent ?? ""), /BROWSER-READ-1/);
  } finally {
    await browser.close();
  }
});
