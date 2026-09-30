import { useI18n } from "../lib/i18n.js";
import { STATE_TONE, chip } from "../lib/tones.js";

export default function StateChip({ state }) {
  const { state: label } = useI18n();
  return <span className={chip(STATE_TONE[state])}>{label(state)}</span>;
}
