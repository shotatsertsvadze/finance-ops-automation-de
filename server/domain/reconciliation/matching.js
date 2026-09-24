import { toCents } from "../money.js";

/**
 * Decide what a single bank transaction means for the payments still awaiting
 * confirmation.
 *
 * The comparison is against the payment instruction, not the invoice. The
 * instruction is what was actually sent to the bank; the invoice is what a
 * supplier's document claimed. They agree today, and when they stop agreeing
 * the instruction is the one the bank acted on.
 *
 * Deliberately strict: a payment is reconciled only when the reference names
 * exactly that payment and every other piece of evidence agrees. Two payments
 * of the same amount are indistinguishable by amount, so matching on amount
 * alone would close whichever was found first. That is the failure this rule
 * exists to prevent, so an amount-only hit is an exception, never a match.
 *
 * Direction convention: this is Nordwerk's own account, so paying a supplier
 * moves money out and appears as a negative amount. A positive transaction of
 * the same size is money arriving, which does not settle a payable however
 * well the reference reads.
 *
 * Pure function: the caller persists the outcome.
 *
 * @param openPayments rows of `{ invoice_id, reference, end_to_end_id, amount, currency, creditor_iban }`
 */
export function matchTransaction(transaction, openPayments) {
  const reference = (transaction.reference ?? "").toUpperCase();
  const signedCents = toCents(transaction.amount) ?? 0;
  const amountCents = Math.abs(signedCents);

  const named = openPayments.filter((payment) => {
    // The id Nordwerk issued (ADR-063). Only an instruction from before it
    // existed is recognised by its reference, which was the invoice number.
    const token = payment.end_to_end_id ?? payment.reference;
    return token && namesPayment(reference, token);
  });

  // Two payments named is two obligations, not a near miss to be resolved by
  // picking one. Token boundaries already keep "INV-1" out of "INV-10", so
  // there is no prefix collision left for a tie-break to fix.
  if (named.length > 1) {
    return { outcome: "EXCEPTION", reason: "AMBIGUOUS_REFERENCE", invoiceId: null };
  }

  if (named.length === 1) return decide(named[0], transaction, signedCents, amountCents);

  if (signedCents > 0) return { outcome: "UNMATCHED", reason: null, invoiceId: null };

  const sameAmount = openPayments.filter((payment) => toCents(payment.amount) === amountCents);
  if (sameAmount.length > 0) {
    return { outcome: "EXCEPTION", reason: "NO_REFERENCE_MATCH", invoiceId: null };
  }

  return { outcome: "UNMATCHED", reason: null, invoiceId: null };
}

/**
 * Does the reference name this payment, rather than merely contain its
 * characters? An identifier ends where a non-alphanumeric character begins, so
 * "INV-10" does not name "INV-1", while "RG-INV-2026-00421/2026" does name
 * "INV-2026-00421": a hyphen or slash joins identifiers, a digit extends one.
 */
function namesPayment(reference, paymentReference) {
  const escaped = paymentReference.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Z0-9])${escaped}(?![A-Z0-9])`).test(reference);
}

/**
 * Everything that must agree once the reference has identified one payment.
 * Checked in a fixed order so a transaction that is wrong in several ways
 * reports the same reason every time: who and what first, then how much.
 */
function decide(payment, transaction, signedCents, amountCents) {
  const at = (reason) => ({ outcome: "EXCEPTION", reason, invoiceId: payment.invoice_id });

  if (signedCents >= 0) return at("PAYMENT_DIRECTION");

  const instructed = (payment.currency ?? "").toUpperCase();
  const paid = (transaction.currency ?? "").toUpperCase();
  if (!instructed || !paid || instructed !== paid) return at("CURRENCY_MISMATCH");

  // Unverifiable is not the same as verified, so a missing account on either
  // side is an exception rather than a pass.
  const paidTo = normaliseIban(transaction.counterparty_iban);
  const expected = normaliseIban(payment.creditor_iban);
  if (!paidTo || !expected || paidTo !== expected) return at("COUNTERPARTY_MISMATCH");

  if (toCents(payment.amount) !== amountCents) return at("AMOUNT_MISMATCH");

  return { outcome: "MATCHED", reason: null, invoiceId: payment.invoice_id };
}

const normaliseIban = (iban) => (iban ?? "").replace(/\s+/g, "").toUpperCase();
