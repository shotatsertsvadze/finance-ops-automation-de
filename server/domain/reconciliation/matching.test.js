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

/** One payment instruction awaiting its bank confirmation. */
const payment = (reference, amount, extra = {}) => ({
  invoice_id: `id-${reference}`,
  reference,
  amount,
  currency: "EUR",
  creditor_iban: "DE89370400440532013000",
  ...extra,
});

/** Paying a supplier moves money out of Nordwerk's account, so amounts are negative. */
const tx = (reference, amount, extra = {}) => ({
  external_id: "TX-1",
  reference,
  amount,
  currency: "EUR",
  counterparty_iban: "DE89370400440532013000",
  ...extra,
});

const OPEN = [payment("INV-2026-00421", "1240.00"), payment("INV-2026-00433", "380.00")];

test("reference and amount agreeing is a match", () => {
  const result = matchTransaction(tx("Rechnung INV-2026-00421 Nordwerk", "-1240.00"), OPEN);
  assert.equal(result.outcome, "MATCHED");
  assert.equal(result.invoiceId, "id-INV-2026-00421");
});

test("a negative amount on the statement is the paid amount", () => {
  const result = matchTransaction(tx("Rechnung INV-2026-00421", "-1240.00"), OPEN);
  assert.equal(result.outcome, "MATCHED");
});

test("an amount that matches an invoice without a reference is never reconciled", () => {
  const result = matchTransaction(tx("Sammelzahlung September ohne Einzelbeleg", "-380.00"), OPEN);
  assert.equal(result.outcome, "EXCEPTION");
  assert.equal(result.reason, "NO_REFERENCE_MATCH");
  assert.equal(result.invoiceId, null, "must not attach itself to the invoice it happens to equal");
});

test("a reference match with a different amount is an exception, not a match", () => {
  const result = matchTransaction(tx("Teilzahlung zu INV-2026-00433", "-350.00"), OPEN);
  assert.equal(result.outcome, "EXCEPTION");
  assert.equal(result.reason, "AMOUNT_MISMATCH");
  assert.equal(result.invoiceId, "id-INV-2026-00433", "the invoice is identified, the amount is what disagrees");
});

test("a reference naming two open invoices is ambiguous", () => {
  const twins = [payment("INV-1", "100.00"), payment("INV-2", "100.00")];
  const result = matchTransaction(tx("Zahlung INV-1 und INV-2", "-100.00"), twins);
  assert.equal(result.outcome, "EXCEPTION");
  assert.equal(result.reason, "AMBIGUOUS_REFERENCE");
});

test("a transaction that matches nothing stays unmatched", () => {
  const result = matchTransaction(tx("Gutschrift ohne Zuordnung", "-980.00"), OPEN);
  assert.equal(result.outcome, "UNMATCHED");
  assert.equal(result.invoiceId, null);
});

test("an invoice number embedded without spaces is still found", () => {
  const result = matchTransaction(tx("RG-INV-2026-00421/2026", "-1240.00"), OPEN);
  assert.equal(result.outcome, "MATCHED");
});

test("a longer invoice number is not matched by a shorter one that prefixes it", () => {
  const open = [payment("INV-1", "100.00"), payment("INV-10", "200.00")];
  const result = matchTransaction(tx("Zahlung zu INV-10", "-200.00"), open);
  assert.equal(result.outcome, "MATCHED", "INV-1 must not swallow INV-10");
  assert.equal(result.invoiceId, "id-INV-10");
});

test("matching is case-insensitive", () => {
  const result = matchTransaction(tx("rechnung inv-2026-00421", "-1240.00"), OPEN);
  assert.equal(result.outcome, "MATCHED");
});

test("an empty reference cannot match", () => {
  const result = matchTransaction(tx("", "-1240.00"), OPEN);
  assert.equal(result.outcome, "EXCEPTION");
  assert.equal(result.reason, "NO_REFERENCE_MATCH");
});

test("with no open invoices nothing matches", () => {
  const result = matchTransaction(tx("INV-2026-00421", "-1240.00"), []);
  assert.equal(result.outcome, "UNMATCHED");
});

