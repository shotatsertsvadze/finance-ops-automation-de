import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testDeps } from "../../test-support/db.js";
import { handleUpload, processInvoice, receiveInvoice } from "./intake.js";
import { getInvoiceDetail } from "../invoice/queries.js";
import { SYSTEM, TransitionError, transition } from "../workflow/transitions.js";
import { withTransaction } from "../../db.js";

const fixture = (name) => readFileSync(new URL(`../../../fixtures/xrechnung/${name}`, import.meta.url));
let deps;
const upload = (name) => handleUpload(deps, { buffer: fixture(name), originalFilename: name, sourceChannel: "UPLOAD", actor: SYSTEM });
const detail = (id) => getInvoiceDetail(deps.pool, id);
const failedCodes = (d) => [...d.validation.technical, ...d.validation.business].filter((c) => c.status === "FAILED").map((c) => c.check_code);

before(async () => {
  deps = await testDeps();
});
after(() => deps.pool.end());

test("A: clean 1240 EUR waits for one MANAGER approval with a full audit trail", async () => {
  const { id } = await upload("A_clean_1240.xml");
  const d = await detail(id);
  assert.equal(d.state, "READY_FOR_APPROVAL");
  assert.equal(d.gross_amount, "1240.00");
  assert.equal(d.supplier_no, "S-1001");
  assert.equal(d.po_number, "PO-2026-0101");
  assert.deepEqual(d.approval_steps.map((s) => [s.step_no, s.required_role, s.status]), [[1, "MANAGER", "PENDING"]]);
  assert.deepEqual(d.audit_events.map((e) => [e.action, e.from_state, e.to_state]), [
    ["received", null, "RECEIVED"],
    ["processing_started", "RECEIVED", "VALIDATING"],
    ["routed_to_approval", "VALIDATING", "READY_FOR_APPROVAL"],
  ]);
  assert.equal(d.routing.decision, "APPROVAL");
  assert.equal(d.lines.length, 3);
});

test("G: clean 380 EUR is approved by the system (straight-through)", async () => {
  const { id } = await upload("G_clean_380.xml");
  const d = await detail(id);
  assert.equal(d.state, "APPROVED");
  assert.equal(d.approval_steps.length, 0);
  const last = d.audit_events.at(-1);
  assert.equal(last.action, "auto_approved");
  assert.equal(last.actor_type, "SYSTEM");
});

test("B: changed IBAN never auto-passes", async () => {
  const { id } = await upload("B_iban_changed_2499.xml");
  const d = await detail(id);
  assert.equal(d.state, "REVIEW_REQUIRED");
  assert.equal(d.review_reason, "SUPPLIER_IBAN_MATCH");
  assert.ok(failedCodes(d).includes("supplier_iban_match"));
  assert.equal(d.approval_steps.length, 0);
});

test("C: PO overrun goes to review", async () => {
  const { id } = await upload("C_po_overrun_8500.xml");
  const d = await detail(id);
  assert.equal(d.state, "REVIEW_REQUIRED");
  assert.equal(d.review_reason, "PO_AMOUNT_WITHIN_TOLERANCE");
});

test("D: same supplier and number in a different file is flagged, not processed", async () => {
  const { id } = await upload("D_duplicate_number_1240.xml");
  const d = await detail(id);
  assert.equal(d.state, "REVIEW_REQUIRED");
  assert.equal(d.review_reason, "DUPLICATE_INVOICE_NUMBER");
});

test("E: 30000 EUR requires MANAGER, FINANCE and CFO", async () => {
  const { id } = await upload("E_high_value_30000.xml");
  const d = await detail(id);
  assert.equal(d.state, "READY_FOR_APPROVAL");
  assert.deepEqual(d.approval_steps.map((s) => s.required_role), ["MANAGER", "FINANCE", "CFO"]);
});

test("F: malformed file fails closed into the review queue and keeps the file", async () => {
  const { id } = await upload("F_malformed.xml");
  const d = await detail(id);
  assert.equal(d.state, "REVIEW_REQUIRED");
  assert.equal(d.review_reason, "TECHNICAL_VALIDATION_FAILED");
  assert.equal(d.validation.business.length, 0);
  assert.ok(failedCodes(d).includes("required_fields_present"));
  const file = await deps.storage.read((await deps.pool.query("select file_path from finops.invoices where id = $1", [id])).rows[0].file_path);
  assert.equal(file.length, fixture("F_malformed.xml").length);
});

test("identical file uploaded again becomes DUPLICATE and is not processed", async () => {
  const first = (await deps.pool.query("select id from finops.invoices where original_filename = 'A_clean_1240.xml' and state <> 'DUPLICATE'")).rows[0].id;
  const { id, state } = await upload("A_clean_1240.xml");
  assert.equal(state, "DUPLICATE");
  const d = await detail(id);
  assert.equal(d.state, "DUPLICATE");
  assert.equal(d.duplicate_of, first);
  assert.equal(d.validation.technical.length, 0);
  assert.deepEqual(d.audit_events.map((e) => e.action), ["duplicate_file_detected"]);
  const original = await detail(first);
  assert.equal(original.audit_events.at(-1).action, "duplicate_attempt");
  assert.equal(original.state, "READY_FOR_APPROVAL");
});

