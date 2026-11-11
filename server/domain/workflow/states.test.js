import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AWAITING_RECONCILIATION_STATES,
  DISCARDED_STATES,
  HOLDS_CAPACITY_STATES,
  OUTSTANDING_STATES,
  PAYABLE_STATES,
  PHASE,
  PHASES,
  STATES,
  TERMINAL_STATES,
  TRANSITIONS,
  canTransition,
} from "./states.js";

// Every list of states is derived from one phase per state, so a state added
// to the machine without a phase fails here instead of silently falling out of
// a KPI, a capacity claim or the duplicate guard (ADR-051).
test("every state has exactly one known phase", () => {
  assert.deepEqual(Object.keys(PHASE).sort(), [...STATES].sort());
  for (const s of STATES) assert.ok(PHASES.includes(PHASE[s]), `${s}: ${PHASE[s]}`);
});

test("a terminal state is settled or discarded", () => {
  for (const s of TERMINAL_STATES) assert.ok(["SETTLED", "DISCARDED"].includes(PHASE[s]), s);
});

test("once committed, an invoice moves forward or is cancelled, never back to review", () => {
  // Cancelling is the one way out that is not forward: fraud found after the
  // signature must have somewhere to go that is not the payment (ADR-054).
  const order = ["COMMITTED", "SETTLED"];
  for (const s of STATES.filter((s) => order.includes(PHASE[s]))) {
    for (const to of TRANSITIONS[s]) {
      if (to === "CANCELLED") continue;
      assert.ok(order.indexOf(PHASE[to]) >= order.indexOf(PHASE[s]), `${s} -> ${to}`);
    }
  }
});

test("an approved or booked invoice can be stopped; a payment already sent cannot", () => {
  assert.equal(canTransition("APPROVED", "CANCELLED"), true);
  assert.equal(canTransition("ACCOUNTING_READY", "CANCELLED"), true);
  for (const from of ["READY_FOR_APPROVAL", "PAYMENT_PENDING", "PAID", "RECONCILED"]) {
    assert.equal(canTransition(from, "CANCELLED"), false, from);
  }
  assert.equal(PHASE.CANCELLED, "DISCARDED", "no longer owed, holds no capacity");
});

test("the derived lists name the states their users need", () => {
  for (const s of ["RECONCILIATION_EXCEPTION", "SETTLED_BY_CREDIT", "CREDITED"]) {
    assert.ok(PAYABLE_STATES.includes(s), `payable: ${s}`);
    assert.ok(HOLDS_CAPACITY_STATES.includes(s), `capacity: ${s}`);
    assert.ok(!OUTSTANDING_STATES.includes(s), `outstanding: ${s}`);
  }
  assert.ok(HOLDS_CAPACITY_STATES.includes("READY_FOR_APPROVAL"));
  assert.ok(!PAYABLE_STATES.includes("READY_FOR_APPROVAL"));
  assert.ok(OUTSTANDING_STATES.includes("PAYMENT_PENDING"));
  assert.deepEqual([...DISCARDED_STATES].sort(), ["CANCELLED", "DUPLICATE", "REJECTED"]);
  assert.deepEqual([...AWAITING_RECONCILIATION_STATES].sort(), ["PAID", "RECONCILIATION_EXCEPTION"]);
});

test("terminal states have no outgoing transitions", () => {
  assert.deepEqual(TERMINAL_STATES.sort(), ["CANCELLED", "CREDITED", "DUPLICATE", "RECONCILED", "REJECTED", "SETTLED_BY_CREDIT"]);
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
  const allowed = new Set([
    "ACCOUNTING_READY",
    "PAYMENT_PENDING",
    "PAID",
    "RECONCILED",
    "RECONCILIATION_EXCEPTION",
    "CREDITED",
    "SETTLED_BY_CREDIT",
    "CANCELLED",
    "PAYMENT_FAILED",
  ]);
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

test("a payment the bank did not carry out fails, then is retried or stopped", () => {
  // ADR-055. A recall is a failure the bank confirms, so a payment on its way
  // is stopped by failing first, never cancelled directly.
  assert.deepEqual([...TRANSITIONS.PAYMENT_PENDING].sort(), ["PAID", "PAYMENT_FAILED"]);
  assert.deepEqual([...TRANSITIONS.PAYMENT_FAILED].sort(), ["ACCOUNTING_READY", "CANCELLED"]);
  assert.equal(PHASE.PAYMENT_FAILED, "COMMITTED", "still owed, still holding its order");
  assert.ok(PAYABLE_STATES.includes("PAYMENT_FAILED"));
  assert.ok(OUTSTANDING_STATES.includes("PAYMENT_FAILED"));
});
