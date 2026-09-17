/**
 * Pure formatting helpers that do not depend on the display language.
 * Labels and locale-aware formatting live in `dictionaries.js` and `i18n.js`;
 * keeping a second copy of the German labels here would let the two drift.
 */
export const groupIban = (iban) => (iban ?? "").replace(/(.{4})/g, "$1 ").trim();

/**
 * Character-level comparison for identifiers. An AP clerk checking a changed
 * IBAN needs to see where it differs, not just that it differs.
 */
export function diffChars(expected, actual) {
  const a = (expected ?? "").toUpperCase();
  const b = (actual ?? "").toUpperCase();
  return [...b].map((char, i) => ({ char, differs: a[i] !== char }));
}

export const isSingleIdentifier = (value) => typeof value === "string" && /^[A-Z0-9]{10,40}$/i.test(value.trim());