test("non-XML bytes fail closed and stay visible", async () => {
  const { id } = await handleUpload(deps, { buffer: Buffer.from("%PDF-1.7 nope"), originalFilename: "scan.xml", sourceChannel: "EMAIL", actor: SYSTEM });
  const d = await detail(id);
  assert.equal(d.state, "REVIEW_REQUIRED");
  assert.equal(d.source_channel, "EMAIL");
});

test("database forbids two payable records for the same supplier invoice number", async () => {
  // Writes rows directly, bypassing transition(), to prove the constraint holds
  // even if application code were wrong. Cleaned up so the audit-completeness
  // test below only sees invoices that went through the real pipeline.
  const supplier = (await deps.pool.query("select id from finops.suppliers where supplier_no = 'S-1001'")).rows[0].id;
  const insert = (n) => deps.pool.query(
    `insert into finops.invoices (state, source_channel, original_filename, file_sha256, file_path, file_size_bytes, supplier_id, invoice_number)
     values ('APPROVED', 'TEST', 'x', $1, 'x', 1, $2, 'INV-DUP-1')`, [`hash-${n}`, supplier],
  );
  try {
    await insert(1);
    await assert.rejects(insert(2), (e) => e.code === "23505");
  } finally {
    await deps.pool.query("delete from finops.invoices where invoice_number = 'INV-DUP-1'");
  }
});

test("an undeclared transition throws and writes nothing", async () => {
  const { id } = (await deps.pool.query("select id from finops.invoices where state = 'APPROVED' limit 1")).rows[0];
  const before = (await deps.pool.query("select count(*)::int as n from finops.audit_events where invoice_id = $1", [id])).rows[0].n;
  await assert.rejects(
    withTransaction(deps.pool, (client) => transition(client, { invoiceId: id, to: "REJECTED", actor: SYSTEM, action: "x" })),
    TransitionError,
  );
  const after = (await deps.pool.query("select count(*)::int as n from finops.audit_events where invoice_id = $1", [id])).rows[0].n;
  assert.equal(after, before);
  assert.equal((await deps.pool.query("select state from finops.invoices where id = $1", [id])).rows[0].state, "APPROVED");
});

test("a human action without actor id is refused", async () => {
  const { id } = (await deps.pool.query("select id from finops.invoices where state = 'REVIEW_REQUIRED' limit 1")).rows[0];
  await assert.rejects(
    withTransaction(deps.pool, (client) => transition(client, { invoiceId: id, to: "REJECTED", actor: { type: "HUMAN", id: null }, action: "review_rejected" })),
    /ohne Akteur/,
  );
});

test("every state change has exactly one audit event", async () => {
  const { rows } = await deps.pool.query(
    `select i.id, i.state, (select to_state from finops.audit_events e where e.invoice_id = i.id order by occurred_at desc, id desc limit 1) as last_to
     from finops.invoices i`,
  );
  for (const r of rows) assert.equal(r.last_to, r.state, r.id);
  const { rows: [gap] } = await deps.pool.query(
    `select count(*)::int as n from finops.audit_events e
     where e.from_state is not null and e.from_state <> e.to_state and not exists (
       select 1 from finops.audit_events p where p.invoice_id = e.invoice_id and p.to_state = e.from_state and p.id < e.id)`,
  );
  assert.equal(gap.n, 0, "every from_state was reached by an earlier event");
});

test("reprocess is allowed from REVIEW_REQUIRED and refused from APPROVED", async () => {
  const review = (await deps.pool.query("select id from finops.invoices where review_reason = 'SUPPLIER_IBAN_MATCH'")).rows[0].id;
  await processInvoice(deps, review, SYSTEM);
  const d = await detail(review);
  assert.equal(d.state, "REVIEW_REQUIRED");
  assert.equal(d.routing.run_no, 2);
  assert.ok(d.audit_events.some((e) => e.action === "reprocessing_started"));
  const approved = (await deps.pool.query("select id from finops.invoices where state = 'APPROVED' and invoice_number is not null limit 1")).rows[0].id;
  await assert.rejects(processInvoice(deps, approved, SYSTEM), TransitionError);
});

test("after the IBAN is approved in master data, re-validation clears the exception", async () => {
  const review = (await deps.pool.query("select id, supplier_id from finops.invoices where review_reason = 'SUPPLIER_IBAN_MATCH'")).rows[0];
  await deps.pool.query("insert into finops.supplier_bank_accounts (supplier_id, iban, status) values ($1, 'DE02300209000106531065', 'ACTIVE')", [review.supplier_id]);
  await processInvoice(deps, review.id, SYSTEM);
  const d = await detail(review.id);
  assert.equal(d.state, "READY_FOR_APPROVAL");
  assert.deepEqual(d.approval_steps.map((s) => s.required_role), ["MANAGER"]);
});

test("receiveInvoice writes intake facts that processing never changes", async () => {
  const received = await receiveInvoice(deps, { buffer: fixture("E_high_value_30000.xml"), originalFilename: "renamed.xml", sourceChannel: "PORTAL", actor: SYSTEM });
  assert.equal(received.state, "DUPLICATE");
  const d = await detail(received.id);
  assert.equal(d.original_filename, "renamed.xml");
  assert.equal(d.source_channel, "PORTAL");
});
