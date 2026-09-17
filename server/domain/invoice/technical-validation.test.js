import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runTechnicalValidation } from "./technical-validation.js";

const fixture = (name) => readFileSync(new URL(`../../../fixtures/xrechnung/${name}`, import.meta.url));
const failedCodes = (r) => r.checks.filter((c) => c.status === "FAILED").map((c) => c.check);

test("fixture A parses into the neutral invoice structure", () => {
  const r = runTechnicalValidation(fixture("A_clean_1240.xml"));
  assert.equal(r.passed, true, JSON.stringify(failedCodes(r)));
  assert.equal(r.parsed.invoiceNumber, "INV-2026-00421");
  assert.equal(r.parsed.supplier.vatId, "DE123456789");
  assert.equal(r.parsed.payment.iban, "DE89370400440532013000");
  assert.equal(r.parsed.poReference, "PO-2026-0101");
  assert.equal(r.parsed.totals.payable, "1240.00");
  assert.equal(r.parsed.lines.length, 3);
  assert.equal(r.parsed.lines[0].quantity, "5");
});

test("fixture F fails closed with missing fields and non-numeric values", () => {
  const r = runTechnicalValidation(fixture("F_malformed.xml"));
  assert.equal(r.passed, false);
  assert.ok(failedCodes(r).includes("required_fields_present"));
  assert.ok(failedCodes(r).includes("amounts_numeric"));
  const missing = r.checks.find((c) => c.check === "required_fields_present");
  assert.match(missing.actual, /Lieferantenname/);
  assert.match(missing.actual, /Zahlbetrag/);
});

test("DOCTYPE is rejected before parsing", () => {
  const xml = Buffer.from(`<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><Invoice>&e;</Invoice>`);
  const r = runTechnicalValidation(xml);
  assert.equal(r.passed, false);
  assert.equal(r.checks.length, 1);
  assert.equal(r.checks[0].check, "xml_well_formed");
  assert.match(r.checks[0].reason, /DOCTYPE/);
});

test("non-XML bytes fail closed", () => {
  const r = runTechnicalValidation(Buffer.from("%PDF-1.7 not an invoice"));
  assert.equal(r.passed, false);
  assert.equal(r.checks[0].check, "xml_well_formed");
});

test("broken XML fails as not well-formed", () => {
  const r = runTechnicalValidation(Buffer.from(`<?xml version="1.0"?><Invoice><ID>1</Invoice>`));
  assert.equal(r.passed, false);
  assert.equal(r.checks[0].check, "xml_well_formed");
});

test("CII syntax is reported as unsupported format, not as an error", () => {
  const xml = Buffer.from(`<?xml version="1.0"?><rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"><rsm:ExchangedDocument/></rsm:CrossIndustryInvoice>`);
  const r = runTechnicalValidation(xml);
  assert.equal(r.passed, false);
  assert.equal(r.checks[0].check, "format_recognised");
  assert.match(r.checks[0].reason, /CII/);
});

test("missing XRechnung customization id is a MEDIUM failure", () => {
  const xml = fixture("A_clean_1240.xml").toString().replace(/<cbc:CustomizationID>.*<\/cbc:CustomizationID>/, "<cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>");
  const r = runTechnicalValidation(Buffer.from(xml));
  assert.equal(r.passed, false);
  const c = r.checks.find((c) => c.check === "xrechnung_profile_declared");
  assert.equal(c.status, "FAILED");
  assert.equal(c.severity, "MEDIUM");
});
