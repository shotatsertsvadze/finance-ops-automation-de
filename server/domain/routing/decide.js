import { SEVERITY, failedWith } from "../checks.js";
import { requiredApprovalSteps } from "../../config/policy.js";

/**
 * Deterministic routing. Pure function; the caller persists the result and
 * performs the transition. Order matters: technical failures first, then
 * business failures, then the amount policy. Unknown amount fails closed.
 */
export function decide({ technicalChecks, businessChecks, grossCents, policy, hadException = false }) {
  const techFailed = failedWith(technicalChecks, [SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW]);
  if (techFailed.length) {
    return review("TECHNICAL_VALIDATION_FAILED", techFailed);
  }
  const high = failedWith(businessChecks, [SEVERITY.HIGH]);
  const medium = failedWith(businessChecks, [SEVERITY.MEDIUM]);
  if (high.length || medium.length) {
    const lead = high[0] ?? medium[0];
    return review(lead.check.toUpperCase(), [...high, ...medium]);
  }
  if (grossCents === null) {
    return review("AMOUNT_UNKNOWN", [{ check: "gross_amount", reason: "Bruttobetrag nicht bestimmbar" }]);
  }
  // A discount covering the line total, or a prepayment covering the gross,
  // leaves nothing to pay. Zero is a known amount, so it would otherwise pass
  // the guard above and auto-approve a payment run for nothing.
  if (grossCents <= 0) {
    return review("NOTHING_TO_PAY", [{ check: "gross_amount", reason: "Zahlbetrag ist null oder negativ" }]);
  }
  const requiredSteps = requiredApprovalSteps(policy, grossCents);
  // A document that was ever an exception does not become straight-through
  // just because the master data behind it was corrected (ADR-019).
  if (hadException && requiredSteps.length === 0) {
    return {
      decision: "APPROVAL", targetState: "READY_FOR_APPROVAL", reviewReason: null,
      requiredSteps: [{ step_no: 1, required_role: "MANAGER" }],
      reasons: ["Rechnung war zuvor ein Ausnahmefall: Freigabe durch einen Menschen erforderlich"],
    };
  }
  if (requiredSteps.length === 0) {
    return { decision: "AUTO_APPROVE", targetState: "APPROVED", reviewReason: null, requiredSteps, reasons: [`Bruttobetrag innerhalb der Auto-Grenze (${policy.autoApproveLimitCents / 100} EUR), alle Prüfungen bestanden`] };
  }
  return { decision: "APPROVAL", targetState: "READY_FOR_APPROVAL", reviewReason: null, requiredSteps, reasons: [`Freigabe durch ${requiredSteps.map((s) => s.required_role).join(" + ")} laut Betragsstufe`] };
}

function review(reviewReason, checks) {
  return {
    decision: "REVIEW",
    targetState: "REVIEW_REQUIRED",
    reviewReason,
    requiredSteps: [],
    reasons: checks.map((c) => `${c.check}: ${c.reason}`),
  };
}
