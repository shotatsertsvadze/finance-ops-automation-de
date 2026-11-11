/**
 * The document's own tax breakdown: one TaxSubtotal per rate. A booking needs
 * it per rate, because one tax key cannot describe 7 % and 19 % at once
 * (ADR-053).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseInvoiceXml } from "./parse-xrechnung.js";

const fixture = (name) => readFileSync(new URL(`../../../fixtures/xrechnung/${name}`, import.meta.url), "utf8");

const reduced = `<cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">100.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">7.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>7</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>`;

test("a single-rate invoice states one subtotal", () => {
  const parsed = parseInvoiceXml(fixture("A_clean_1240.xml"));
  assert.deepEqual(parsed.taxSubtotals, [{ taxable: "1042.02", amount: "197.98", category: "S", percent: "19" }]);
});

test("each rate the document states is read, in order", () => {
  const parsed = parseInvoiceXml(fixture("A_clean_1240.xml").replace("</cac:TaxTotal>", reduced));
  assert.deepEqual(
    parsed.taxSubtotals.map((s) => [s.category, s.percent, s.taxable, s.amount]),
    [
      ["S", "19", "1042.02", "197.98"],
      ["S", "7", "100.00", "7.00"],
    ],
  );
});

test("a document without a breakdown says so, rather than inventing one", () => {
  const xml = fixture("A_clean_1240.xml").replace(/<cac:TaxSubtotal>[\s\S]*?<\/cac:TaxSubtotal>/, "");
  assert.deepEqual(parseInvoiceXml(xml).taxSubtotals, []);
});
