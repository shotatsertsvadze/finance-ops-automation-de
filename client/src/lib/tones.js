/**
 * What each status means in colour, in one place. One meaning per colour:
 * attention (amber) waits for a person, failed (red) is blocked or refused,
 * done (green) is completed, active (blue) is under way, neutral (grey) is
 * set aside. The words beside it always carry the meaning as well.
 */
export const TONES = ["attention", "failed", "done", "active", "neutral"];

export const STATE_TONE = {
  RECEIVED: "active",
  VALIDATING: "active",
  REVIEW_REQUIRED: "attention",
  INFO_REQUESTED: "attention",
  READY_FOR_APPROVAL: "attention",
  APPROVED: "done",
  ACCOUNTING_READY: "active",
  PAYMENT_PENDING: "active",
  PAYMENT_FAILED: "failed",
  PAID: "done",
  RECONCILIATION_EXCEPTION: "attention",
  RECONCILED: "done",
  CREDITED: "done",
  SETTLED_BY_CREDIT: "done",
  CANCELLED: "neutral",
  REJECTED: "failed",
  DUPLICATE: "neutral",
};

export const CHANGE_TONE = { PROPOSED: "attention", VERIFIED: "attention", APPROVED: "done", REJECTED: "failed", CANCELLED: "neutral" };
export const STEP_TONE = { PENDING: "attention", APPROVED: "done", REJECTED: "failed", CANCELLED: "neutral" };
export const TX_TONE = { MATCHED: "done", EXCEPTION: "attention", UNMATCHED: "neutral" };

/** The chip class for a tone; unknown values stay neutral. */
export const chip = (tone) => `chip chip-${TONES.includes(tone) ? tone : "neutral"}`;
