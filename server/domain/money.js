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
