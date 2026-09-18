import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runTechnicalValidation } from "../invoice/technical-validation.js";
import { runBusinessChecks } from "./business-checks.js";
import { loadPolicy } from "../../config/policy.js";
import { loadCompany } from "../../config/company.js";
import { payableBlockers } from "../workflow/eligibility.js";

/** An invoice row that carries everything a payable state requires. */
const PAYABLE_INVOICE = {
  invoice_number: "RE-1", gross_amount: "1190.00", supplier_id: "s1",
  issue_date: "2026-09-15", currency: "EUR",
};

const policy = loadPolicy({});
const company = loadCompany({});
const parse = (name) => runTechnicalValidation(readFileSync(new URL(`../../../fixtures/xrechnung/${name}`, import.meta.url))).parsed;
const check = (r, code) => r.checks.find((c) => c.check === code);

const S1 = { id: "s1", supplier_no: "S-1001", legal_name: "Berliner Bürobedarf GmbH", vat_id: "DE123456789", status: "ACTIVE", payment_terms_days: 30 };
const S1_ACCOUNTS = [{ iban: "DE89370400440532013000", status: "ACTIVE" }];
const PO_0101 = { id: "po1", po_number: "PO-2026-0101", supplier_id: "s1", remaining_amount: "1500.00", status: "OPEN" };

test("clean invoice passes every HIGH and MEDIUM check", () => {
  const r = runBusinessChecks(parse("A_clean_1240.xml"), { supplier: S1, bankAccounts: S1_ACCOUNTS, purchaseOrder: PO_0101, existingSameNumber: [] }, policy, company);
  const failed = r.checks.filter((c) => c.status === "FAILED");
  assert.deepEqual(failed, []);
  assert.equal(r.grossCents, 124000);
  assert.equal(r.supplierId, "s1");
});

test("changed IBAN is a HIGH failure with expected and actual values", () => {
  const parsed = parse("B_iban_changed_2499.xml");
  const supplier = { ...S1, id: "s2", vat_id: "DE234567890", payment_terms_days: 14 };
  const r = runBusinessChecks(parsed, { supplier, bankAccounts: [{ iban: "DE02120300000000202051", status: "ACTIVE" }], purchaseOrder: { id: "po2", po_number: "PO-2026-0201", supplier_id: "s2", remaining_amount: "3000.00", status: "OPEN" }, existingSameNumber: [] }, policy, company);
  const c = check(r, "supplier_iban_match");
  assert.equal(c.status, "FAILED");
  assert.equal(c.severity, "HIGH");
  assert.equal(c.expected, "DE02120300000000202051");
  assert.equal(c.actual, "DE02300209000106531065");
  assert.equal(c.recommended_action, "HUMAN_REVIEW");
});

test("a retired IBAN does not count as approved", () => {
  const r = runBusinessChecks(parse("A_clean_1240.xml"), { supplier: S1, bankAccounts: [{ iban: "DE89370400440532013000", status: "RETIRED" }], purchaseOrder: PO_0101, existingSameNumber: [] }, policy, company);
  assert.equal(check(r, "supplier_iban_match").status, "FAILED");
});

test("PO overrun beyond tolerance is a HIGH failure", () => {
  const parsed = parse("C_po_overrun_8500.xml");
  const supplier = { ...S1, id: "s3", vat_id: "DE345678901" };
  const r = runBusinessChecks(parsed, { supplier, bankAccounts: [{ iban: "DE02500105170137075030", status: "ACTIVE" }], purchaseOrder: { id: "po3", po_number: "PO-2026-0303", supplier_id: "s3", remaining_amount: "5000.00", status: "OPEN" }, existingSameNumber: [] }, policy, company);
  const c = check(r, "po_amount_within_tolerance");
  assert.equal(c.status, "FAILED");
  assert.equal(c.severity, "HIGH");
  assert.match(c.actual, /8500\.00/);
});

test("amount within tolerance passes", () => {
  const r = runBusinessChecks(parse("A_clean_1240.xml"), { supplier: S1, bankAccounts: S1_ACCOUNTS, purchaseOrder: { ...PO_0101, remaining_amount: "1030.00" }, existingSameNumber: [] }, policy, company);
  // 1030 + max(2 % = 20.60, 10) = 1050.60 >= 1042.02
  assert.equal(check(r, "po_amount_within_tolerance").status, "PASSED");
});

