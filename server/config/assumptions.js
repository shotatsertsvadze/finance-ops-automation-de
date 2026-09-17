/**
 * Economic assumptions for the savings estimate. These are scenario inputs
 * from docs/IST_PROCESS.md, not measurements of anyone's actual process, and
 * the dashboard shows them next to every figure they produce.
 */
const num = (value, fallback) => (value === undefined || value === "" ? fallback : Number(value));

export function loadAssumptions(env = process.env) {
  return {
    manual_minutes_clean: num(env.ASSUME_MANUAL_MINUTES_CLEAN, 6),
    manual_minutes_exception: num(env.ASSUME_MANUAL_MINUTES_EXCEPTION, 25),
    system_minutes_clean: num(env.ASSUME_SYSTEM_MINUTES_CLEAN, 1),
    system_minutes_exception: num(env.ASSUME_SYSTEM_MINUTES_EXCEPTION, 8),
    hourly_cost_eur: num(env.ASSUME_HOURLY_COST_EUR, 45),
    source: "docs/IST_PROCESS.md, Annahmen, nicht gemessen",
  };
}
