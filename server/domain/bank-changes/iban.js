/** Spaces out, capitals in: the form master data and the parser both store. */
export function normalizeIban(value) {
  if (value === null || value === undefined) return null;
  return String(value).replace(/\s+/g, "").toUpperCase();
}

/**
 * ISO 13616 shape and mod-97 check digits. A typo in a proposed account is
 * caught here rather than by the person on the phone.
 */
export function isValidIban(iban) {
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban ?? "")) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
