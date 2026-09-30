/**
 * Which actions this invoice offers, and which progress path it is on.
 *
 * Both were decided inside the components until now, which meant the only way
 * to check them was to drive a browser by hand - and both were changed three
 * times while credit notes and netting were built. The rules are not about
 * rendering, so they live in plain functions and are checked here.
 *
 * The server enforces all of this regardless. These rules only decide what is
 * offered, and the cost of getting them wrong is offering a person a button
 * that sends money the wrong way.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { availableActions, pathFor, primaryAction } from "./actions.js";

const invoice = (over = {}) => ({
  state: "ACCOUNTING_READY", document_type: "INVOICE", approval_steps: [],
  gross_amount: "1428.00", open_credit_amount: "0", accounting_record: { document_no: "BELEG-1" }, ...over,
});
const keys = (inv) => availableActions(inv).actions.map((a) => a.key);

test("a review offers the decisions a reviewer makes", () => {
  assert.deepEqual(keys(invoice({ state: "REVIEW_REQUIRED" })),
    ["accept", "request-info", "confirm-duplicate", "reject", "reprocess"]);
});

test("a review whose failures no reviewer may override offers no release", () => {
  // The server refuses the release with NOT_PAYABLE_ELIGIBLE; the button would
  // always fail (ADR-071).
  const result = availableActions(invoice({ state: "REVIEW_REQUIRED", payable_blockers: ["supplier_iban_match"] }));
  assert.deepEqual(result.actions.map((a) => a.key), ["request-info", "confirm-duplicate", "reject", "reprocess"]);
  assert.equal(result.prompt.key, "hintNotReleasable");
});

test("an approval step offers approve and reject, and names the step", () => {
  const inv = invoice({
    state: "READY_FOR_APPROVAL",
    approval_steps: [{ step_no: 1, status: "PENDING", required_role: "MANAGER" }],
  });
  assert.deepEqual(keys(inv), ["approve", "step-reject", "request-info"]);
  assert.equal(availableActions(inv).step.step_no, 1);
});

test("an approval with no pending step offers nothing", () => {
  // The state says waiting, the steps say otherwise. Offering "approve" would
  // produce a button that always fails.
  assert.deepEqual(keys(invoice({ state: "READY_FOR_APPROVAL" })), []);
});

test("an approved invoice offers the booking", () => {
  assert.deepEqual(keys(invoice({ state: "APPROVED" })), ["accounting", "cancel"]);
});

test("a booked invoice with no credits offers payment", () => {
  const result = availableActions(invoice());
  assert.deepEqual(result.actions.map((a) => a.key), ["pay", "cancel"]);
  assert.equal(result.prompt.key, "hintAccountingReady");
});

test("a booked credit note offers the credit, never the payment", () => {
  // The failure this prevents: sending money in the direction the document
  // reverses.
  const result = availableActions(invoice({ document_type: "CREDIT_NOTE" }));
  assert.deepEqual(result.actions.map((a) => a.key), ["credit", "cancel"]);
  assert.equal(result.prompt.key, "hintCreditNoteReady");
});

test("a partly credited invoice still pays, and says so", () => {
  const result = availableActions(invoice({ open_credit_amount: "200.00" }));
  assert.deepEqual(result.actions.map((a) => a.key), ["pay", "cancel"]);
  assert.equal(result.prompt.key, "hintNetted", "the reduction is stated before the click");
});

test("an invoice its credits cover offers settlement, not payment", () => {
  const result = availableActions(invoice({ open_credit_amount: "1428.00" }));
  assert.deepEqual(result.actions.map((a) => a.key), ["settle", "cancel"]);
  assert.equal(result.prompt.key, "hintFullyCredited");
});

test("credits larger than the invoice still settle it", () => {
  assert.deepEqual(keys(invoice({ open_credit_amount: "5000.00" })), ["settle", "cancel"]);
});

test("a zero invoice is not settled by a zero credit", () => {
  // 0 >= 0 is true, and settling nothing against nothing would be a button
  // that cannot work. Such an invoice never reaches here anyway.
  assert.deepEqual(keys(invoice({ gross_amount: "0.00", open_credit_amount: "0" })), ["pay", "cancel"]);
});

test("the later money states offer their own actions", () => {
  assert.deepEqual(keys(invoice({ state: "PAYMENT_PENDING" })), ["confirm", "fail"]);
  assert.deepEqual(keys(invoice({ state: "RECONCILIATION_EXCEPTION" })), ["resolve"]);
  assert.deepEqual(keys(invoice({ state: "INFO_REQUESTED" })), ["info-received", "reject"]);
});

test("a finished invoice offers nothing", () => {
  for (const state of ["RECONCILED", "CREDITED", "SETTLED_BY_CREDIT", "CANCELLED", "REJECTED", "DUPLICATE", "PAID"]) {
    assert.deepEqual(keys(invoice({ state })), [], state);
  }
});

test("every action names the permission it needs", () => {
  // A missing `needs` would show the button to everyone and fail on click.
  for (const state of ["REVIEW_REQUIRED", "APPROVED", "ACCOUNTING_READY", "PAYMENT_PENDING", "RECONCILIATION_EXCEPTION", "INFO_REQUESTED"]) {
    for (const action of availableActions(invoice({ state })).actions) {
      assert.ok(action.needs, `${state}/${action.key} has no permission`);
    }
  }
});

test("an action that changes the record asks for a reason", () => {
  const needsComment = (inv, key) => availableActions(inv).actions.find((a) => a.key === key).needsComment;
  assert.equal(needsComment(invoice({ state: "REVIEW_REQUIRED" }), "reject"), true);
  assert.equal(needsComment(invoice({ state: "REVIEW_REQUIRED" }), "request-info"), true);
  assert.equal(needsComment(invoice({ state: "RECONCILIATION_EXCEPTION" }), "resolve"), true);
  assert.notEqual(needsComment(invoice(), "pay"), true, "paying what was approved needs no essay");
});

// ------------------------------------------------- the progress spine -----

test("an invoice walks the payment path", () => {
  assert.equal(pathFor("PAID", "INVOICE").includes("RECONCILED"), true);
  assert.equal(pathFor("PAID", "INVOICE").includes("CREDITED"), false);
});

test("a credit note is never shown a payment it will not receive", () => {
  const path = pathFor("CREDITED", "CREDIT_NOTE");
  assert.deepEqual(path.filter((s) => ["PAYMENT_PENDING", "PAID", "RECONCILED"].includes(s)), []);
  assert.equal(path.at(-1), "CREDITED");
});

test("an invoice settled by credit ends there, whatever its type says", () => {
  const path = pathFor("SETTLED_BY_CREDIT", "INVOICE");
  assert.equal(path.at(-1), "SETTLED_BY_CREDIT");
  assert.deepEqual(path.filter((s) => ["PAYMENT_PENDING", "PAID"].includes(s)), []);
});

test("every path starts at intake and reaches the state it is drawn for", () => {
  for (const [state, type] of [["PAID", "INVOICE"], ["CREDITED", "CREDIT_NOTE"], ["SETTLED_BY_CREDIT", "INVOICE"]]) {
    const path = pathFor(state, type);
    assert.equal(path[0], "RECEIVED", `${state} starts at intake`);
    assert.ok(path.includes(state), `${state} appears on its own path`);
  }
});

test("an approved or booked invoice can be stopped, by finance, with a reason", () => {
  // Fraud found after the signature needs a way out before the payment (ADR-054).
  for (const state of ["APPROVED", "ACCOUNTING_READY"]) {
    const stop = availableActions(invoice({ state })).actions.find((a) => a.key === "cancel");
    assert.ok(stop, state);
    assert.equal(stop.needs, "invoice:cancel");
    assert.equal(stop.needsComment, true);
    assert.equal(stop.tone, "high");
  }
});

test("a payment on its way offers no cancel", () => {
  assert.ok(!keys(invoice({ state: "PAYMENT_PENDING" })).includes("cancel"));
});

test("a payment on its way can be reported as failed, with a reason", () => {
  // ADR-055: the bank rejected it, returned it, or confirmed a recall.
  const fail = availableActions(invoice({ state: "PAYMENT_PENDING" })).actions.find((a) => a.key === "fail");
  assert.equal(fail.needs, "payment:confirm");
  assert.equal(fail.needsComment, true);
});

test("a failed payment is instructed again or stopped", () => {
  const result = availableActions(invoice({ state: "PAYMENT_FAILED" }));
  assert.deepEqual(result.actions.map((a) => a.key), ["retry", "cancel"]);
  assert.equal(result.prompt.key, "hintPaymentFailed");
});

test("each context fills at most one button, never a destructive one, and offers the same actions as before", () => {
  const every = ["REVIEW_REQUIRED", "INFO_REQUESTED", "APPROVED", "ACCOUNTING_READY", "PAYMENT_PENDING", "PAYMENT_FAILED", "RECONCILIATION_EXCEPTION"];
  for (const state of every) {
    const offered = availableActions(invoice({ state })).actions;
    const key = primaryAction(invoice({ state }), offered);
    assert.ok(key === null || offered.some((a) => a.key === key), state);
    assert.notEqual(offered.find((a) => a.key === key)?.tone, "high", `${state}: the filled button is never the destructive one`);
  }
});

test("the filled button is the step that moves the invoice on, or the one a stopped review expects", () => {
  const primary = (over) => { const inv = invoice(over); return primaryAction(inv, availableActions(inv).actions); };
  assert.equal(primary({ state: "REVIEW_REQUIRED" }), "accept");
  const stuck = { state: "REVIEW_REQUIRED", payable_blockers: ["supplier_iban_match"] };
  assert.equal(primary({ ...stuck, review_reason: "SUPPLIER_IBAN_MATCH" }), "request-info");
  assert.equal(primary({ ...stuck, review_reason: "DUPLICATE_INVOICE_NUMBER" }), "confirm-duplicate");
  assert.equal(primary({ state: "ACCOUNTING_READY" }), "pay");
  assert.equal(primary({ state: "PAYMENT_PENDING" }), "confirm");
});

test("a primary the viewer may not use is simply not filled", () => {
  const inv = invoice({ state: "REVIEW_REQUIRED", payable_blockers: ["x"], review_reason: "SUPPLIER_IBAN_MATCH" });
  const withoutRequest = availableActions(inv).actions.filter((a) => a.key !== "request-info");
  assert.equal(primaryAction(inv, withoutRequest), null);
});
