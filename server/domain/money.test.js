/**
 * A line's net amount is quantity times unit price, and neither is limited to
 * two decimals: UBL allows a price like 12.3456 and a quantity like 0.375.
 * The tolerance for the check that uses this is one cent, so an arithmetic
 * error of one cent refuses a correct invoice. Floating point gets the wrong
 * answer often enough at the half-cent boundary to make that a real risk, so
 * the product is computed exactly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { productToCents } from "./money.js";

test("an ordinary line is quantity times price", () => {
  assert.equal(productToCents("3", "10.00"), 3000);
  assert.equal(productToCents("1", "1240.00"), 124000);
  assert.equal(productToCents("2.5", "19.90"), 4975);
});

test("a price with four decimals keeps its precision until the last step", () => {
  assert.equal(productToCents("7", "12.3456"), 8642); // 86.4192 -> 86.42
  assert.equal(productToCents("100", "0.0125"), 125);
});

test("half a cent rounds away from zero, and does so exactly", () => {
  // 0.005 has no exact binary representation; these are the cases where
  // Number arithmetic drifts.
  assert.equal(productToCents("3", "8.615"), 2585); // 25.845
  assert.equal(productToCents("1", "0.005"), 1);
  assert.equal(productToCents("-1", "0.005"), -1);
  assert.equal(productToCents("1", "0.004"), 0);
});

test("a base quantity divides the price", () => {
  // Price stated per 1000 pieces, 250 pieces invoiced.
  assert.equal(productToCents("250", "45.00", "1000"), 1125);
  assert.equal(productToCents("3", "10.00", "1"), 3000);
});

test("an amount that is not a decimal number is not a number", () => {
  for (const bad of ["zweihundert", "", null, undefined, "1,5", "1e3", "--1"]) {
    assert.equal(productToCents("1", bad), null, `${bad} is not a price`);
    assert.equal(productToCents(bad, "1.00"), null, `${bad} is not a quantity`);
  }
});

test("a base quantity of zero has no answer, rather than an infinite one", () => {
  assert.equal(productToCents("3", "10.00", "0"), null);
});

test("a large line does not lose precision to the limits of a double", () => {
  // 999999999 x 9999.9999 = 9999999890000.0001, which is past
  // Number.MAX_SAFE_INTEGER once scaled to cents.
  assert.equal(productToCents("999999999", "9999.9999"), 999999989000000);
});
