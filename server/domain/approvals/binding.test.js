/**
 * Approvals are bound to the document they were given for.
 *
 * A signature currently survives because no code path can rewrite an invoice
 * once it has left review: `saveExtractedFields` runs only inside
 * `processInvoice`, and that is gated on REPROCESSABLE_STATES. That is an
 * accident of a list, not an enforced rule, and corrections, credit notes and
 * partial deliveries are all still to come.
 *
 * These tests force the mismatch directly in the database, because no route
 * can produce one today. What they prove is that if one ever appears, the next
 * gate refuses instead of inheriting the signature.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../app.js";
import { loginAs, testDeps } from "../../test-support/db.js";
import { buildInvoiceXml } from "../../test-support/invoice-xml.js";

let deps, server, base, clients;

// Spree IT-Systeme AG against PO-2026-0305 (40.000,00 open). 10.000,00 net is
// 11.900,00 gross: above tier 1, so it needs MANAGER and then FINANCE.
const TWO_STEP_NET = 1000000;

let counter = 0;
async function upload(netCents = TWO_STEP_NET) {
  const number = `BIND-${Date.now()}-${(counter += 1)}`;
  const xml = buildInvoiceXml({
    number, netCents, po: "PO-2026-0305",
    supplierName: "Spree IT-Systeme AG", supplierVat: "DE345678901",
    iban: "DE02500105170137075030",
  });
  const res = await clients.clerk.upload(xml, `${number}.xml`);
  assert.equal(res.status, 201, `upload ${number}`);
  return res.json();
}

const get = (id) => clients.clerk.get(`/api/invoices/${id}`).then((r) => r.json());

const approve = (id, stepNo, client) => client.post(`/api/invoices/${id}/approvals/${stepNo}/approve`, {});

/** The only way to desynchronise an invoice from its signatures today. */
const bumpValidationRun = (id) =>
  deps.pool.query("update finops.validation_results set run_no = run_no + 1 where invoice_id = $1", [id]);

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  clients = {
    clerk: await loginAs(base, "clerk"),
    manager: await loginAs(base, "manager"),
    finance: await loginAs(base, "finance"),
    finance2: await loginAs(base, "finance2"),
  };
});
after(async () => {
  server.close();
  await deps.pool.end();
});
beforeEach(async () => {
  await deps.pool.query("delete from finops.invoices");
});

test("an approval records the document and the validation run it was given for", async () => {
  const invoice = await upload();
  assert.equal(invoice.state, "READY_FOR_APPROVAL");
  assert.equal((await approve(invoice.id, 1, clients.manager)).status, 200);

  const { rows: [step] } = await deps.pool.query(
    "select * from finops.approval_steps where invoice_id = $1 and step_no = 1", [invoice.id],
  );
  const { rows: [row] } = await deps.pool.query(
    "select file_sha256, gross_amount from finops.invoices where id = $1", [invoice.id],
  );
  assert.equal(step.document_sha256, row.file_sha256, "the signature names the document");
  assert.equal(step.validation_run_no, 1, "and the validation run behind it");
  assert.equal(Number(step.decided_gross), Number(row.gross_amount), "and the amount signed for");
});

test("a later step is refused when the invoice no longer matches what the first step signed", async () => {
  const invoice = await upload();
  assert.equal((await approve(invoice.id, 1, clients.manager)).status, 200);

  await bumpValidationRun(invoice.id);

  const res = await approve(invoice.id, 2, clients.finance);
  assert.equal(res.status, 409, "a second signature must not be added to a changed invoice");
  assert.match((await res.json()).error, /geprüft|Stand|Freigabe/i);
  assert.equal((await get(invoice.id)).state, "READY_FOR_APPROVAL", "and the invoice does not advance");
});

test("the accounting handoff is refused when the approved invoice has since changed", async () => {
  const invoice = await upload();
  assert.equal((await approve(invoice.id, 1, clients.manager)).status, 200);
  assert.equal((await approve(invoice.id, 2, clients.finance)).status, 200);
  assert.equal((await get(invoice.id)).state, "APPROVED");

  await bumpValidationRun(invoice.id);

  const res = await clients.finance.post(`/api/invoices/${invoice.id}/accounting-record`, {});
  assert.equal(res.status, 409, "what is handed to accounting must be what was approved");
  assert.equal((await get(invoice.id)).state, "APPROVED");
});

test("an unchanged invoice runs the whole path exactly as before", async () => {
  const invoice = await upload();
  assert.equal((await approve(invoice.id, 1, clients.manager)).status, 200);
  assert.equal((await approve(invoice.id, 2, clients.finance)).status, 200);

  // The payment goes to a second finance user: the signer may not pay (ADR-056).
  for (const [stage, client] of [["accounting-record", clients.finance], ["payment", clients.finance2], ["payment/confirm", clients.finance2]]) {
    assert.equal((await client.post(`/api/invoices/${invoice.id}/${stage}`, {})).status, 200, stage);
  }
  assert.equal((await get(invoice.id)).state, "PAID");
});

test("the detail view reports what each approver signed for", async () => {
  const invoice = await upload();
  await approve(invoice.id, 1, clients.manager);

  const step = (await get(invoice.id)).approval_steps.find((s) => s.step_no === 1);
  assert.equal(step.status, "APPROVED");
  assert.equal(step.validation_run_no, 1);
  assert.ok(/^[0-9a-f]{64}$/.test(step.document_sha256), "the document hash is readable from the record");
});
