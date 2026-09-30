import { createHash } from "node:crypto";

/**
 * A change to a supplier's trusted bank accounts (ADR-077). Proposing,
 * verifying and approving are three people's acts; the row carries how many
 * distinct people its policy required, so the rule it is judged by is the one
 * in force when it was proposed.
 */
export const CHANGE_TRANSITIONS = {
  PROPOSED: ["VERIFIED", "REJECTED", "CANCELLED"],
  VERIFIED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};
export const CHANGE_STATES = Object.keys(CHANGE_TRANSITIONS);
export const OPEN_CHANGE_STATES = ["PROPOSED", "VERIFIED"];

export const canMoveChange = (from, to) => CHANGE_TRANSITIONS[from]?.includes(to) ?? false;

/** Why this person may not take this step on this change; null when they may. */
export function separationRefusal(change, actorId, step) {
  if (step === "cancel") return actorId === change.proposed_by ? null : "ONLY_PROPOSER_CAN_CANCEL";
  if (step === "verify") return actorId === change.proposed_by ? "PROPOSER_CANNOT_VERIFY" : null;
  if (actorId === change.proposed_by) return "PROPOSER_CANNOT_DECIDE";
  if (step === "approve" && change.required_distinct_actors >= 3 && actorId === change.verified_by) {
    return "VERIFIER_CANNOT_APPROVE";
  }
  return null;
}

/**
 * What an approval is given for: the account proposed, for which supplier,
 * against which trusted accounts, under which policy. The verification stores
 * the hash it confirmed and the approval compares both, so evidence gathered
 * for one proposal cannot carry another.
 */
export function proposalHash({ supplierId, iban, bic, trustedIbans, sourceInvoiceId, requiredDistinctActors }) {
  const bound = {
    supplier_id: supplierId,
    iban,
    bic: bic ?? null,
    trusted_ibans: [...trustedIbans].sort(),
    source_invoice_id: sourceInvoiceId ?? null,
    required_distinct_actors: requiredDistinctActors,
  };
  return createHash("sha256").update(JSON.stringify(bound)).digest("hex");
}
