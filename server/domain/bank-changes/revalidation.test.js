/**
 * What an approved bank account does to the invoices that were stopped for
 * carrying it (ADR-077): each is validated again in a new run, in its own
 * transaction with its link to the change, and nothing is approved that a
 * person has not signed (ADR-020).
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { USERS, resetBankChanges, testDeps } from "../../test-support/db.js";
import { buildInvoiceXml } from "../../test-support/invoice-xml.js";
import { handleUpload } from "../intake/intake.js";
import { decideReview } from "../approvals/approvals.js";
import { human } from "../workflow/transitions.js";
import { proposeChange, verifyChange } from "./changes.js";
import { approveAndRevalidate, revalidateChange } from "./revalidation.js";

const S1 = "10000000-0000-0000-0000-000000000001";
const S2 = "10000000-0000-0000-0000-000000000002";
const H_IBAN = "DE75512108001245126199";
const B_IBAN = "DE02300209000106531065";
const clerk = human(USERS.clerk);
let deps;

before(async () => {
  deps = await testDeps();
});
after(() => deps.pool.end());
beforeEach(async () => {
  await resetBankChanges(deps.pool);
  await deps.pool.query("delete from finops.invoices");
});

const fixture = (name) => readFileSync(new URL(`../../../fixtures/xrechnung/${name}`, import.meta.url));

async function upload(buffer, name) {
  const { id } = await handleUpload(deps, { buffer: Buffer.from(buffer), originalFilename: name, sourceChannel: "UPLOAD", actor: clerk });
  return id;
}

const invoice = async (id) => (await deps.pool.query("select state, had_exception from finops.invoices where id = $1", [id])).rows[0];

const checksOfRun = async (id, runNo) => Object.fromEntries((await deps.pool.query(
  "select check_code, status from finops.validation_results where invoice_id = $1 and run_no = $2", [id, runNo],
)).rows.map((r) => [r.check_code, r.status]));

const runs = async (id) => (await deps.pool.query(
  "select distinct run_no from finops.validation_results where invoice_id = $1 order by run_no", [id],
)).rows.map((r) => r.run_no);

const links = async (changeId) => (await deps.pool.query(
  "select invoice_id, from_state, to_state, from_run_no, to_run_no from finops.bank_change_revalidations where change_id = $1", [changeId],
)).rows;

/** A verified change for this supplier and IBAN, ready for the third person. */
async function verifiedChange(supplierId, iban) {
  const { change } = await proposeChange(deps, { supplierId, iban, reason: "Kontowechsel laut Lieferant", actor: clerk });
  await verifyChange(deps, {
    changeId: change.id, actor: human(USERS.finance), outcome: "CONFIRMED", contactedRole: "Buchhaltung",
    calledAt: new Date().toISOString(), ibanReadBack: iban,
  });
  return change;
}

const approve = (change, depsOverride = deps) =>
  approveAndRevalidate(depsOverride, { changeId: change.id, actor: human(USERS.finance2) });

test("the invoice that carried the new account is validated again: a new run, the old one kept", async () => {
  const b = await upload(fixture("B_iban_changed_2499.xml"), "B.xml");
  assert.equal((await invoice(b)).state, "REVIEW_REQUIRED");
  const change = await verifiedChange(S2, B_IBAN);

  const { revalidation } = await approve(change);

  assert.deepEqual(revalidation.revalidated.map((r) => [r.invoice_id, r.to_state]), [[b, "READY_FOR_APPROVAL"]]);
  assert.equal((await invoice(b)).state, "READY_FOR_APPROVAL");
  assert.deepEqual(await runs(b), [1, 2]);
  assert.equal((await checksOfRun(b, 1)).supplier_iban_match, "FAILED", "the first run is history, unchanged");
  assert.equal((await checksOfRun(b, 2)).supplier_iban_match, "PASSED");
  assert.deepEqual(await links(change.id), [{ invoice_id: b, from_state: "REVIEW_REQUIRED", to_state: "READY_FOR_APPROVAL", from_run_no: 1, to_run_no: 2 }]);

  const { rows: [started] } = await deps.pool.query(
    "select actor_type, evidence from finops.audit_events where invoice_id = $1 and action = 'reprocessing_started'", [b],
  );
  assert.equal(started.actor_type, "SYSTEM");
  assert.equal(started.evidence.change_no, change.change_no, "the invoice's trail names the change");
  const { rows: [done] } = await deps.pool.query("select revalidated_at from finops.bank_account_changes where id = $1", [change.id]);
  assert.ok(done.revalidated_at, "nothing is left to revalidate");
});

test("a low-value former exception still needs a signature, never auto-approval", async () => {
  // H is 380 EUR, below the auto-approve limit. Clean now, but it was an
  // exception, so ADR-020 routes it to a person.
  const h = await upload(fixture("H_small_iban_changed_380.xml"), "H.xml");
  const change = await verifiedChange(S1, H_IBAN);
  await approve(change);
  assert.deepEqual(await invoice(h), { state: "READY_FOR_APPROVAL", had_exception: true });
  const { rows } = await deps.pool.query("select status from finops.approval_steps where invoice_id = $1 and status = 'PENDING'", [h]);
  assert.equal(rows.length, 1);
});

