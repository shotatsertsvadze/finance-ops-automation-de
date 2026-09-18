/**
 * Reading a credit note.
 *
 * A supplier who over-charged sends a credit note, and until now this adapter
 * read it as an invoice with an odd type code: a warning, and then the full
 * payable path, which would have paid a document that says we are owed money.
 *
 * Two shapes carry the same meaning, and both are accepted here rather than
 * asserting which one XRechnung requires: a UBL CreditNote document, and a UBL
 * Invoice whose type code is 381.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInvoiceXml } from "./parse-xrechnung.js";
import { runTechnicalValidation } from "./technical-validation.js";
import { buildInvoiceXml } from "../../test-support/invoice-xml.js";

const parse = (options) => parseInvoiceXml(buildInvoiceXml({ number: "GS-1", netCents: 20000, ...options }));

test("an ordinary invoice says what it is", () => {
  const parsed = parse({});
  assert.equal(parsed.documentType, "INVOICE");
  assert.equal(parsed.typeCode, "380");
});

test("a UBL CreditNote document is read as a credit note", () => {
  const parsed = parse({ creditNote: true, credits: "RE-2026-4471" });
  assert.equal(parsed.documentType, "CREDIT_NOTE");
  assert.equal(parsed.format, "XRECHNUNG_UBL");
  assert.equal(parsed.typeCode, "381");
  assert.equal(parsed.creditedInvoice, "RE-2026-4471", "it names the invoice it credits");
});

test("its lines and amounts are read the same way, under different element names", () => {
  const parsed = parse({ creditNote: true });
  assert.equal(parsed.lines.length, 1);
  assert.equal(parsed.lines[0].lineNet, "200.00");
  assert.equal(parsed.lines[0].quantity, "1");
  assert.equal(parsed.totals.payable, "238.00", "positive, as the document states it");
});

test("an Invoice document with type code 381 is a credit note too", () => {
  // The other shape the same meaning arrives in.
  const parsed = parse({ typeCode: "381" });
  assert.equal(parsed.documentType, "CREDIT_NOTE");
  assert.equal(parsed.format, "XRECHNUNG_UBL");
});

test("a credit note that names no invoice is still read", () => {
  // Whether that is acceptable is a business question, not a parsing one.
  assert.equal(parse({ creditNote: true }).creditedInvoice, null);
});

test("a CreditNote root in the wrong namespace is not one", () => {
  const xml = buildInvoiceXml({ number: "GS-2", netCents: 20000, creditNote: true })
    .replace("urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2", "urn:example:not-ubl");
  assert.throws(() => parseInvoiceXml(xml), /UNSUPPORTED_FORMAT|Namensraum/);
});

test("a credit note passes technical validation without the odd-type warning", () => {
  const result = runTechnicalValidation(Buffer.from(buildInvoiceXml({
    number: "GS-3", netCents: 20000, creditNote: true, credits: "RE-1",
  }), "utf8"));
  assert.equal(result.passed, true, JSON.stringify(result.checks.filter((c) => c.status === "FAILED")));
  assert.equal(result.checks.find((c) => c.check === "invoice_type_code"), undefined,
    "381 is a document we now understand, not an anomaly to flag");
});
