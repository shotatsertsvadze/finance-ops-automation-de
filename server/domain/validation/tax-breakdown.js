import { SEVERITY, failed, passed } from "../checks.js";
import { centsToDecimal, productToCents, toCents } from "../money.js";
import { taxKeyFor } from "../../config/tax-keys.js";

const EXPECTED = "je Steuersatz: Steuerschlüssel vorhanden, Steuer = Basis x Satz; Summe = Netto und Steuer";

/**
 * Can the document's tax breakdown be booked, one line per rate? Pure
 * function. A booking line carries one tax key, so every rate needs one, and
 * the lines must add up to the totals the document declares: the booking is
 * built from these lines, not from the totals (ADR-053).
 *
 * A line's tax is compared with its base times its rate within the policy's
 * tolerance, as the totals chain is. The sums are compared exactly, because
 * EN 16931 defines them as sums.
 */
export function checkTaxBreakdown(parsed, policy) {
  const subtotals = parsed.taxSubtotals ?? [];
  const fail = (actual, reason) => failed("tax_breakdown_bookable", SEVERITY.HIGH, { expected: EXPECTED, actual, reason });
  if (subtotals.length === 0) return fail("(keine Aufschlüsselung)", "Die Rechnung schlüsselt die Steuer nicht nach Sätzen auf");

  const described = subtotals.map((s) => `${s.category ?? "?"} ${s.percent ?? "?"} %: ${s.taxable ?? "?"} / ${s.amount ?? "?"}`).join("; ");
  const problems = subtotals.flatMap(problemsOf(policy));
  if (problems.length) return fail(described, problems.join("; "));

  const sum = (field) => subtotals.reduce((total, s) => total + toCents(s[field]), 0);
  const net = toCents(parsed.totals.taxExclusive);
  const tax = toCents(parsed.totals.taxAmount);
  if (sum("taxable") !== net || sum("amount") !== tax) {
    return fail(
      `${described}; Summe ${centsToDecimal(sum("taxable"))} / ${centsToDecimal(sum("amount"))}`,
      `Aufschlüsselung ergibt nicht Netto ${parsed.totals.taxExclusive} und Steuer ${parsed.totals.taxAmount}`,
    );
  }
  return passed("tax_breakdown_bookable", SEVERITY.HIGH, { expected: EXPECTED, actual: described, reason: "Steuer je Satz buchbar" });
}

const problemsOf = (policy) => (s) => {
  const label = `${s.category ?? "?"} ${s.percent ?? "?"} %`;
  const taxable = toCents(s.taxable);
  const amount = toCents(s.amount);
  if (taxable === null || amount === null) return [`${label}: Betrag nicht lesbar`];
  if (!taxKeyFor(s.category, s.percent)) return [`${label}: kein Steuerschlüssel hinterlegt`];
  const expected = productToCents(s.taxable, s.percent, "100");
  if (expected === null || Math.abs(expected - amount) > policy.totalsToleranceCents) {
    return [`${label}: Steuer ${s.amount}, erwartet ${centsToDecimal(expected)}`];
  }
  return [];
};
