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
  // A credit note leaves the money path here: it is booked, and never paid.
  ACCOUNTING_READY: ["PAYMENT_PENDING", "CREDITED"],
  PAYMENT_PENDING: ["PAID"],
  PAID: ["RECONCILED", "RECONCILIATION_EXCEPTION"],
  RECONCILIATION_EXCEPTION: ["RECONCILED"],
  RECONCILED: [],
  CREDITED: [],
  REJECTED: [],
  DUPLICATE: [],
};

export const STATES = Object.keys(TRANSITIONS);
export const TERMINAL_STATES = STATES.filter((s) => TRANSITIONS[s].length === 0);
export const PAYABLE_STATES = ["APPROVED", "ACCOUNTING_READY", "PAYMENT_PENDING", "PAID", "RECONCILED"];
export const REPROCESSABLE_STATES = ["RECEIVED", "VALIDATING", "REVIEW_REQUIRED"];

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
  REJECTED: "Abgelehnt",
  DUPLICATE: "Duplikat",
};
