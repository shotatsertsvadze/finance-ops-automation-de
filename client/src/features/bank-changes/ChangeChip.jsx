import { useI18n } from "../../lib/i18n.js";
import { CHANGE_TONE, chip } from "../../lib/tones.js";

export default function ChangeChip({ state }) {
  const { changeState } = useI18n();
  return <span className={chip(CHANGE_TONE[state])}>{changeState(state)}</span>;
}
