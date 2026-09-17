/**
 * Routing and approval policy. Demo assumptions for Nordwerk GmbH, not legal
 * requirements. Amounts in cents. Every value can be overridden by env.
 */
const num = (value, fallback) => (value === undefined || value === "" ? fallback : Number(value));
const bool = (value, fallback) => (value === undefined || value === "" ? fallback : value === "true");

export function loadPolicy(env = process.env) {
  return {
    version: "demo-2026-09",
    autoApproveLimitCents: num(env.POLICY_AUTO_APPROVE_LIMIT, 500) * 100,
    tier1LimitCents: num(env.POLICY_TIER_1_LIMIT, 5000) * 100,
    tier2LimitCents: num(env.POLICY_TIER_2_LIMIT, 25000) * 100,
    poTolerancePct: num(env.POLICY_PO_TOLERANCE_PCT, 2),
    poToleranceMinCents: num(env.POLICY_PO_TOLERANCE_MIN, 10) * 100,
    poRequiredAboveCents: num(env.POLICY_PO_REQUIRED_ABOVE, 500) * 100,
    fourEyesAfterReview: bool(env.POLICY_FOUR_EYES_AFTER_REVIEW, true),
    allowedCurrencies: ["EUR"],
    totalsToleranceCents: 1,
  };
}

/** Approval steps required for a gross amount. Empty list means straight-through. */
export function requiredApprovalSteps(policy, grossCents) {
  const roles = [];
  if (grossCents <= policy.autoApproveLimitCents) return roles;
  roles.push("MANAGER");
  if (grossCents > policy.tier1LimitCents) roles.push("FINANCE");
  if (grossCents > policy.tier2LimitCents) roles.push("CFO");
  return roles.map((required_role, i) => ({ step_no: i + 1, required_role }));
}

/**
 * Steps required once a human has released an invoice from review. Always at
 * least one, so an exception is never waved through by the reviewer alone
 * (ADR-010), even when the amount is under the auto-approve limit.
 */
export function stepsAfterReview(policy, grossCents) {
  const steps = requiredApprovalSteps(policy, grossCents);
  return steps.length ? steps : [{ step_no: 1, required_role: "MANAGER" }];
}

export function approvalTierLabel(policy, grossCents) {
  if (grossCents <= policy.autoApproveLimitCents) return "AUTO";
  if (grossCents <= policy.tier1LimitCents) return "MANAGER";
  if (grossCents <= policy.tier2LimitCents) return "MANAGER+FINANCE";
  return "MANAGER+FINANCE+CFO";
}
