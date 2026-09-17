/**
 * Reconciliation matching rules, as a pure function.
 *
 * The rule that matters: a bank transaction reconciles an invoice only when
 * its reference identifies that invoice AND the amount agrees. Matching on
 * amount alone is the classic way to close the wrong invoice, so it is an
 * exception here, never a match.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchTransaction } from "./matching.js";

const invoice = (invoice_number, gross_amount, extra = {}) => ({
  id: `id-${invoice_number}`,
  invoice_number,
  gross_amount,
  supplier_iban_raw: "DE89370400440532013000",
  ...extra,
});

const tx = (reference, amount, extra = {}) => ({
  external_id: "TX-1",
  reference,
  amount,
  counterparty_iban: "DE89370400440532013000",
  ...extra,
});

const OPEN = [invoice("INV-2026-00421", "1240.00"), invoice("INV-2026-00433", "380.00")];

test("reference and amount agreeing is a match", () => {
  const result = matchTransaction(tx("Rechnung INV-2026-00421 Nordwerk", "1240.00"), OPEN);
  assert.equal(result.outcome, "MATCHED");
  assert.equal(result.invoiceId, "id-INV-2026-00421");
});

test("a negative amount on the statement is treated as the paid amount", () => {
  const result = matchTransaction(tx("Rechnung INV-2026-00421", "-1240.00"), OPEN);
  assert.equal(result.outcome, "MATCHED");
});

test("an amount that matches an invoice without a reference is never reconciled", () => {
  const result = matchTransaction(tx("Sammelzahlung September ohne Einzelbeleg", "380.00"), OPEN);
  assert.equal(result.outcome, "EXCEPTION");
  assert.equal(result.reason, "NO_REFERENCE_MATCH");
  assert.equal(result.invoiceId, null, "must not attach itself to the invoice it happens to equal");
});

test("a reference match with a different amount is an exception, not a match", () => {
  const result = matchTransaction(tx("Teilzahlung zu INV-2026-00433", "350.00"), OPEN);
  assert.equal(result.outcome, "EXCEPTION");
  assert.equal(result.reason, "AMOUNT_MISMATCH");
  assert.equal(result.invoiceId, "id-INV-2026-00433", "the invoice is identified, the amount is what disagrees");
});

test("a reference naming two open invoices is ambiguous", () => {
  const twins = [invoice("INV-1", "100.00"), invoice("INV-2", "100.00")];
  const result = matchTransaction(tx("Zahlung INV-1 und INV-2", "100.00"), twins);
  assert.equal(result.outcome, "EXCEPTION");
  assert.equal(result.reason, "AMBIGUOUS_REFERENCE");
});

test("a transaction that matches nothing stays unmatched", () => {
  const result = matchTransaction(tx("Gutschrift ohne Zuordnung", "980.00"), OPEN);
  assert.equal(result.outcome, "UNMATCHED");
  assert.equal(result.invoiceId, null);
});

test("an invoice number embedded without spaces is still found", () => {
  const result = matchTransaction(tx("RG-INV-2026-00421/2026", "1240.00"), OPEN);
  assert.equal(result.outcome, "MATCHED");
});

test("a longer invoice number is not matched by a shorter one that prefixes it", () => {
  const open = [invoice("INV-1", "100.00"), invoice("INV-10", "200.00")];
  const result = matchTransaction(tx("Zahlung zu INV-10", "200.00"), open);
  assert.equal(result.outcome, "MATCHED", "INV-1 must not swallow INV-10");
  assert.equal(result.invoiceId, "id-INV-10");
});

test("matching is case-insensitive", () => {
  const result = matchTransaction(tx("rechnung inv-2026-00421", "1240.00"), OPEN);
  assert.equal(result.outcome, "MATCHED");
});

test("an empty reference cannot match", () => {
  const result = matchTransaction(tx("", "1240.00"), OPEN);
  assert.equal(result.outcome, "EXCEPTION");
  assert.equal(result.reason, "NO_REFERENCE_MATCH");
});

test("with no open invoices nothing matches", () => {
  const result = matchTransaction(tx("INV-2026-00421", "1240.00"), []);
  assert.equal(result.outcome, "UNMATCHED");
});
