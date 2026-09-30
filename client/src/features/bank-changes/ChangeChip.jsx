import { useI18n } from "../../lib/i18n.js";

const TONE = { PROPOSED: "chip-wait", VERIFIED: "chip-wait", APPROVED: "chip-ok", REJECTED: "chip-review", CANCELLED: "chip-neutral" };

export default function ChangeChip({ state }) {
  const { changeState } = useI18n();
  return <span className={`chip ${TONE[state] ?? "chip-neutral"}`}>{changeState(state)}</span>;
}
