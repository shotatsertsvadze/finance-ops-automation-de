/**
 * The bank-account change loop over HTTP (ADR-077): which role may take which
 * step, that the request body cannot supply the number called, and that the
 * whole loop ends with the stopped invoice back in front of a signer.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../app.js";
import { loginAs, resetBankChanges, testDeps } from "../test-support/db.js";

const S1 = "10000000-0000-0000-0000-000000000001";
const H_IBAN = "DE75512108001245126199";
let deps, server, base, as;

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  as = {};
  for (const key of ["clerk", "manager", "finance", "finance2", "cfo", "admin"]) as[key] = await loginAs(base, key);
});
after(async () => {
  server.close();
  await deps.pool.end();
});
beforeEach(async () => {
  await resetBankChanges(deps.pool);
  await deps.pool.query("delete from finops.invoices");
});

const fixture = (name) => readFileSync(new URL(`../../fixtures/xrechnung/${name}`, import.meta.url));
const accountCount = async () => (await deps.pool.query("select count(*)::int as n from finops.supplier_bank_accounts")).rows[0].n;

async function uploadH() {
  const res = await as.clerk.upload(fixture("H_small_iban_changed_380.xml"), "H.xml");
  assert.equal(res.status, 201);
  return res.json();
}

const proposal = (extra = {}) => ({ supplier_id: S1, iban: H_IBAN, comment: "Neue Bankverbindung laut Rechnung", ...extra });
const callback = (extra = {}) => ({
  outcome: "CONFIRMED", contacted_role: "Buchhaltung", called_at: new Date().toISOString(), iban_read_back: H_IBAN, ...extra,
});

async function proposed() {
  const res = await as.clerk.post("/api/bank-changes", proposal());
  assert.equal(res.status, 201);
  return res.json();
}

async function verified() {
  const change = await proposed();
  assert.equal((await as.finance.post(`/api/bank-changes/${change.id}/verify`, callback())).status, 200);
  return change;
}

test("an invoice with a new IBAN changes no master data on its own", async () => {
  const before = await accountCount();
  const invoice = await uploadH();
  assert.equal(invoice.state, "REVIEW_REQUIRED");
  assert.equal(await accountCount(), before);
  const { rows } = await deps.pool.query("select count(*)::int as n from finops.bank_account_changes");
  assert.equal(rows[0].n, 0, "not even a proposal: that is a person's act");
});

test("the whole loop: proposed from the invoice, verified by call-back, approved, invoice back to a signer", async () => {
  const invoice = await uploadH();
  const res = await as.clerk.post("/api/bank-changes", proposal({ source_invoice_id: invoice.id }));
  assert.equal(res.status, 201);
  const change = await res.json();
  assert.equal(change.source_invoice_number, invoice.invoice_number);

  const verify = await as.finance.post(`/api/bank-changes/${change.id}/verify`, callback({ contact_number: "+49 170 0000000" }));
  assert.equal(verify.status, 200);
  const afterVerify = await verify.json();
  assert.equal(afterVerify.verification.contact_number, "+49 30 23125 101", "the number on file, not the one sent");

  const approve = await as.finance2.post(`/api/bank-changes/${change.id}/approve`, { comment: "Rückruf dokumentiert" });
  assert.equal(approve.status, 200);
  const approved = await approve.json();
  assert.equal(approved.state, "APPROVED");
  assert.deepEqual(approved.revalidation.revalidated.map((r) => r.to_state), ["READY_FOR_APPROVAL"]);
  assert.deepEqual(approved.revalidations.map((r) => r.invoice_number), [invoice.invoice_number]);
  assert.deepEqual(approved.events.map((e) => e.action), ["proposed", "verified", "approved", "revalidation_completed"]);

  const detail = await (await as.clerk.get(`/api/invoices/${invoice.id}`)).json();
  assert.equal(detail.state, "READY_FOR_APPROVAL");
  assert.deepEqual(detail.bank_changes.map((c) => [c.change_no, c.state]), [[change.change_no, "APPROVED"]]);
});

test("the list shows open changes to those who may read them", async () => {
  const change = await proposed();
  const res = await as.cfo.get("/api/bank-changes");
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).map((c) => [c.change_no, c.state, c.supplier_no]), [[change.change_no, "PROPOSED", "S-1001"]]);
});

test("who may read, propose, verify, approve, reject and cancel", async () => {
  const change = await proposed();
  const status = async (who, method, path, body) => (method === "GET" ? await as[who].get(path) : await as[who].post(path, body)).status;
  for (const who of ["manager"]) {
    assert.equal(await status(who, "GET", "/api/bank-changes"), 403, who);
    assert.equal(await status(who, "GET", `/api/bank-changes/${change.id}`), 403, who);
  }
  for (const who of ["manager", "cfo", "admin"]) {
    assert.equal(await status(who, "POST", "/api/bank-changes", proposal()), 403, `${who} proposes`);
    assert.equal(await status(who, "POST", `/api/bank-changes/${change.id}/cancel`, { comment: "x" }), 403, `${who} cancels`);
  }
  for (const who of ["clerk", "manager", "admin"]) {
    assert.equal(await status(who, "POST", `/api/bank-changes/${change.id}/verify`, callback()), 403, `${who} verifies`);
    assert.equal(await status(who, "POST", `/api/bank-changes/${change.id}/approve`, {}), 403, `${who} approves`);
    assert.equal(await status(who, "POST", `/api/bank-changes/${change.id}/reject`, { comment: "x" }), 403, `${who} rejects`);
  }
  assert.equal(await status("admin", "GET", `/api/bank-changes/${change.id}`), 200, "admin reads, and only reads");
  const { rows: [still] } = await deps.pool.query("select state from finops.bank_account_changes where id = $1", [change.id]);
  assert.equal(still.state, "PROPOSED");
});

test("separation of duties is enforced by identity, whatever the role allows", async () => {
  // Finance may propose, verify and approve; one finance user may do one of them.
  const res = await as.finance.post("/api/bank-changes", proposal());
  const change = await res.json();
  const own = await as.finance.post(`/api/bank-changes/${change.id}/verify`, callback());
  assert.equal(own.status, 409);
  assert.equal((await own.json()).code, "PROPOSER_CANNOT_VERIFY");
  assert.equal((await as.finance2.post(`/api/bank-changes/${change.id}/verify`, callback())).status, 200);
  const verifierApproves = await as.finance2.post(`/api/bank-changes/${change.id}/approve`, {});
  assert.equal((await verifierApproves.json()).code, "VERIFIER_CANNOT_APPROVE");
  assert.equal((await as.cfo.post(`/api/bank-changes/${change.id}/approve`, {})).status, 200);
});

test("approval without verification is refused over HTTP too", async () => {
  const change = await proposed();
  const res = await as.finance2.post(`/api/bank-changes/${change.id}/approve`, {});
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "CHANGE_NOT_VERIFIED");
});

test("a shared IBAN is approved only with the explicit acknowledgement", async () => {
  const shared = "DE89370400440532013000";
  const res = await as.clerk.post("/api/bank-changes", { supplier_id: "10000000-0000-0000-0000-000000000002", iban: shared, comment: "Factoring" });
  const change = await res.json();
  assert.deepEqual(change.shared_with_now.map((s) => s.supplier_no), ["S-1001"]);
  await as.finance.post(`/api/bank-changes/${change.id}/verify`, callback({ iban_read_back: shared }));
  assert.equal((await (await as.finance2.post(`/api/bank-changes/${change.id}/approve`, { acknowledge_shared_iban: "yes" })).json()).code, "SHARED_IBAN_NOT_ACKNOWLEDGED");
  assert.equal((await as.finance2.post(`/api/bank-changes/${change.id}/approve`, { acknowledge_shared_iban: true })).status, 200);
});

test("a state-changing call needs the CSRF token", async () => {
  const res = await fetch(`${base}/api/bank-changes`, {
    method: "POST", headers: { Cookie: as.clerk.cookies, "Content-Type": "application/json" }, body: JSON.stringify(proposal()),
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, "CSRF_INVALID");
});

test("bad input is a 400 or 404 with a code, never a 500", async () => {
  const cases = [
    [() => as.clerk.post("/api/bank-changes", proposal({ iban: "DE00 1234" })), 400, "IBAN_INVALID"],
    [() => as.clerk.post("/api/bank-changes", proposal({ iban: { x: 1 } })), 400, "IBAN_INVALID"],
    [() => as.clerk.post("/api/bank-changes", proposal({ supplier_id: "S-1001" })), 404, "SUPPLIER_NOT_FOUND"],
    [() => as.clerk.post("/api/bank-changes", proposal({ source_invoice_id: "nope" })), 400, "SOURCE_INVOICE_MISMATCH"],
    [() => as.clerk.post("/api/bank-changes", proposal({ comment: "" })), 400, "REASON_REQUIRED"],
    [() => as.clerk.get("/api/bank-changes/not-a-uuid"), 404, "CHANGE_NOT_FOUND"],
    [() => as.finance.post("/api/bank-changes/00000000-0000-0000-0000-000000000000/verify", callback()), 404, "CHANGE_NOT_FOUND"],
  ];
  for (const [call, status, code] of cases) {
    const res = await call();
    assert.equal(res.status, status, code);
    assert.equal((await res.json()).code, code);
  }
  const change = await proposed();
  const res = await as.finance.post(`/api/bank-changes/${change.id}/verify`, callback({ contacted_role: 42 }));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json().then((b) => [b.code, b.details.field]), ["VERIFICATION_INVALID", "contacted_role"]);
});

test("reject and cancel end a change and leave master data alone", async () => {
  const before = await accountCount();
  const first = await verified();
  assert.equal((await as.cfo.post(`/api/bank-changes/${first.id}/reject`, { comment: "Schreiben gefälscht" })).status, 200);
  const second = await proposed();
  assert.equal((await as.clerk.post(`/api/bank-changes/${second.id}/cancel`, { comment: "Tippfehler" })).status, 200);
  assert.equal(await accountCount(), before);
});

test("revalidation can be asked for again, and is refused before approval", async () => {
  const change = await verified();
  const early = await as.clerk.post(`/api/bank-changes/${change.id}/revalidate`, {});
  assert.equal(early.status, 409);
  await as.finance2.post(`/api/bank-changes/${change.id}/approve`, {});
  const res = await as.clerk.post(`/api/bank-changes/${change.id}/revalidate`, {});
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).revalidation, { revalidated: [], waiting: [], failed: [] });
  assert.equal((await as.manager.post(`/api/bank-changes/${change.id}/revalidate`, {})).status, 403);
});
