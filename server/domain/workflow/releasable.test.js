/**
 * The detail says whether review may release the invoice (ADR-071). The screen
 * offered "Zur Freigabe geben" for every invoice in review, and the server then
 * refused the ones with a failure no reviewer may override.
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
});
after(async () => {
  server.close();
  await deps.pool.end();
});

test("a changed IBAN blocks the release, and the detail says so", async () => {
  const invoice = await (await clerk.upload(fixture("B_iban_changed_2499.xml"), "B.xml")).json();
  assert.equal(invoice.state, "REVIEW_REQUIRED");
  assert.deepEqual(invoice.payable_blockers, ["supplier_iban_match"]);
  const release = await clerk.post(`/api/invoices/${invoice.id}/review/accept`, {});
  assert.equal((await release.json()).details.blockers[0], "supplier_iban_match", "the same answer the release gives");
});

test("an exception a reviewer may accept blocks nothing", async () => {
  const invoice = await (await clerk.upload(fixture("C_po_overrun_8500.xml"), "C.xml")).json();
  assert.equal(invoice.state, "REVIEW_REQUIRED");
  assert.deepEqual(invoice.payable_blockers, []);
});
