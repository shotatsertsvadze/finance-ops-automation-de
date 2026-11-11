import { test } from "node:test";
import assert from "node:assert/strict";
import { OUTBOUND } from "../ai/outbound.js";
import { BLOCKING, REQUESTS, inquiryScope } from "./requests.js";
import { PLACEHOLDERS, fill, placeholdersIn } from "./placeholders.js";
import { templateInquiry } from "./template.js";

const ALL = [...PLACEHOLDERS];
const VALUES = {
  rechnungsnummer: "RE-2026-4480",
  rechnungsdatum: "02.09.2026",
  bruttobetrag: "10.115,00 EUR",
  bestellnummer: "PO-2026-0205",
  lieferant: "Spree IT-Systeme AG",
  unser_unternehmen: "Nordwerk GmbH",
};
const BANK = /IBAN|Bankverbindung|Kontonummer|Konto\b|BIC/i;

test("every check an inquiry can address is one the validation produces", () => {
  for (const code of [...Object.keys(REQUESTS), ...Object.keys(BLOCKING)]) assert.ok(OUTBOUND[code], code);
});

test("a changed IBAN or an unknown supplier blocks the inquiry, whatever else failed", () => {
  assert.deepEqual(inquiryScope(["po_amount_within_tolerance", "supplier_iban_match"]), { eligible: false, code: "INQUIRY_BANK_DETAILS" });
  assert.deepEqual(inquiryScope(["supplier_known", "totals_consistent"]), { eligible: false, code: "INQUIRY_SUPPLIER_UNKNOWN" });
});

test("checks that are ours to sort out give no inquiry", () => {
  assert.deepEqual(inquiryScope(["supplier_active"]), { eligible: false, code: "INQUIRY_NOT_APPLICABLE" });
  assert.deepEqual(inquiryScope([]), { eligible: false, code: "INQUIRY_NOT_APPLICABLE" });
});

test("an inquiry covers the checks it can address, each request once", () => {
  assert.deepEqual(inquiryScope(["totals_consistent", "line_amounts_consistent", "supplier_active"]), {
    eligible: true,
    checks: ["totals_consistent", "line_amounts_consistent"],
    requests: ["korrigierte_rechnung"],
  });
});

test("the template for an order overrun names the invoice by placeholder and asks what the check allows", () => {
  const { subject, body } = templateInquiry(["po_amount_within_tolerance"], ALL);
  assert.equal(subject, "Rückfrage zu Ihrer Rechnung {{rechnungsnummer}}");
  assert.match(body, /Ihrer Rechnung \{\{rechnungsnummer\}\} vom \{\{rechnungsdatum\}\} über \{\{bruttobetrag\}\}/);
  assert.match(body, /offenen Betrag der Bestellung \{\{bestellnummer\}\}/);
  assert.match(body, /erläutern Sie die Differenz/);
  assert.equal(fill(subject, VALUES), "Rückfrage zu Ihrer Rechnung RE-2026-4480");
  assert.deepEqual(placeholdersIn(fill(body, VALUES)), []);
});

test("a template never names a placeholder the invoice has no value for", () => {
  const { subject, body } = templateInquiry(["po_amount_within_tolerance", "xml_well_formed"], ["unser_unternehmen"]);
  assert.deepEqual([...placeholdersIn(subject), ...placeholdersIn(body)], ["unser_unternehmen"]);
  assert.match(body, /bei der Prüfung Ihrer Rechnung ist uns/);
});

test("no template, for any check, mentions bank details", () => {
  for (const code of Object.keys(REQUESTS)) {
    const { subject, body } = templateInquiry([code], ALL);
    assert.doesNotMatch(`${subject}\n${body}`, BANK, code);
  }
});

test("fill leaves an unknown or empty placeholder as written", () => {
  assert.equal(
    fill("{{rechnungsnummer}} {{nicht_da}} {{bestellnummer}}", { rechnungsnummer: "X-1", bestellnummer: null }),
    "X-1 {{nicht_da}} {{bestellnummer}}",
  );
});