// --- evidence that must agree before a transaction closes an invoice -------
// Each test changes exactly one field, so a pass cannot come from another
// check happening to fail first.

test("money arriving does not settle a payable, however well the reference reads", () => {
  const result = matchTransaction(tx("Rechnung INV-2026-00421", "1240.00"), OPEN);
  assert.equal(result.outcome, "EXCEPTION");
  assert.equal(result.reason, "PAYMENT_DIRECTION");
  assert.equal(result.invoiceId, "id-INV-2026-00421", "the invoice is named, the direction is what is wrong");
});

test("a payment in another currency is not the same amount", () => {
  const result = matchTransaction(tx("Rechnung INV-2026-00421", "-1240.00", { currency: "USD" }), OPEN);
  assert.equal(result.outcome, "EXCEPTION");
  assert.equal(result.reason, "CURRENCY_MISMATCH");
});

test("a payment to a different account does not settle the invoice", () => {
  const result = matchTransaction(tx("Rechnung INV-2026-00421", "-1240.00", { counterparty_iban: "DE02120300000000202051" }), OPEN);
  assert.equal(result.outcome, "EXCEPTION");
  assert.equal(result.reason, "COUNTERPARTY_MISMATCH");
});

test("an account that cannot be verified is an exception, not a pass", () => {
  const result = matchTransaction(tx("Rechnung INV-2026-00421", "-1240.00", { counterparty_iban: null }), OPEN);
  assert.equal(result.outcome, "EXCEPTION");
  assert.equal(result.reason, "COUNTERPARTY_MISMATCH", "unverifiable is not verified");
});

test("spacing in an IBAN does not make two identical accounts differ", () => {
  const result = matchTransaction(tx("Rechnung INV-2026-00421", "-1240.00", { counterparty_iban: "DE89 3704 0044 0532 0130 00" }), OPEN);
  assert.equal(result.outcome, "MATCHED");
});

// --- the reference must name the invoice, not merely contain its characters -

test("a reference naming two invoices is ambiguous even when one number is longer", () => {
  // The old tie-break preferred the longest number and silently matched it.
  const open = [payment("INV-A", "100.00"), payment("INV-LONG", "100.00")];
  const result = matchTransaction(tx("INV-A und INV-LONG", "-100.00"), open);
  assert.equal(result.outcome, "EXCEPTION");
  assert.equal(result.reason, "AMBIGUOUS_REFERENCE");
  assert.equal(result.invoiceId, null);
});

test("a longer number in the reference does not match a shorter open invoice", () => {
  // Only INV-1 is open; the reference names INV-10, which is a different invoice.
  const result = matchTransaction(tx("Rechnung INV-10", "-100.00"), [payment("INV-1", "100.00")]);
  assert.notEqual(result.outcome, "MATCHED", "INV-10 is not INV-1");
  assert.equal(result.invoiceId, null);
});

test("a hyphen or slash still joins an invoice number to surrounding text", () => {
  const result = matchTransaction(tx("RG-INV-2026-00421/2026", "-1240.00"), OPEN);
  assert.equal(result.outcome, "MATCHED", "a separator is not part of the identifier");
});

test("a payment with its own id is named by that id, not by the invoice number in its reference", () => {
  const open = [payment("NW-P-00000007 RE INV-2026-00421", "1240.00", { end_to_end_id: "NW-P-00000007" })];
  assert.equal(matchTransaction(tx("Zahlung NW-P-00000007 RE INV-2026-00421", "-1240.00"), open).outcome, "MATCHED");
  assert.equal(matchTransaction(tx("Rechnung INV-2026-00421", "-1240.00"), open).reason, "NO_REFERENCE_MATCH");
});

test("an instruction from before end-to-end ids is still named by its reference", () => {
  const legacy = [payment("INV-2026-00421", "1240.00", { end_to_end_id: null })];
  assert.equal(matchTransaction(tx("Rechnung INV-2026-00421", "-1240.00"), legacy).outcome, "MATCHED");
});
