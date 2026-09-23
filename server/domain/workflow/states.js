/** The invoice state machine. A transition not listed here cannot happen. */
export const TRANSITIONS = {
  RECEIVED: ["VALIDATING", "DUPLICATE"],
  VALIDATING: ["REVIEW_REQUIRED", "READY_FOR_APPROVAL", "APPROVED"],
  REVIEW_REQUIRED: ["READY_FOR_APPROVAL", "INFO_REQUESTED", "REJECTED", "DUPLICATE", "VALIDATING"],
  INFO_REQUESTED: ["REVIEW_REQUIRED", "REJECTED"],
  // Back to review when the final gate finds a business fact that changed
  // while the invoice waited for a signature (ADR-041).
  READY_FOR_APPROVAL: ["APPROVED", "REJECTED", "INFO_REQUESTED", "REVIEW_REQUIRED"],
  APPROVED: ["ACCOUNTING_READY"],
  // Two ways to leave without a payment: a credit note is booked, and an
  // invoice its open credits cover entirely is settled against them.
  ACCOUNTING_READY: ["PAYMENT_PENDING", "CREDITED", "SETTLED_BY_CREDIT"],
  PAYMENT_PENDING: ["PAID"],
  PAID: ["RECONCILED", "RECONCILIATION_EXCEPTION"],
  RECONCILIATION_EXCEPTION: ["RECONCILED"],
  RECONCILED: [],
  CREDITED: [],
  SETTLED_BY_CREDIT: [],
  REJECTED: [],
  DUPLICATE: [],
};

export const STATES = Object.keys(TRANSITIONS);
export const TERMINAL_STATES = STATES.filter((s) => TRANSITIONS[s].length === 0);
export const REPROCESSABLE_STATES = ["RECEIVED", "VALIDATING", "REVIEW_REQUIRED"];

/**
 * Where each state stands on the way to the money. Every list of states the
 * code filters on is derived from this one table, so a new state is placed
 * once, here, and cannot be forgotten by a KPI or a capacity claim (ADR-051).
 *
 * OPEN               not yet decided
 * AWAITING_APPROVAL  decided by validation or review, waiting for a signature
 * COMMITTED          approved; the obligation stands but is not yet settled
 * SETTLED            paid, credited or offset; nothing is owed any more
 * DISCARDED          rejected or a duplicate; never an obligation
 */
export const PHASES = ["OPEN", "AWAITING_APPROVAL", "COMMITTED", "SETTLED", "DISCARDED"];
export const PHASE = {
  RECEIVED: "OPEN",
  VALIDATING: "OPEN",
  REVIEW_REQUIRED: "OPEN",
  INFO_REQUESTED: "OPEN",
  READY_FOR_APPROVAL: "AWAITING_APPROVAL",
  APPROVED: "COMMITTED",
  ACCOUNTING_READY: "COMMITTED",
  PAYMENT_PENDING: "COMMITTED",
  PAID: "SETTLED",
  RECONCILED: "SETTLED",
  RECONCILIATION_EXCEPTION: "SETTLED",
  CREDITED: "SETTLED",
  SETTLED_BY_CREDIT: "SETTLED",
  REJECTED: "DISCARDED",
  DUPLICATE: "DISCARDED",
};

const inPhase = (...phases) => STATES.filter((s) => phases.includes(PHASE[s]));

/** Approved and not undone: at most one per supplier invoice number. */
export const PAYABLE_STATES = inPhase("COMMITTED", "SETTLED");
/** A claim on the purchase order's capacity. */
export const HOLDS_CAPACITY_STATES = inPhase("AWAITING_APPROVAL", "COMMITTED", "SETTLED");
/** The supplier is still owed: what due-soon and overdue count. */
export const OUTSTANDING_STATES = inPhase("OPEN", "AWAITING_APPROVAL", "COMMITTED");
export const DISCARDED_STATES = inPhase("DISCARDED");
/** Paid, with the bank line still to be matched. */
export const AWAITING_RECONCILIATION_STATES = STATES.filter((s) => TRANSITIONS[s].includes("RECONCILED"));

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export const STATE_LABELS = {
  RECEIVED: "Eingegangen",
  VALIDATING: "In Prüfung",
  REVIEW_REQUIRED: "Sichtprüfung erforderlich",
  INFO_REQUESTED: "Rückfrage offen",
  READY_FOR_APPROVAL: "Freigabe ausstehend",
  APPROVED: "Freigegeben",
  ACCOUNTING_READY: "Buchungsreif",
  PAYMENT_PENDING: "Zahlung angestoßen",
  PAID: "Bezahlt",
  RECONCILED: "Abgeglichen",
  RECONCILIATION_EXCEPTION: "Abgleich unklar",
  CREDITED: "Gutgeschrieben",
  SETTLED_BY_CREDIT: "Durch Gutschrift ausgeglichen",
  REJECTED: "Abgelehnt",
  DUPLICATE: "Duplikat",
};
