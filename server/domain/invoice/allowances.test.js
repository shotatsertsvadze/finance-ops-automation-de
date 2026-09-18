/**
 * Reading the parts of a document that move money between the line total and
 * the amount actually payable: allowances, charges and prepayments.
 *
 * The adapter used to stop at the line total and the four headline amounts,
 * and report everything else as "unsupported". These are not exotic parts of
 * UBL; they are the middle of EN 16931's calculation chain, and a supplier
 * granting a discount uses them routinely.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInvoiceXml } from "./parse-xrechnung.js";
import { buildInvoiceXml } from "../../test-support/invoice-xml.js";

const parse = (options) => parseInvoiceXml(buildInvoiceXml({ number: "ALW-1", netCents: 100000, ...options }));

test("an invoice with no allowances reads as it always did", () => {
  const parsed = parse({});
  assert.deepEqual(parsed.allowanceCharges, []);
  assert.equal(parsed.totals.lineExtension, "1000.00");
  assert.equal(parsed.totals.taxExclusive, "1000.00");
  assert.equal(parsed.totals.allowanceTotal, null);
  assert.equal(parsed.totals.prepaid, null);
});

test("a document-level discount is read with its amount and its reason", () => {
  const parsed = parse({ allowances: [{ amountCents: 20000, reason: "Skonto", reasonCode: "95" }] });

  assert.equal(parsed.allowanceCharges.length, 1);
  assert.deepEqual(parsed.allowanceCharges[0], {
    isCharge: false, amount: "200.00", baseAmount: null, multiplier: null,
    reason: "Skonto", reasonCode: "95", taxPercent: "19",
  });
  assert.equal(parsed.totals.allowanceTotal, "200.00");
  assert.equal(parsed.totals.taxExclusive, "800.00", "the net is the line total less the discount");
});

test("a surcharge is told apart from a discount by its charge indicator", () => {
  const parsed = parse({
    allowances: [
      { amountCents: 20000, reason: "Skonto" },
      { amountCents: 5000, charge: true, reason: "Versandkosten" },
    ],
  });
  assert.deepEqual(parsed.allowanceCharges.map((a) => a.isCharge), [false, true]);
  assert.equal(parsed.totals.allowanceTotal, "200.00");
  assert.equal(parsed.totals.chargeTotal, "50.00");
  assert.equal(parsed.totals.taxExclusive, "850.00");
});

test("an indicator that says neither is read as neither, not as a discount", () => {
  // Defaulting an unreadable indicator to "allowance" would let a surcharge be
  // subtracted. The sum is then not computable, which is the honest answer.
  const xml = buildInvoiceXml({ number: "ALW-2", netCents: 100000, allowances: [{ amountCents: 20000 }] })
    .replace("<cbc:ChargeIndicator>false</cbc:ChargeIndicator>", "<cbc:ChargeIndicator>vielleicht</cbc:ChargeIndicator>");
  assert.equal(parseInvoiceXml(xml).allowanceCharges[0].isCharge, null);
});

test("a prepayment and a rounding amount are read", () => {
  const parsed = parse({ prepaidCents: 19000, roundingCents: 1 });
  assert.equal(parsed.totals.prepaid, "190.00");
  assert.equal(parsed.totals.rounding, "0.01");
  assert.equal(parsed.totals.payable, "1000.01", "the amount to pay is the gross less what is already paid");
});

test("a line-level allowance is read on its line", () => {
  const xml = buildInvoiceXml({ number: "ALW-3", netCents: 100000 }).replace("<cac:Item>", `<cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:AllowanceChargeReason>Mengenrabatt</cbc:AllowanceChargeReason>
      <cbc:Amount currencyID="EUR">50.00</cbc:Amount>
    </cac:AllowanceCharge>
    <cac:Item>`);
  const [line] = parseInvoiceXml(xml).lines;
  assert.equal(line.allowanceCharges.length, 1);
  assert.equal(line.allowanceCharges[0].amount, "50.00");
  assert.equal(line.allowanceCharges[0].reason, "Mengenrabatt");
});

test("a base quantity is read, because it changes what the price means", () => {
  // A price stated per 1000 pieces is not a price per piece.
  const xml = buildInvoiceXml({ number: "ALW-4", netCents: 100000 })
    .replace("<cac:Price>", '<cac:Price><cbc:BaseQuantity unitCode="C62">1000</cbc:BaseQuantity>');
  assert.equal(parseInvoiceXml(xml).lines[0].baseQuantity, "1000");
  assert.equal(parse({}).lines[0].baseQuantity, null, "absent when the document does not say");
});

test("nothing is reported as unsupported any more", () => {
  assert.equal(parse({ allowances: [{ amountCents: 20000 }], prepaidCents: 100 }).unsupported, undefined);
});
