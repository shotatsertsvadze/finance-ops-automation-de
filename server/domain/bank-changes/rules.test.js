/**
 * The pure rules of the bank-account change loop (ADR-077): who may take which
 * step, which moves exist, and what an approval is bound to.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHANGE_STATES, CHANGE_TRANSITIONS, canMoveChange, proposalHash, separationRefusal } from "./rules.js";
import { loadPolicy } from "../../config/policy.js";

const PROPOSER = "u-proposer";
const VERIFIER = "u-verifier";
const OTHER = "u-other";
const change = (overrides = {}) => ({ proposed_by: PROPOSER, verified_by: VERIFIER, required_distinct_actors: 3, ...overrides });

test("the proposer cannot verify their own proposal", () => {
  assert.equal(separationRefusal(change({ verified_by: null }), PROPOSER, "verify"), "PROPOSER_CANNOT_VERIFY");
  assert.equal(separationRefusal(change({ verified_by: null }), OTHER, "verify"), null);
});

test("the proposer cannot approve or reject their own proposal", () => {
  assert.equal(separationRefusal(change(), PROPOSER, "approve"), "PROPOSER_CANNOT_DECIDE");
  assert.equal(separationRefusal(change(), PROPOSER, "reject"), "PROPOSER_CANNOT_DECIDE");
});

test("under the three-person policy the verifier cannot approve", () => {
  assert.equal(separationRefusal(change(), VERIFIER, "approve"), "VERIFIER_CANNOT_APPROVE");
  assert.equal(separationRefusal(change(), OTHER, "approve"), null);
});

test("the verifier may still reject: stopping a change needs no third person", () => {
  assert.equal(separationRefusal(change(), VERIFIER, "reject"), null);
});

test("a two-person policy value on a row lets the verifier approve, the proposer still not", () => {
  // Not enabled anywhere (the policy refuses it); this is the rule the row
  // would be judged by, so enabling it later changes configuration, not code.
  assert.equal(separationRefusal(change({ required_distinct_actors: 2 }), VERIFIER, "approve"), null);
  assert.equal(separationRefusal(change({ required_distinct_actors: 2 }), PROPOSER, "approve"), "PROPOSER_CANNOT_DECIDE");
});

test("only the proposer may cancel", () => {
  assert.equal(separationRefusal(change(), PROPOSER, "cancel"), null);
  assert.equal(separationRefusal(change(), OTHER, "cancel"), "ONLY_PROPOSER_CAN_CANCEL");
});

test("the transition table: open states move on, decided states never move", () => {
  assert.deepEqual(CHANGE_STATES, ["PROPOSED", "VERIFIED", "APPROVED", "REJECTED", "CANCELLED"]);
  assert.equal(canMoveChange("PROPOSED", "VERIFIED"), true);
  assert.equal(canMoveChange("PROPOSED", "APPROVED"), false, "no approval without verification");
  assert.equal(canMoveChange("VERIFIED", "APPROVED"), true);
  assert.equal(canMoveChange("VERIFIED", "PROPOSED"), false);
  for (const done of ["APPROVED", "REJECTED", "CANCELLED"]) assert.deepEqual(CHANGE_TRANSITIONS[done], [], done);
});

const proposal = {
  supplierId: "s1",
  iban: "DE75512108001245126199",
  bic: null,
  trustedIbans: ["DE89370400440532013000"],
  sourceInvoiceId: null,
  requiredDistinctActors: 3,
};

test("the proposal hash is stable and does not depend on the order master data returned", () => {
  const a = proposalHash({ ...proposal, trustedIbans: ["B", "A"] });
  const b = proposalHash({ ...proposal, trustedIbans: ["A", "B"] });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("every bound field changes the hash", () => {
  const base = proposalHash(proposal);
  for (const [field, value] of Object.entries({
    supplierId: "s2",
    iban: "DE02300209000106531065",
    bic: "COBADEFFXXX",
    trustedIbans: [],
    sourceInvoiceId: "i1",
    requiredDistinctActors: 2,
  })) {
    assert.notEqual(proposalHash({ ...proposal, [field]: value }), base, field);
  }
});

test("the policy requires three distinct people by default", () => {
  assert.equal(loadPolicy({}).bankChangeDistinctActors, 3);
  assert.equal(loadPolicy({ POLICY_BANK_CHANGE_DISTINCT_ACTORS: "3" }).bankChangeDistinctActors, 3);
});

test("any other number of people stops the process: two-person mode is not enabled", () => {
  for (const value of ["2", "1", "4", "drei"]) {
    assert.throws(() => loadPolicy({ POLICY_BANK_CHANGE_DISTINCT_ACTORS: value }), /POLICY_BANK_CHANGE_DISTINCT_ACTORS/, value);
  }
});