test("unknown supplier fails and skips dependent checks", () => {
  const r = runBusinessChecks(parse("A_clean_1240.xml"), { supplier: null, bankAccounts: [], purchaseOrder: PO_0101, existingSameNumber: [] }, policy, company);
  assert.equal(check(r, "supplier_known").status, "FAILED");
  assert.equal(check(r, "supplier_iban_match").status, "SKIPPED");
  assert.equal(check(r, "po_supplier_match").status, "FAILED");
});

test("blocked supplier fails supplier_active", () => {
  const r = runBusinessChecks(parse("A_clean_1240.xml"), { supplier: { ...S1, status: "BLOCKED" }, bankAccounts: S1_ACCOUNTS, purchaseOrder: PO_0101, existingSameNumber: [] }, policy, company);
  assert.equal(check(r, "supplier_active").status, "FAILED");
});

test("same invoice number already in the system is a HIGH duplicate failure", () => {
  const r = runBusinessChecks(parse("A_clean_1240.xml"), { supplier: S1, bankAccounts: S1_ACCOUNTS, purchaseOrder: PO_0101, existingSameNumber: [{ id: "x", state: "READY_FOR_APPROVAL" }] }, policy, company);
  const c = check(r, "duplicate_invoice_number");
  assert.equal(c.status, "FAILED");
  assert.equal(c.severity, "HIGH");
});

test("inconsistent totals fail", () => {
  const parsed = parse("A_clean_1240.xml");
  parsed.totals.payable = "1250.00";
  const r = runBusinessChecks(parsed, { supplier: S1, bankAccounts: S1_ACCOUNTS, purchaseOrder: PO_0101, existingSameNumber: [] }, policy, company);
  assert.equal(check(r, "totals_consistent").status, "FAILED");
});

test("unknown PO reference fails po_exists", () => {
  const r = runBusinessChecks(parse("A_clean_1240.xml"), { supplier: S1, bankAccounts: S1_ACCOUNTS, purchaseOrder: null, existingSameNumber: [] }, policy, company);
  assert.equal(check(r, "po_exists").status, "FAILED");
});

test("missing PO above the threshold is a MEDIUM failure", () => {
  const parsed = parse("A_clean_1240.xml");
  parsed.poReference = null;
  const r = runBusinessChecks(parsed, { supplier: S1, bankAccounts: S1_ACCOUNTS, purchaseOrder: null, existingSameNumber: [] }, policy, company);
  const c = check(r, "po_reference_present");
  assert.equal(c.status, "FAILED");
  assert.equal(c.severity, "MEDIUM");
});

test("a purchase order belonging to another supplier names that supplier, not an id", () => {
  const r = runBusinessChecks(
    parse("A_clean_1240.xml"),
    {
      supplier: S1,
      bankAccounts: S1_ACCOUNTS,
      purchaseOrder: {
        id: "po9", po_number: "PO-2026-0999", supplier_id: "other", remaining_amount: "5000.00", status: "OPEN",
        supplier_supplier_no: "S-1003", supplier_legal_name: "Spree IT-Systeme AG",
      },
      existingSameNumber: [],
    },
    policy, company,
  );
  const c = check(r, "po_supplier_match");
  assert.equal(c.status, "FAILED");
  assert.match(c.actual, /S-1003/);
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}/.test(c.actual), `no raw identifier in the evidence: ${c.actual}`);
});


// ------------------------------------ the EN 16931 calculation chain -------

/**
 * L3: allowances, charges and prepayments are not exotic parts of UBL. They
 * are the middle of the chain that leads from the line total to the amount
 * actually due, and a supplier granting a discount uses them routinely.
 *
 * They used to be refused outright, because a total we cannot reconstruct
 * must not look like one we checked. Now the chain is computed, so the same
 * documents are verified end to end instead (ADR-047):
 *
 *   lines - allowances + charges = net, net + tax = gross,
 *   gross - prepaid + rounding  = payable
 */
import { buildInvoiceXml } from "../../test-support/invoice-xml.js";

const MASTER = { supplier: S1, bankAccounts: S1_ACCOUNTS, purchaseOrder: { ...PO_0101, po_number: "PO-2026-0102", remaining_amount: "150000.00" }, existingSameNumber: [] };
const runXml = (xml) => {
  const technical = runTechnicalValidation(Buffer.from(xml, "utf8"));
  assert.equal(technical.passed, true, "the document is technically readable");
  return runBusinessChecks(technical.parsed, MASTER, policy, company);
};
const invoice = (options) => buildInvoiceXml({ number: "CHAIN-1", netCents: 100000, ...options });
const totals = (r) => check(r, "totals_consistent");

test("an invoice without allowances is unaffected", () => {
  assert.equal(totals(runXml(invoice({}))).status, "PASSED");
});

