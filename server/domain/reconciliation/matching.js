import { toCents } from "../money.js";

/**
 * Decide what a single bank transaction means for a set of open invoices.
 *
 * Deliberately strict: an invoice is only reconciled when the transaction
 * reference names it AND the amount agrees. Two invoices of the same amount
 * are indistinguishable by amount, so matching on amount alone would close
 * whichever one happened to be found first. That is the failure this rule
 * exists to prevent, so an amount-only hit is an exception, never a match.
 *
 * Pure function: the caller persists the outcome.
 */
export function matchTransaction(transaction, openInvoices) {
  const reference = (transaction.reference ?? "").toUpperCase();
  const amountCents = Math.abs(toCents(transaction.amount) ?? 0);

  const named = openInvoices.filter((invoice) => invoice.invoice_number && reference.includes(invoice.invoice_number.toUpperCase()));

  if (named.length > 1) {
    // Prefer the longest number: "INV-1" is a substring of "INV-10", so a
    // reference naming only the longer one would otherwise look ambiguous.
    const longest = Math.max(...named.map((i) => i.invoice_number.length));
    const best = named.filter((i) => i.invoice_number.length === longest);
    if (best.length === 1) return decideOnAmount(best[0], amountCents);
    return { outcome: "EXCEPTION", reason: "AMBIGUOUS_REFERENCE", invoiceId: null };
  }

  if (named.length === 1) return decideOnAmount(named[0], amountCents);

  const sameAmount = openInvoices.filter((invoice) => toCents(invoice.gross_amount) === amountCents);
  if (sameAmount.length > 0) {
    return { outcome: "EXCEPTION", reason: "NO_REFERENCE_MATCH", invoiceId: null };
  }

  return { outcome: "UNMATCHED", reason: null, invoiceId: null };
}

function decideOnAmount(invoice, amountCents) {
  if (toCents(invoice.gross_amount) === amountCents) {
    return { outcome: "MATCHED", reason: null, invoiceId: invoice.id };
  }
  return { outcome: "EXCEPTION", reason: "AMOUNT_MISMATCH", invoiceId: invoice.id };
}
