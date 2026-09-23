import { toCents } from "../domain/money.js";

/**
 * Tax keys by VAT category (UNTDID 5305) and rate. Demo assignments, not a
 * certified SKR or DATEV mapping (ADR-018). A combination not listed here has
 * no key, and an invoice carrying it is not booked on a guess (ADR-053):
 * reverse charge (AE), for one, is not tax-free just because its rate is 0.
 */
const TAX_KEYS = {
  "S:1900": "9",
  "S:700": "8",
  "Z:0": "0",
  "E:0": "0",
};

/** The tax key for a category and a rate such as "19" or "19.00"; null if unmapped. */
export function taxKeyFor(category, percent) {
  const rate = toCents(percent);
  if (!category || rate === null) return null;
  return TAX_KEYS[`${category.toUpperCase()}:${rate}`] ?? null;
}