test("a discounted invoice is verified rather than refused", () => {
  // The headline of this change: before it, every invoice carrying a discount
  // was unpayable, however correctly it was written.
  const r = runXml(invoice({ allowances: [{ amountCents: 20000, reason: "Skonto" }] }));
  assert.deepEqual(r.checks.filter((c) => c.status === "FAILED"), []);
  assert.equal(totals(r).status, "PASSED");
  assert.equal(r.grossCents, 95200, "800.00 net + 19 % = 952.00 payable");
});

test("a surcharge is added, not subtracted", () => {
  const r = runXml(invoice({ allowances: [{ amountCents: 5000, charge: true, reason: "Versandkosten" }] }));
  assert.equal(totals(r).status, "PASSED");
  assert.equal(r.grossCents, 124950, "1050.00 net + 19 %");
});

test("a prepayment reduces what we owe, and that is the amount carried forward", () => {
  const r = runXml(invoice({ prepaidCents: 19000 }));
  assert.equal(totals(r).status, "PASSED");
  assert.equal(r.grossCents, 100000, "1190.00 gross less 190.00 already paid");
});

test("a discount the document does not declare in its totals is caught", () => {
  // The silent pass this replaces: allowances present, no AllowanceTotalAmount,
  // and every other total internally consistent.
  const xml = invoice({}).replace("<cac:TaxTotal>", `<cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:Amount currencyID="EUR">200.00</cbc:Amount>
  </cac:AllowanceCharge>
  <cac:TaxTotal>`);
  const c = totals(runXml(xml));
  assert.equal(c.status, "FAILED");
  assert.equal(c.severity, "HIGH");
  assert.match(c.actual, /Nachlässe/);
});

test("a declared allowance total that does not match its allowances is caught", () => {
  const xml = invoice({ allowances: [{ amountCents: 20000 }] })
    .replace('<cbc:Amount currencyID="EUR">200.00</cbc:Amount>', '<cbc:Amount currencyID="EUR">150.00</cbc:Amount>');
  assert.equal(totals(runXml(xml)).status, "FAILED");
});

test("an allowance the net amount does not reflect is caught", () => {
  const xml = invoice({ allowances: [{ amountCents: 20000 }] })
    .replace('<cbc:TaxExclusiveAmount currencyID="EUR">800.00</cbc:TaxExclusiveAmount>',
             '<cbc:TaxExclusiveAmount currencyID="EUR">1000.00</cbc:TaxExclusiveAmount>');
  const c = totals(runXml(xml));
  assert.equal(c.status, "FAILED");
  assert.match(c.actual, /Netto/);
});

test("a prepayment the payable amount does not reflect is caught", () => {
  const xml = invoice({ prepaidCents: 19000 })
    .replace('<cbc:PayableAmount currencyID="EUR">1000.00</cbc:PayableAmount>',
             '<cbc:PayableAmount currencyID="EUR">1190.00</cbc:PayableAmount>');
  const c = totals(runXml(xml));
  assert.equal(c.status, "FAILED");
  assert.match(c.actual, /Anzahlung/);
});

test("an allowance that says neither discount nor surcharge is not guessed at", () => {
  const xml = invoice({ allowances: [{ amountCents: 20000 }] })
    .replace("<cbc:ChargeIndicator>false</cbc:ChargeIndicator>", "<cbc:ChargeIndicator>vielleicht</cbc:ChargeIndicator>");
  const c = totals(runXml(xml));
  assert.equal(c.status, "FAILED");
  assert.match(c.reason, /Nachlass oder Zuschlag/);
});

test("an amount the document states but we cannot read is not treated as zero", () => {
  // The dangerous shape: a prepayment of "zweihundert" read as nothing due
  // would leave the whole gross amount to pay, twice.
  const xml = invoice({ prepaidCents: 19000 })
    .replace('<cbc:PrepaidAmount currencyID="EUR">190.00</cbc:PrepaidAmount>',
             '<cbc:PrepaidAmount currencyID="EUR">zweihundert</cbc:PrepaidAmount>');
  const c = totals(runXml(xml));
  assert.equal(c.status, "FAILED");
  assert.match(c.actual, /nicht lesbar: Anzahlung/);
});

test("the blanket refusal of these documents is gone", () => {
  const r = runXml(invoice({ allowances: [{ amountCents: 20000 }] }));
  assert.equal(check(r, "document_features_supported"), undefined,
    "the parts it named are computed now, so the check has nothing left to refuse");
});

// ------------------------------------ the line's own arithmetic ------------

