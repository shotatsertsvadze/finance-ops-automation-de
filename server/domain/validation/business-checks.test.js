import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runTechnicalValidation } from "../invoice/technical-validation.js";
import { runBusinessChecks } from "./business-checks.js";
import { loadPolicy } from "../../config/policy.js";

const policy = loadPolicy({});
const parse = (name) => runTechnicalValidation(readFileSync(new URL(`../../../fixtures/xrechnung/${name}`, import.meta.url))).parsed;
const check = (r, code) => r.checks.find((c) => c.check === code);

const S1 = { id: "s1", supplier_no: "S-1001", legal_name: "Berliner Bürobedarf GmbH", vat_id: "DE123456789", status: "ACTIVE", payment_terms_days: 30 };
const S1_ACCOUNTS = [{ iban: "DE89370400440532013000", status: "ACTIVE" }];
const PO_0101 = { id: "po1", po_number: "PO-2026-0101", supplier_id: "s1", remaining_amount: "1500.00", status: "OPEN" };

test("clean invoice passes every HIGH and MEDIUM check", () => {
  const r = runBusinessChecks(parse("A_clean_1240.xml"), { supplier: S1, bankAccounts: S1_ACCOUNTS, purchaseOrder: PO_0101, existingSameNumber: [] }, policy);
  const failed = r.checks.filter((c) => c.status === "FAILED");
  assert.deepEqual(failed, []);
  assert.equal(r.grossCents, 124000);
  assert.equal(r.supplierId, "s1");
});

test("changed IBAN is a HIGH failure with expected and actual values", () => {
  const parsed = parse("B_iban_changed_2499.xml");
  const supplier = { ...S1, id: "s2", vat_id: "DE234567890", payment_terms_days: 14 };
  const r = runBusinessChecks(parsed, { supplier, bankAccounts: [{ iban: "DE02120300000000202051", status: "ACTIVE" }], purchaseOrder: { id: "po2", po_number: "PO-2026-0201", supplier_id: "s2", remaining_amount: "3000.00", status: "OPEN" }, existingSameNumber: [] }, policy);
  const c = check(r, "supplier_iban_match");
  assert.equal(c.status, "FAILED");
  assert.equal(c.severity, "HIGH");
  assert.equal(c.expected, "DE02120300000000202051");
  assert.equal(c.actual, "DE02300209000106531065");
  assert.equal(c.recommended_action, "HUMAN_REVIEW");
});

test("a retired IBAN does not count as approved", () => {
  const r = runBusinessChecks(parse("A_clean_1240.xml"), { supplier: S1, bankAccounts: [{ iban: "DE89370400440532013000", status: "RETIRED" }], purchaseOrder: PO_0101, existingSameNumber: [] }, policy);
  assert.equal(check(r, "supplier_iban_match").status, "FAILED");
});

test("PO overrun beyond tolerance is a HIGH failure", () => {
  const parsed = parse("C_po_overrun_8500.xml");
  const supplier = { ...S1, id: "s3", vat_id: "DE345678901" };
  const r = runBusinessChecks(parsed, { supplier, bankAccounts: [{ iban: "DE02500105170137075030", status: "ACTIVE" }], purchaseOrder: { id: "po3", po_number: "PO-2026-0303", supplier_id: "s3", remaining_amount: "5000.00", status: "OPEN" }, existingSameNumber: [] }, policy);
  const c = check(r, "po_amount_within_tolerance");
  assert.equal(c.status, "FAILED");
  assert.equal(c.severity, "HIGH");
  assert.match(c.actual, /8500\.00/);
});

test("amount within tolerance passes", () => {
  const r = runBusinessChecks(parse("A_clean_1240.xml"), { supplier: S1, bankAccounts: S1_ACCOUNTS, purchaseOrder: { ...PO_0101, remaining_amount: "1030.00" }, existingSameNumber: [] }, policy);
  // 1030 + max(2 % = 20.60, 10) = 1050.60 >= 1042.02
  assert.equal(check(r, "po_amount_within_tolerance").status, "PASSED");
});

test("unknown supplier fails and skips dependent checks", () => {
  const r = runBusinessChecks(parse("A_clean_1240.xml"), { supplier: null, bankAccounts: [], purchaseOrder: PO_0101, existingSameNumber: [] }, policy);
  assert.equal(check(r, "supplier_known").status, "FAILED");
  assert.equal(check(r, "supplier_iban_match").status, "SKIPPED");
  assert.equal(check(r, "po_supplier_match").status, "FAILED");
});

test("blocked supplier fails supplier_active", () => {
  const r = runBusinessChecks(parse("A_clean_1240.xml"), { supplier: { ...S1, status: "BLOCKED" }, bankAccounts: S1_ACCOUNTS, purchaseOrder: PO_0101, existingSameNumber: [] }, policy);
  assert.equal(check(r, "supplier_active").status, "FAILED");
});

test("same invoice number already in the system is a HIGH duplicate failure", () => {
  const r = runBusinessChecks(parse("A_clean_1240.xml"), { supplier: S1, bankAccounts: S1_ACCOUNTS, purchaseOrder: PO_0101, existingSameNumber: [{ id: "x", state: "READY_FOR_APPROVAL" }] }, policy);
  const c = check(r, "duplicate_invoice_number");
  assert.equal(c.status, "FAILED");
  assert.equal(c.severity, "HIGH");
});

test("inconsistent totals fail", () => {
  const parsed = parse("A_clean_1240.xml");
  parsed.totals.payable = "1250.00";
  const r = runBusinessChecks(parsed, { supplier: S1, bankAccounts: S1_ACCOUNTS, purchaseOrder: PO_0101, existingSameNumber: [] }, policy);
  assert.equal(check(r, "totals_consistent").status, "FAILED");
});

test("unknown PO reference fails po_exists", () => {
  const r = runBusinessChecks(parse("A_clean_1240.xml"), { supplier: S1, bankAccounts: S1_ACCOUNTS, purchaseOrder: null, existingSameNumber: [] }, policy);
  assert.equal(check(r, "po_exists").status, "FAILED");
});

test("missing PO above the threshold is a MEDIUM failure", () => {
  const parsed = parse("A_clean_1240.xml");
  parsed.poReference = null;
  const r = runBusinessChecks(parsed, { supplier: S1, bankAccounts: S1_ACCOUNTS, purchaseOrder: null, existingSameNumber: [] }, policy);
  const c = check(r, "po_reference_present");
  assert.equal(c.status, "FAILED");
  assert.equal(c.severity, "MEDIUM");
});
