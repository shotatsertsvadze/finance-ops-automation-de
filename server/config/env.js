/**
 * A numeric setting from the environment, or the start stops. A typo must not
 * become NaN and surface later as a 500 on every request (ADR-073).
 */
export function envNumber(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}, env = process.env) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} muss eine Zahl von ${min} bis ${max} sein, nicht "${raw}"`);
  }
  return value;
}
