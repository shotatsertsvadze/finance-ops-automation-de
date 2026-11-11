/**
 * One meaning per colour: amber asks for attention or waits for someone, red
 * is blocked or failed, green is done, blue is under way, grey is inactive.
 * Every state the screens show has exactly one of them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { STATES } from "../../../server/domain/workflow/states.js";
import { CHANGE_STATES } from "../../../server/domain/bank-changes/rules.js";
import { CHANGE_TONE, STATE_TONE, STEP_TONE, TONES, TX_TONE } from "./tones.js";

test("every invoice and bank-account change state has one of the five tones", () => {
  assert.deepEqual(
    STATES.filter((s) => !TONES.includes(STATE_TONE[s])),
    [],
  );
  assert.deepEqual(
    CHANGE_STATES.filter((s) => !TONES.includes(CHANGE_TONE[s])),
    [],
  );
});

test("waiting for a person is amber, never red", () => {
  for (const state of ["REVIEW_REQUIRED", "INFO_REQUESTED", "READY_FOR_APPROVAL", "RECONCILIATION_EXCEPTION"]) {
    assert.equal(STATE_TONE[state], "attention", state);
  }
  assert.deepEqual(
    [CHANGE_TONE.PROPOSED, CHANGE_TONE.VERIFIED, STEP_TONE.PENDING, TX_TONE.EXCEPTION],
    ["attention", "attention", "attention", "attention"],
  );
});

test("red is kept for what failed or was refused", () => {
  assert.deepEqual(
    TONES.filter((t) => t === "failed"),
    ["failed"],
  );
  for (const state of ["REJECTED", "PAYMENT_FAILED"]) assert.equal(STATE_TONE[state], "failed", state);
  assert.deepEqual([CHANGE_TONE.REJECTED, STEP_TONE.REJECTED], ["failed", "failed"]);
  const red = Object.entries(STATE_TONE)
    .filter(([, tone]) => tone === "failed")
    .map(([s]) => s)
    .sort();
  assert.deepEqual(red, ["PAYMENT_FAILED", "REJECTED"]);
});

test("done is green, under way is blue, set aside is grey", () => {
  for (const state of ["APPROVED", "PAID", "RECONCILED", "CREDITED", "SETTLED_BY_CREDIT"]) assert.equal(STATE_TONE[state], "done", state);
  for (const state of ["RECEIVED", "VALIDATING", "ACCOUNTING_READY", "PAYMENT_PENDING"]) assert.equal(STATE_TONE[state], "active", state);
  for (const state of ["DUPLICATE", "CANCELLED"]) assert.equal(STATE_TONE[state], "neutral", state);
});
