import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "./decide.js";
import { loadPolicy, requiredApprovalSteps } from "../../config/policy.js";
import { failed, passed, warning, SEVERITY } from "../checks.js";

const policy = loadPolicy({});
const ok = [passed("supplier_known", SEVERITY.HIGH, { reason: "ok" })];

test("thresholds: 380 auto, 1240 manager, 8000 manager+finance, 30000 three steps", () => {
  assert.deepEqual(requiredApprovalSteps(policy, 38000), []);
  assert.deepEqual(
    requiredApprovalSteps(policy, 124000).map((s) => s.required_role),
    ["MANAGER"],
  );
  assert.deepEqual(
    requiredApprovalSteps(policy, 800000).map((s) => s.required_role),
    ["MANAGER", "FINANCE"],
  );
  assert.deepEqual(
    requiredApprovalSteps(policy, 3000000).map((s) => s.required_role),
    ["MANAGER", "FINANCE", "CFO"],
  );
});

test("boundary values sit on the lower tier", () => {
  assert.deepEqual(requiredApprovalSteps(policy, 50000), []);
  assert.deepEqual(
    requiredApprovalSteps(policy, 500000).map((s) => s.required_role),
    ["MANAGER"],
  );
  assert.deepEqual(
    requiredApprovalSteps(policy, 2500000).map((s) => s.required_role),
    ["MANAGER", "FINANCE"],
  );
});

test("clean and small goes straight through", () => {
  const d = decide({ technicalChecks: ok, businessChecks: ok, grossCents: 38000, policy });
  assert.equal(d.decision, "AUTO_APPROVE");
  assert.equal(d.targetState, "APPROVED");
});

test("technical failure wins over everything", () => {
  const d = decide({
    technicalChecks: [failed("xml_well_formed", SEVERITY.HIGH, { reason: "kaputt" })],
    businessChecks: ok,
    grossCents: 100,
    policy,
  });
  assert.equal(d.targetState, "REVIEW_REQUIRED");
  assert.equal(d.reviewReason, "TECHNICAL_VALIDATION_FAILED");
});

test("HIGH business failure routes to review with that check as reason", () => {
  const d = decide({
    technicalChecks: ok,
    businessChecks: [failed("supplier_iban_match", SEVERITY.HIGH, { reason: "IBAN weicht ab" })],
    grossCents: 100,
    policy,
  });
  assert.equal(d.targetState, "REVIEW_REQUIRED");
  assert.equal(d.reviewReason, "SUPPLIER_IBAN_MATCH");
  assert.equal(d.requiredSteps.length, 0);
});

test("MEDIUM business failure also routes to review (fail closed)", () => {
  const d = decide({
    technicalChecks: ok,
    businessChecks: [failed("currency_expected", SEVERITY.MEDIUM, { reason: "USD" })],
    grossCents: 100,
    policy,
  });
  assert.equal(d.targetState, "REVIEW_REQUIRED");
  assert.equal(d.reviewReason, "CURRENCY_EXPECTED");
});

test("LOW warnings do not block approval", () => {
  const d = decide({
    technicalChecks: ok,
    businessChecks: [warning("payment_terms_match", { reason: "abweichend" })],
    grossCents: 124000,
    policy,
  });
  assert.equal(d.targetState, "READY_FOR_APPROVAL");
  assert.deepEqual(
    d.requiredSteps.map((s) => s.required_role),
    ["MANAGER"],
  );
});

test("unknown amount never auto-approves", () => {
  const d = decide({ technicalChecks: ok, businessChecks: ok, grossCents: null, policy });
  assert.equal(d.targetState, "REVIEW_REQUIRED");
  assert.equal(d.reviewReason, "AMOUNT_UNKNOWN");
});

/**
 * Allowances make a zero payable amount reachable: a discount covering the
 * line total, or a prepayment covering the gross. Zero is a known amount, so
 * it passed the unknown-amount guard and could auto-approve — a payment run
 * for nothing, approved by nobody.
 */
test("there is nothing to pay, so nobody approves it", () => {
  const d = decide({ technicalChecks: ok, businessChecks: ok, grossCents: 0, policy });
  assert.equal(d.targetState, "REVIEW_REQUIRED");
  assert.equal(d.reviewReason, "NOTHING_TO_PAY");
});

test("a negative payable amount is not an unknown one", () => {
  const d = decide({ technicalChecks: ok, businessChecks: ok, grossCents: -100, policy });
  assert.equal(d.targetState, "REVIEW_REQUIRED");
  assert.equal(d.reviewReason, "NOTHING_TO_PAY", "a credit is a document to look at, not an unreadable one");
});

test("policy overrides from env change the tiers", () => {
  const strict = loadPolicy({ POLICY_AUTO_APPROVE_LIMIT: "0", POLICY_TIER_1_LIMIT: "1000" });
  assert.deepEqual(
    requiredApprovalSteps(strict, 38000).map((s) => s.required_role),
    ["MANAGER"],
  );
  assert.deepEqual(
    requiredApprovalSteps(strict, 124000).map((s) => s.required_role),
    ["MANAGER", "FINANCE"],
  );
});
