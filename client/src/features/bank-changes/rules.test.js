/**
 * What the bank-account screens offer a person (ADR-077). The server refuses
 * every step taken by the wrong person; these rules keep the screen from
 * offering a button that can only fail (ADR-071).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { changeActions, changeSteps, invoiceBankEntry } from "./rules.js";

const PROPOSER = { id: "p" };
const VERIFIER = { id: "v" };
const THIRD = { id: "t" };
const roles = {
  clerk: ["bank-change:read", "bank-change:propose", "invoice:reprocess"],
  finance: ["bank-change:read", "bank-change:propose", "bank-change:verify", "bank-change:approve", "invoice:reprocess"],
  cfo: ["bank-change:read", "bank-change:verify", "bank-change:approve"],
  admin: ["bank-change:read", "invoice:reprocess"],
};
const may = (role) => (permission) => roles[role].includes(permission);
const change = (over = {}) => ({
  state: "PROPOSED",
  proposed_by: PROPOSER.id,
  verified_by: null,
  required_distinct_actors: 3,
  pending_invoices: [],
  ...over,
});

test("a proposal is verified by someone else, and withdrawn only by its proposer", () => {
  assert.deepEqual(changeActions(change(), VERIFIER, may("finance")), ["verify", "reject"]);
  assert.deepEqual(changeActions(change(), PROPOSER, may("finance")), ["cancel"]);
  assert.deepEqual(changeActions(change(), THIRD, may("clerk")), []);
});

test("a verified change is approved by a third person, never the verifier", () => {
  const verified = change({ state: "VERIFIED", verified_by: VERIFIER.id });
  assert.deepEqual(changeActions(verified, THIRD, may("cfo")), ["approve", "reject"]);
  assert.deepEqual(changeActions(verified, VERIFIER, may("finance")), ["reject"]);
  assert.deepEqual(changeActions(verified, PROPOSER, may("clerk")), ["cancel"]);
});

test("administration is offered no step", () => {
  assert.deepEqual(changeActions(change(), THIRD, may("admin")), []);
  assert.deepEqual(changeActions(change({ state: "VERIFIED", verified_by: VERIFIER.id }), THIRD, may("admin")), []);
});

test("an approved change offers a retry only while invoices are left", () => {
  const approved = change({ state: "APPROVED", verified_by: VERIFIER.id });
  assert.deepEqual(changeActions(approved, THIRD, may("clerk")), []);
  const left = { ...approved, pending_invoices: [{ invoice_id: "i", state: "REVIEW_REQUIRED" }] };
  assert.deepEqual(changeActions(left, THIRD, may("clerk")), ["revalidate"]);
  assert.deepEqual(changeActions(left, THIRD, may("cfo")), []);
  // A technical re-run through invoice:reprocess, which administration holds:
  // it decides nothing about the account (ADR-077).
  assert.deepEqual(changeActions(left, THIRD, may("admin")), ["revalidate"]);
});

test("a decided change offers nothing", () => {
  for (const state of ["REJECTED", "CANCELLED"]) assert.deepEqual(changeActions(change({ state }), THIRD, may("finance")), [], state);
});

const stoppedInvoice = (over = {}) => ({
  state: "REVIEW_REQUIRED",
  supplier_id: "s1",
  bank_changes: [],
  validation: { technical: [], business: [{ check_code: "supplier_iban_match", status: "FAILED" }] },
  ...over,
});

test("an invoice stopped by its IBAN offers a proposal to whoever may propose", () => {
  assert.deepEqual(invoiceBankEntry(stoppedInvoice(), may("clerk")), { show: true, canPropose: true });
  assert.deepEqual(invoiceBankEntry(stoppedInvoice({ state: "INFO_REQUESTED" }), may("clerk")), { show: true, canPropose: true });
  assert.deepEqual(invoiceBankEntry(stoppedInvoice(), may("cfo")), { show: true, canPropose: false });
});

test("once a change for the IBAN is open or approved, the invoice links to it instead", () => {
  for (const state of ["PROPOSED", "VERIFIED", "APPROVED"]) {
    const inv = stoppedInvoice({ bank_changes: [{ id: "c", change_no: "BAC-000001", state }] });
    assert.deepEqual(invoiceBankEntry(inv, may("clerk")), { show: true, canPropose: false }, state);
  }
  const rejected = stoppedInvoice({ bank_changes: [{ id: "c", change_no: "BAC-000001", state: "REJECTED" }] });
  assert.equal(invoiceBankEntry(rejected, may("clerk")).canPropose, true, "a rejected change can be proposed again");
});

test("nothing is shown for an invoice whose IBAN matched, or whose supplier is unknown", () => {
  const passed = stoppedInvoice({ validation: { technical: [], business: [{ check_code: "supplier_iban_match", status: "PASSED" }] } });
  assert.equal(invoiceBankEntry(passed, may("clerk")).show, false);
  assert.equal(invoiceBankEntry(stoppedInvoice({ supplier_id: null }), may("clerk")).show, false);
});

test("a decided invoice is not proposed from", () => {
  assert.equal(invoiceBankEntry(stoppedInvoice({ state: "REJECTED" }), may("clerk")).canPropose, false);
});

const at = (s) => `2026-09-30T${s}:00Z`;
const tones = (c) => changeSteps(c).map((s) => [s.key, s.tone]);

test("a new proposal: proposed by one person, the call-back is next, the approval after it", () => {
  const steps = changeSteps({ state: "PROPOSED", proposed_by_name: "Anna", proposed_at: at("09:00") });
  assert.deepEqual(
    steps.map((s) => [s.key, s.tone, s.actor]),
    [
      ["proposal", "done", "Anna"],
      ["callback", "attention", null],
      ["approval", "neutral", null],
    ],
  );
  assert.equal(steps[0].at, at("09:00"));
});

test("verified: two steps done by their own people, the approval is next", () => {
  const steps = changeSteps({
    state: "VERIFIED",
    proposed_by_name: "Anna",
    proposed_at: at("09:00"),
    verified_by_name: "Mira",
    verified_at: at("10:00"),
    verification: { outcome: "CONFIRMED" },
  });
  assert.deepEqual(
    steps.map((s) => [s.key, s.tone, s.actor]),
    [
      ["proposal", "done", "Anna"],
      ["callback", "done", "Mira"],
      ["approval", "attention", null],
    ],
  );
});

test("approved, rejected, denied or withdrawn each show where it ended", () => {
  const base = {
    proposed_by_name: "Anna",
    proposed_at: at("09:00"),
    verified_by_name: "Mira",
    verified_at: at("10:00"),
    verification: { outcome: "CONFIRMED" },
  };
  assert.deepEqual(tones({ ...base, state: "APPROVED", decided_by_name: "Sabine", decided_at: at("11:00") }), [
    ["proposal", "done"],
    ["callback", "done"],
    ["approval", "done"],
  ]);
  assert.deepEqual(tones({ ...base, state: "REJECTED", decided_by_name: "Sabine", decided_at: at("11:00") }), [
    ["proposal", "done"],
    ["callback", "done"],
    ["approval", "failed"],
  ]);
  assert.deepEqual(tones({ ...base, state: "REJECTED", verification: { outcome: "DENIED" }, decided_by_name: null }), [
    ["proposal", "done"],
    ["callback", "failed"],
    ["approval", "neutral"],
  ]);
  assert.deepEqual(
    tones({ state: "CANCELLED", proposed_by_name: "Anna", proposed_at: at("09:00"), decided_by_name: "Anna", decided_at: at("09:30") }),
    [
      ["proposal", "done"],
      ["callback", "neutral"],
      ["approval", "neutral"],
    ],
  );
});
