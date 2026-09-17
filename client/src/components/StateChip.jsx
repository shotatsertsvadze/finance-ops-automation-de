import { useI18n } from "../lib/i18n.js";

const TONE = {
  REVIEW_REQUIRED: "chip-review",
  RECONCILIATION_EXCEPTION: "chip-review",
  REJECTED: "chip-review",
  INFO_REQUESTED: "chip-wait",
  READY_FOR_APPROVAL: "chip-wait",
  VALIDATING: "chip-wait",
  APPROVED: "chip-ok",
  ACCOUNTING_READY: "chip-ok",
  PAYMENT_PENDING: "chip-ok",
  PAID: "chip-ok",
  RECONCILED: "chip-ok",
};

export default function StateChip({ state }) {
  const { state: label } = useI18n();
  return <span className={`chip ${TONE[state] ?? "chip-neutral"}`}>{label(state)}</span>;
}
