/**
 * Routing and approval policy. Demo assumptions for Nordwerk GmbH, not legal
 * requirements. Amounts in cents. Every value can be overridden by env.
 */
/** A misconfigured threshold must stop the process, not silently become NaN
 *  and drop a 30.000-EUR invoice to a single approver. */
const num = (name, value, fallback) => {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} ist keine gültige Betragsgrenze: "${value}"`);
  }
  return parsed;
};
const bool = (value, fallback) => (value === undefined || value === "" ? fallback : value === "true");

export function loadPolicy(env = process.env) {
  const policy = {
    version: "demo-2026-09",
    autoApproveLimitCents: num("POLICY_AUTO_APPROVE_LIMIT", env.POLICY_AUTO_APPROVE_LIMIT, 500) * 100,
    tier1LimitCents: num("POLICY_TIER_1_LIMIT", env.POLICY_TIER_1_LIMIT, 5000) * 100,
    tier2LimitCents: num("POLICY_TIER_2_LIMIT", env.POLICY_TIER_2_LIMIT, 25000) * 100,
    poTolerancePct: num("POLICY_PO_TOLERANCE_PCT", env.POLICY_PO_TOLERANCE_PCT, 2),
    poToleranceMinCents: num("POLICY_PO_TOLERANCE_MIN", env.POLICY_PO_TOLERANCE_MIN, 10) * 100,
    poRequiredAboveCents: num("POLICY_PO_REQUIRED_ABOVE", env.POLICY_PO_REQUIRED_ABOVE, 500) * 100,
    fourEyesAfterReview: bool(env.POLICY_FOUR_EYES_AFTER_REVIEW, true),
    allowedCurrencies: ["EUR"],
    totalsToleranceCents: 1,
  };

  // Tiers must climb. Out-of-order limits would place a large invoice in a
  // lower tier than a small one.
  if (!(policy.autoApproveLimitCents <= policy.tier1LimitCents && policy.tier1LimitCents <= policy.tier2LimitCents)) {
    throw new Error(
      "Freigabegrenzen sind nicht in aufsteigender Reihenfolge (auto <= Stufe 1 <= Stufe 2): " +
        `${policy.autoApproveLimitCents / 100} / ${policy.tier1LimitCents / 100} / ${policy.tier2LimitCents / 100}`,
    );
  }
  return policy;
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
