import { toCents } from "../money.js";

/**
 * Prerequisites for an invoice to enter a payable state, as distinct from
 * business exceptions a reviewer may override.
 *
 * A reviewer exists to judge business facts: a changed IBAN, a PO overrun, a
 * suspected duplicate. A reviewer cannot supply facts the document never
 * carried. An invoice whose amount, identity or structure could not be read is
 * not eligible for approval at any number of signatures.
 */
export const NON_OVERRIDABLE_CHECKS = [
  "xml_well_formed",
  "format_recognised",
  "required_fields_present",
  "amounts_numeric",
  "dates_valid",
  // A reviewer judges business facts; they cannot supply a total the document
  // never added up. The chain covers discounts, surcharges and prepayments,
  // so an amount nobody could recompute stays unpayable (ADR-047).
  "totals_consistent",
  // A reviewer's word is not a verified bank account. A changed IBAN clears
  // only once master data holds it, after a call-back to the supplier, and a
  // re-validation confirms the match (ADR-052).
  "supplier_iban_match",
  // The booking is built from the breakdown per rate; one that does not add
  // up, or names a rate without a tax key, would be booked on a guess (ADR-053).
  "tax_breakdown_bookable",
];

/** Returns the reasons this invoice may not become payable. Empty means eligible. */
export function payableBlockers(invoice, failedCheckCodes = []) {
  const blockers = [];
  if (!invoice.invoice_number) blockers.push("invoice_number");
  if (toCents(invoice.gross_amount) === null) blockers.push("gross_amount");
  if (!invoice.supplier_id) blockers.push("supplier_id");
  if (!invoice.issue_date) blockers.push("issue_date");
  if (!invoice.currency) blockers.push("currency");
  for (const code of NON_OVERRIDABLE_CHECKS) {
    if (failedCheckCodes.includes(code)) blockers.push(code);
  }
  return blockers;
}

/** Failed check codes from the invoice's most recent validation run. */
export async function latestFailedChecks(client, invoiceId) {
  const { rows } = await client.query(
    `select check_code from finops.validation_results
     where invoice_id = $1
       and run_no = (select max(run_no) from finops.validation_results where invoice_id = $1)
       and status = 'FAILED'`,
    [invoiceId],
  );
  return rows.map((r) => r.check_code);
}