/**
 * The header chain closes over the line amounts a document declares, so it
 * cannot see a line whose declared amount has nothing to do with its quantity
 * and price. A line reading "10 x 5.00 = 500.00" leaves every total
 * consistent and overpays by a factor of ten.
 *
 * This is the only check that anchors a declared line amount to what was
 * actually ordered, so it is HIGH. It stays overridable: a reviewer can read
 * the order and judge whether the price is the one agreed (ADR-048).
 */
const lines = (r) => check(r, "line_amounts_consistent");
const withLine = (replacements) => {
  let xml = invoice({});
  for (const [from, to] of replacements) {
    assert.ok(xml.includes(from), `the fixture no longer contains: ${from}`);
    xml = xml.replace(from, to);
  }
  return xml;
};

test("an ordinary line is recomputed and agrees", () => {
  const c = lines(runXml(invoice({})));
  assert.equal(c.status, "PASSED");
  assert.equal(c.actual, "1 Position nachgerechnet", "one line, singular");
});

test("a line amount that does not follow from quantity and price is caught", () => {
  // Every total still adds up: this is what the header chain cannot see.
  const r = runXml(withLine([['<cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>',
                              '<cbc:InvoicedQuantity unitCode="C62">10</cbc:InvoicedQuantity>']]));
  assert.equal(totals(r).status, "PASSED", "the declared totals are consistent with each other");
  const c = lines(r);
  assert.equal(c.status, "FAILED");
  assert.equal(c.severity, "HIGH");
  assert.match(c.actual, /Position 1: 10000\.00 != 1000\.00/);
});

test("a price stated per base quantity is not a price per piece", () => {
  const r = runXml(withLine([
    ['<cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>',
     '<cbc:InvoicedQuantity unitCode="C62">10</cbc:InvoicedQuantity>'],
    ["<cac:Price>", '<cac:Price><cbc:BaseQuantity unitCode="C62">10</cbc:BaseQuantity>'],
  ]));
  assert.equal(lines(r).status, "PASSED", "10 pieces at 1000.00 per 10 is 1000.00");
});

test("a line discount the line amount reflects is accepted", () => {
  const r = runXml(withLine([
    ['<cac:Price><cbc:PriceAmount currencyID="EUR">1000.00</cbc:PriceAmount>',
     '<cac:Price><cbc:PriceAmount currencyID="EUR">1050.00</cbc:PriceAmount>'],
    ["<cac:Item>", `<cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:AllowanceChargeReason>Mengenrabatt</cbc:AllowanceChargeReason>
      <cbc:Amount currencyID="EUR">50.00</cbc:Amount>
    </cac:AllowanceCharge>
    <cac:Item>`],
  ]));
  assert.equal(lines(r).status, "PASSED", "1050.00 less 50.00 is the declared 1000.00");
});

test("a line discount the line amount ignores is caught", () => {
  const r = runXml(withLine([["<cac:Item>", `<cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:Amount currencyID="EUR">50.00</cbc:Amount>
    </cac:AllowanceCharge>
    <cac:Item>`]]));
  const c = lines(r);
  assert.equal(c.status, "FAILED");
  assert.match(c.actual, /950\.00 != 1000\.00/);
});

test("a line charge with no indicator is not guessed at either", () => {
  const r = runXml(withLine([["<cac:Item>", `<cac:AllowanceCharge>
      <cbc:ChargeIndicator>weder-noch</cbc:ChargeIndicator>
      <cbc:Amount currencyID="EUR">50.00</cbc:Amount>
    </cac:AllowanceCharge>
    <cac:Item>`]]));
  assert.equal(lines(r).status, "FAILED");
  assert.match(lines(r).actual, /Kennzeichen/);
});

test("a line with no price is reported as unchecked, not as correct", () => {
  const r = runXml(withLine([['<cac:Price><cbc:PriceAmount currencyID="EUR">1000.00</cbc:PriceAmount></cac:Price>',
                              "<cac:Price></cac:Price>"]]));
  const c = lines(r);
  assert.equal(c.status, "SKIPPED");
  assert.match(c.actual, /Position 1/);
});

test("a reviewer may accept a line the supplier miscalculated", () => {
  // Unlike the totals chain, this is a business fact a person can judge
  // against the order, so it is not a blocker on its own.
  assert.deepEqual(payableBlockers(PAYABLE_INVOICE, ["line_amounts_consistent"]), []);
  assert.deepEqual(payableBlockers(PAYABLE_INVOICE, ["totals_consistent"]), ["totals_consistent"]);
});