test("an unrelated failure is found again and keeps the invoice in review", async () => {
  const xml = buildInvoiceXml({ number: "RV-PO-1", netCents: 100000, iban: H_IBAN });
  const id = await upload(xml, "rv.xml");
  const change = await verifiedChange(S1, H_IBAN);
  const { revalidation } = await approve(change);
  assert.equal(revalidation.revalidated[0].to_state, "REVIEW_REQUIRED");
  assert.equal((await invoice(id)).state, "REVIEW_REQUIRED");
  const latest = await checksOfRun(id, 2);
  assert.equal(latest.supplier_iban_match, "PASSED");
  assert.equal(latest.po_amount_within_tolerance, "FAILED");
});

test("an invoice waiting for information is left alone until a person says it arrived", async () => {
  const b = await upload(fixture("B_iban_changed_2499.xml"), "B.xml");
  await decideReview(deps, { invoiceId: b, action: "request-info", actor: clerk, comment: "Rückruf beim Lieferanten" });
  const change = await verifiedChange(S2, B_IBAN);

  const { revalidation } = await approve(change);
  assert.deepEqual(revalidation.waiting.map((w) => w.invoice_id), [b]);
  assert.equal((await invoice(b)).state, "INFO_REQUESTED");
  assert.deepEqual(await runs(b), [1]);

  // Information received returns the invoice to review and validates nothing
  // (the ARCHITECTURE decision of 2026-09-30); revalidation is its own step.
  await decideReview(deps, { invoiceId: b, action: "info-received", actor: clerk, comment: "Lieferant bestätigt" });
  assert.equal((await invoice(b)).state, "REVIEW_REQUIRED");
  assert.deepEqual(await runs(b), [1]);

  const retry = await revalidateChange(deps, change.id, clerk);
  assert.deepEqual(retry.revalidated.map((r) => r.to_state), ["READY_FOR_APPROVAL"]);
  const { rows: [started] } = await deps.pool.query(
    "select actor_type, actor_id from finops.audit_events where invoice_id = $1 and action = 'reprocessing_started'", [b],
  );
  assert.deepEqual(started, { actor_type: "HUMAN", actor_id: USERS.clerk }, "a retry is the person's act");
});

test("an invoice rejected in the meantime is skipped", async () => {
  const h = await upload(fixture("H_small_iban_changed_380.xml"), "H.xml");
  await decideReview(deps, { invoiceId: h, action: "reject", actor: clerk, comment: "Betrugsverdacht" });
  const change = await verifiedChange(S1, H_IBAN);
  const { revalidation } = await approve(change);
  assert.deepEqual(revalidation.revalidated, []);
  assert.equal((await invoice(h)).state, "REJECTED");
  assert.deepEqual(await runs(h), [1]);
  assert.deepEqual(await links(change.id), []);
});

test("another supplier's invoice, or another IBAN, is not touched", async () => {
  const h = await upload(fixture("H_small_iban_changed_380.xml"), "H.xml");
  const other = await upload(buildInvoiceXml({ number: "RV-OTHER", netCents: 10000, iban: B_IBAN }), "other.xml");
  const change = await verifiedChange(S2, B_IBAN);
  await approve(change);
  assert.deepEqual(await runs(h), [1]);
  assert.deepEqual(await runs(other), [1], "S1's invoice carries the IBAN, but the account was added for S2");
  assert.equal((await invoice(other)).state, "REVIEW_REQUIRED");
});

/**
 * The pool, except that one statement matching `pattern` fails once: a crash
 * at exactly that point of a transaction.
 */
function crashingOnce(pool, pattern) {
  let armed = true;
  return {
    query: (...args) => pool.query(...args),
    connect: async () => {
      const client = await pool.connect();
      const { query, release } = client;
      client.query = function (sql, ...rest) {
        if (armed && typeof sql === "string" && pattern.test(sql)) {
          armed = false;
          return Promise.reject(new Error("simulierter Absturz"));
        }
        return query.call(this, sql, ...rest);
      };
      client.release = (...args) => {
        Object.assign(client, { query, release });
        return release.apply(client, args);
      };
      return client;
    },
  };
}

test("a crash before the link leaves no run behind, and the retry runs the invoice once", async () => {
  const b = await upload(fixture("B_iban_changed_2499.xml"), "B.xml");
  const change = await verifiedChange(S2, B_IBAN);

  const { change: approved, revalidation } = await approve(change, { ...deps, pool: crashingOnce(deps.pool, /insert into finops\.bank_change_revalidations/) });
  assert.equal(approved.state, "APPROVED", "the master-data change is committed first");
  assert.deepEqual(revalidation.failed.map((f) => f.invoice_id), [b]);
  assert.deepEqual(await runs(b), [1], "the run went with its missing link");
  assert.equal((await invoice(b)).state, "REVIEW_REQUIRED");
  const { rows: [open] } = await deps.pool.query("select revalidated_at from finops.bank_account_changes where id = $1", [change.id]);
  assert.equal(open.revalidated_at, null, "incomplete until the retry");

  const [first, second] = await Promise.all([revalidateChange(deps, change.id, clerk), revalidateChange(deps, change.id, clerk)]);
  assert.equal(first.revalidated.length + second.revalidated.length, 1, "two retries at once run it once");
  assert.deepEqual(await runs(b), [1, 2]);
  assert.equal((await links(change.id)).length, 1);

  const third = await revalidateChange(deps, change.id, clerk);
  assert.deepEqual(third.revalidated, []);
  assert.deepEqual(await runs(b), [1, 2], "a retry after completion adds no run");
});

test("only an approved change revalidates", async () => {
  const change = await verifiedChange(S1, H_IBAN);
  await assert.rejects(revalidateChange(deps, change.id, clerk), (error) => error.code === "CHANGE_STATE_CONFLICT");
});
