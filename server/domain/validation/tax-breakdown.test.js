/**
 * Whether the document's tax breakdown can be booked: one line per rate, each
 * rate with a tax key, each line's tax following from its base, and the lines
 * adding up to the totals the document declares (ADR-053).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTaxBreakdown } from "./tax-breakdown.js";
import { loadPolicy } from "../../config/policy.js";

const policy = loadPolicy({});
const sub = (category, percent, taxable, amount) => ({ category, percent, taxable, amount });
const doc = (taxExclusive, taxAmount, ...taxSubtotals) => ({ totals: { taxExclusive, taxAmount }, taxSubtotals });
const status = (parsed) => checkTaxBreakdown(parsed, policy).status;

test("a single standard rate that adds up is bookable", () => {
  assert.equal(status(doc("1042.02", "197.98", sub("S", "19", "1042.02", "197.98"))), "PASSED");
});

test("two rates that add up are bookable", () => {
  assert.equal(status(doc("300.00", "45.00", sub("S", "19", "200.00", "38.00"), sub("S", "7", "100.00", "7.00"))), "PASSED");
});

test("a rate written with decimals is the same rate", () => {
  assert.equal(status(doc("100.00", "19.00", sub("S", "19.00", "100.00", "19.00"))), "PASSED");
});

test("a document without a breakdown cannot be booked", () => {
  const result = checkTaxBreakdown(doc("100.00", "19.00"), policy);
  assert.equal(result.status, "FAILED");
  assert.equal(result.severity, "HIGH");
});

test("a rate with no tax key cannot be booked", () => {
  const result = checkTaxBreakdown(doc("100.00", "16.00", sub("S", "16", "100.00", "16.00")), policy);
  assert.equal(result.status, "FAILED");
  assert.match(result.actual, /S 16/);
});

test("reverse charge is not quietly booked as tax-free", () => {
  assert.equal(status(doc("100.00", "0.00", sub("AE", "0", "100.00", "0.00"))), "FAILED");
});

test("a line's tax must follow from its base and rate", () => {
  assert.equal(status(doc("100.00", "20.00", sub("S", "19", "100.00", "20.00"))), "FAILED");
});

test("the lines must add up to the declared net", () => {
  assert.equal(status(doc("300.00", "45.00", sub("S", "19", "200.00", "38.00"), sub("S", "7", "90.00", "6.30"))), "FAILED");
});

test("the lines must add up to the declared tax", () => {
  assert.equal(status(doc("300.00", "46.00", sub("S", "19", "200.00", "38.00"), sub("S", "7", "100.00", "7.00"))), "FAILED");
});

test("an unreadable amount in the breakdown cannot be booked", () => {
  assert.equal(status(doc("100.00", "19.00", sub("S", "19", "hundert", "19.00"))), "FAILED");
});
