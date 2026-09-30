/**
 * What the bank-account screens offer a person (ADR-077). No rendering: these
 * are the server's separation-of-duties rules seen from the screen, so a
 * button that can only be refused is not offered (ADR-071).
 */

const OPEN = ["PROPOSED", "VERIFIED"];

export function changeActions(change, user, may) {
  const mine = change.proposed_by === user.id;
  const open = OPEN.includes(change.state);
  const actions = [];
  if (change.state === "PROPOSED" && !mine && may("bank-change:verify")) actions.push("verify");
  const verifierBlocked = change.required_distinct_actors >= 3 && change.verified_by === user.id;
  if (change.state === "VERIFIED" && !mine && !verifierBlocked && may("bank-change:approve")) actions.push("approve");
  if (open && !mine && may("bank-change:approve")) actions.push("reject");
  if (open && mine && may("bank-change:propose")) actions.push("cancel");
  if (change.state === "APPROVED" && change.pending_invoices.length > 0 && may("invoice:reprocess")) actions.push("revalidate");
  return actions;
}

/**
 * Whether an invoice's screen shows the bank-account panel, and whether it
 * offers to propose the invoice's IBAN. A change that is open or approved
 * for that IBAN is linked instead: proposing again would be refused.
 */
export function invoiceBankEntry(invoice, may) {
  const ibanFailed = (invoice.validation?.business ?? [])
    .some((r) => r.check_code === "supplier_iban_match" && r.status === "FAILED");
  const show = ibanFailed && Boolean(invoice.supplier_id);
  const pending = (invoice.bank_changes ?? []).some((c) => [...OPEN, "APPROVED"].includes(c.state));
  const canPropose = show && !pending && may("bank-change:propose")
    && ["REVIEW_REQUIRED", "INFO_REQUESTED"].includes(invoice.state);
  return { show, canPropose };
}
