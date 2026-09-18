/** Money as integer cents. Decimal strings only; anything else is null (fail closed). */
export function toCents(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return null;
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

/**
 * A decimal string as { digits, scale }, so that value = digits / 10^scale.
 * Anything that is not a plain decimal number is null (fail closed).
 */
function decimal(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return { digits: BigInt(whole + fraction), scale: fraction.length };
}

/** num/den as an integer, rounding a half away from zero. */
function divideRounding(num, den) {
  if (den === 0n) return null;
  const negative = (num < 0n) !== (den < 0n);
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const magnitude = (2n * n + d) / (2n * d);
  return negative ? -magnitude : magnitude;
}

/**
 * quantity x unit price / base quantity, in cents.
 *
 * Exact rather than floating point, and deliberately so: a price may carry
 * four decimals and the check that uses this tolerates one cent, so a rounding
 * error of one cent would refuse a correct invoice. Null when any part is not
 * a decimal number, or the base quantity is zero.
 */
export function productToCents(quantity, unitPrice, baseQuantity = "1") {
  const q = decimal(quantity);
  const p = decimal(unitPrice);
  const b = decimal(baseQuantity);
  if (!q || !p || !b || b.digits === 0n) return null;

  const numerator = q.digits * p.digits * 100n * 10n ** BigInt(b.scale);
  const denominator = b.digits * 10n ** BigInt(q.scale + p.scale);
  const cents = divideRounding(numerator, denominator);
  return cents === null ? null : Number(cents);
}

export function centsToDecimal(cents) {
  if (cents === null || cents === undefined) return null;
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatEur(cents) {
  if (cents === null || cents === undefined) return "-";
  return `${centsToDecimal(cents).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")} EUR`;
}
