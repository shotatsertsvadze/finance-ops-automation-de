import { toCents } from "../money.js";

/**
 * Decide what a single bank transaction means for a set of open invoices.
 *
 * Deliberately strict: an invoice is reconciled only when the reference names
 * exactly that invoice and every other piece of evidence agrees. Two invoices
 * of the same amount are indistinguishable by amount, so matching on amount
 * alone would close whichever was found first. That is the failure this rule
 * exists to prevent, so an amount-only hit is an exception, never a match.
 *
 * Direction convention: this is Nordwerk's own account, so paying a supplier
 * invoice moves money out and appears as a negative amount. A positive
 * transaction of the same size is money arriving, which does not settle a
 * payable however well the reference reads.
 *
 * Pure function: the caller persists the outcome.
 */
export function matchTransaction(transaction, openInvoices) {
  const reference = (transaction.reference ?? "").toUpperCase();
  const signedCents = toCents(transaction.amount) ?? 0;
  const amountCents = Math.abs(signedCents);

  const named = openInvoices.filter(
    (invoice) => invoice.invoice_number && namesInvoice(reference, invoice.invoice_number),
  );

  // Two invoices named is two obligations, not a near miss to be resolved by
  // picking one. Token boundaries already keep "INV-1" out of "INV-10", so
  // there is no prefix collision left for a tie-break to fix.
  if (named.length > 1) {
    return { outcome: "EXCEPTION", reason: "AMBIGUOUS_REFERENCE", invoiceId: null };
  }

  if (named.length === 1) return decide(named[0], transaction, signedCents, amountCents);

  if (signedCents > 0) return { outcome: "UNMATCHED", reason: null, invoiceId: null };

  const sameAmount = openInvoices.filter((invoice) => toCents(invoice.gross_amount) === amountCents);
  if (sameAmount.length > 0) {
    return { outcome: "EXCEPTION", reason: "NO_REFERENCE_MATCH", invoiceId: null };
  }

  return { outcome: "UNMATCHED", reason: null, invoiceId: null };
}

/**
 * Does the reference name this invoice, rather than merely contain its
 * characters? An identifier ends where a non-alphanumeric character begins, so
 * "INV-10" does not name "INV-1", while "RG-INV-2026-00421/2026" does name
 * "INV-2026-00421": a hyphen or slash joins identifiers, a digit extends one.
 */
function namesInvoice(reference, invoiceNumber) {
  const escaped = invoiceNumber.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Z0-9])${escaped}(?![A-Z0-9])`).test(reference);
}

/**
 * Everything that must agree once the reference has identified one invoice.
 * Checked in a fixed order so a transaction that is wrong in several ways
 * reports the same reason every time: who and what first, then how much.
 */
function decide(invoice, transaction, signedCents, amountCents) {
  const at = (reason) => ({ outcome: "EXCEPTION", reason, invoiceId: invoice.id });

  if (signedCents >= 0) return at("PAYMENT_DIRECTION");

  const invoiceCurrency = (invoice.currency ?? "").toUpperCase();
  const transactionCurrency = (transaction.currency ?? "").toUpperCase();
  if (!invoiceCurrency || !transactionCurrency || invoiceCurrency !== transactionCurrency) {
    return at("CURRENCY_MISMATCH");
  }

  // Unverifiable is not the same as verified, so a missing account on either
  // side is an exception rather than a pass.
  const paidTo = normaliseIban(transaction.counterparty_iban);
  const expected = normaliseIban(invoice.supplier_iban_raw);
  if (!paidTo || !expected || paidTo !== expected) return at("COUNTERPARTY_MISMATCH");

  if (toCents(invoice.gross_amount) !== amountCents) return at("AMOUNT_MISMATCH");

  return { outcome: "MATCHED", reason: null, invoiceId: invoice.id };
}

const normaliseIban = (iban) => (iban ?? "").replace(/\s+/g, "").toUpperCase();
