/**
 * ISO calendar dates. A shape-only regex accepts 2026-02-30, which Postgres
 * then rejects at insert time and takes the whole transaction down with it.
 */
export function parseIsoDate(value) {
  const text = (value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return real ? text : null;
}

export const isValidIsoDate = (value) => parseIsoDate(value) !== null;

// Nordwerk books in German time; UTC is up to two hours behind it.
const BERLIN_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * Today's date in Germany, as YYYY-MM-DD: the booking date and the day due
 * dates are measured against, whatever the server's or database's zone
 * (ADR-072).
 */
export const businessDate = (at = new Date()) => BERLIN_DATE.format(at);
