import { test } from "node:test";
import assert from "node:assert/strict";
import { PAYABLE_STATES, STATES, TERMINAL_STATES, TRANSITIONS, canTransition } from "./states.js";

test("terminal states have no outgoing transitions", () => {
  assert.deepEqual(TERMINAL_STATES.sort(), ["CREDITED", "DUPLICATE", "RECONCILED", "REJECTED", "SETTLED_BY_CREDIT"]);
  for (const s of TERMINAL_STATES) assert.deepEqual(TRANSITIONS[s], []);
});

test("every transition target is a known state", () => {
  for (const [from, targets] of Object.entries(TRANSITIONS)) for (const to of targets) assert.ok(STATES.includes(to), `${from} -> ${to}`);
});

test("every non-initial state is reachable", () => {
  const reachable = new Set(Object.values(TRANSITIONS).flat());
  for (const s of STATES.filter((s) => s !== "RECEIVED")) assert.ok(reachable.has(s), s);
});

test("nothing leaves a payable state except forward in the money path or reconciliation", () => {
  // CREDITED is on the list because a credit note shares the states up to the
  // accounting handoff and then leaves the money path instead of being paid.
  const allowed = new Set(["ACCOUNTING_READY", "PAYMENT_PENDING", "PAID", "RECONCILED", "RECONCILIATION_EXCEPTION", "CREDITED", "SETTLED_BY_CREDIT"]);
  for (const s of PAYABLE_STATES) for (const to of TRANSITIONS[s]) assert.ok(allowed.has(to), `${s} -> ${to}`);
});

test("review never leads directly to APPROVED", () => {
  assert.equal(canTransition("REVIEW_REQUIRED", "APPROVED"), false);
  assert.equal(canTransition("INFO_REQUESTED", "APPROVED"), false);
});

test("rejected and duplicate cannot come back", () => {
  for (const to of STATES) {
    assert.equal(canTransition("REJECTED", to), false);
    assert.equal(canTransition("DUPLICATE", to), false);
  }
});

test("a booked credit note is finished, and was never paid", () => {
  // A credit note says the supplier owes us. Paying it would send the money
  // twice in the same direction, so the payable path is not open to it.
  assert.equal(canTransition("ACCOUNTING_READY", "CREDITED"), true);
  assert.deepEqual(TRANSITIONS.CREDITED, []);
  for (const from of ["PAYMENT_PENDING", "PAID", "RECONCILED"]) {
    assert.equal(canTransition(from, "CREDITED"), false, `${from} -> CREDITED`);
  }
  assert.equal(canTransition("CREDITED", "PAYMENT_PENDING"), false);
});

test("an invoice covered by credits ends without a payment", () => {
  assert.equal(canTransition("ACCOUNTING_READY", "SETTLED_BY_CREDIT"), true);
  assert.deepEqual(TRANSITIONS.SETTLED_BY_CREDIT, []);
  // It must not be reachable from a state where money has already moved.
  for (const from of ["PAYMENT_PENDING", "PAID", "RECONCILED"]) {
    assert.equal(canTransition(from, "SETTLED_BY_CREDIT"), false, from);
  }
});
