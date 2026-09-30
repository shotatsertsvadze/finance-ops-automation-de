import { withTransaction } from "../../db.js";
import { RuleError } from "../errors.js";
import { businessDate } from "../dates.js";
import { isValidIban, normalizeIban } from "./iban.js";
import { OPEN_CHANGE_STATES, hashOfChange, proposalHash, separationRefusal } from "./rules.js";
import { lockChange, moveChange, stateConflict, writeChangeEvent } from "./trail.js";
import { checkSourceInvoice, lockActiveSupplier, refuseKnownAccount, sharedWith, trustedIbansOf } from "./master-data.js";
import { checkCallback } from "./callback.js";

/**
 * A new trusted bank account for a supplier, in three people's steps
 * (ADR-077): proposed, verified by a call-back on the number on file, approved.
 * Only the approval writes master data, and it adds an account; the accounts
 * already trusted stay trusted. An invoice never reaches this code on its own:
 * its IBAN is at most cited as the reason for a proposal.
 */

const requireReason = (text) => {
  const reason = typeof text === "string" ? text.trim() : "";
  if (!reason) throw new RuleError(400, "REASON_REQUIRED", "Für diese Entscheidung ist eine Begründung erforderlich");
  return reason;
};

const SEPARATION = {
  PROPOSER_CANNOT_VERIFY: () => new RuleError(409, "PROPOSER_CANNOT_VERIFY", "Wer die Bankverbindung vorgeschlagen hat, darf sie nicht verifizieren"),
  PROPOSER_CANNOT_DECIDE: () => new RuleError(409, "PROPOSER_CANNOT_DECIDE", "Wer die Bankverbindung vorgeschlagen hat, darf über sie nicht entscheiden"),
  VERIFIER_CANNOT_APPROVE: () => new RuleError(409, "VERIFIER_CANNOT_APPROVE", "Wer den Rückruf geführt hat, darf die Bankverbindung nicht auch freigeben"),
  ONLY_PROPOSER_CAN_CANCEL: () => new RuleError(409, "ONLY_PROPOSER_CAN_CANCEL", "Nur wer den Vorschlag gemacht hat, kann ihn zurückziehen"),
};

function refuseSeparation(change, actorId, step) {
  const code = separationRefusal(change, actorId, step);
  if (code) throw SEPARATION[code]();
}

const BIC = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

export async function proposeChange({ pool, policy }, { supplierId, iban: rawIban, bic: rawBic = null, sourceInvoiceId = null, reason, actor }) {
  const iban = normalizeIban(rawIban);
  if (!isValidIban(iban)) throw new RuleError(400, "IBAN_INVALID", "IBAN ist ungültig (Aufbau oder Prüfziffer)", { iban: rawIban ?? null });
  const bic = normalizeIban(rawBic) || null;
  if (bic && !BIC.test(bic)) throw new RuleError(400, "BIC_INVALID", "BIC ist ungültig", { bic: rawBic });
  const text = requireReason(reason);

  return withTransaction(pool, async (client) => {
    await lockActiveSupplier(client, supplierId);
    const { rows: [open] } = await client.query(
      "select * from finops.bank_account_changes where supplier_id = $1 and state = any($2::finops.bank_change_state[])",
      [supplierId, OPEN_CHANGE_STATES],
    );
    if (open?.proposed_iban === iban) return { change: open, created: false };
    if (open) {
      throw new RuleError(409, "CHANGE_ALREADY_OPEN", `Für diesen Lieferanten ist bereits ${open.change_no} offen`, { change_id: open.id, change_no: open.change_no });
    }
    await refuseKnownAccount(client, supplierId, iban);
    if (sourceInvoiceId) await checkSourceInvoice(client, sourceInvoiceId, supplierId, iban);

    const trustedIbans = await trustedIbansOf(client, supplierId);
    const shared = await sharedWith(client, supplierId, iban);
    const requiredDistinctActors = policy.bankChangeDistinctActors;
    const hash = proposalHash({ supplierId, iban, bic, trustedIbans, sourceInvoiceId, requiredDistinctActors });
    const { rows: [change] } = await client.query(
      `insert into finops.bank_account_changes (supplier_id, proposed_iban, proposed_bic, trusted_ibans, shared_with,
         source_invoice_id, reason, proposal_sha256, required_distinct_actors, proposed_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
      [supplierId, iban, bic, trustedIbans, JSON.stringify(shared), sourceInvoiceId, text, hash, requiredDistinctActors, actor.id],
    );
    await writeChangeEvent(client, {
      changeId: change.id, actor, action: "proposed", fromState: null, toState: "PROPOSED", reason: text,
      evidence: { iban, trusted_ibans: trustedIbans, shared_with: shared, source_invoice_id: sourceInvoiceId, proposal_sha256: hash },
    });
    return { change, created: true };
  });
}

export async function verifyChange({ pool }, { changeId, actor, outcome, contactedRole, calledAt, ibanReadBack, reference, note }) {
  return withTransaction(pool, async (client) => {
    const change = await lockChange(client, changeId);
    const { rows: [earlier] } = await client.query("select verified_by from finops.bank_change_verifications where change_id = $1", [changeId]);
    if (earlier?.verified_by === actor.id) return { change, replayed: true };
    if (change.state !== "PROPOSED") throw stateConflict(change);
    refuseSeparation(change, actor.id, "verify");
    const call = checkCallback(change, { outcome, contactedRole, calledAt, ibanReadBack, reference, note });
    const { callback_phone: number } = await lockActiveSupplier(client, change.supplier_id);
    if (!number) throw new RuleError(409, "NO_CALLBACK_NUMBER", "Für den Lieferanten ist keine Rückrufnummer hinterlegt");

    await client.query(
      `insert into finops.bank_change_verifications (change_id, proposal_sha256, method, contact_number, contacted_role,
         called_at, iban_read_back, outcome, reference, note, verified_by)
       values ($1, $2, 'CALLBACK_KNOWN_NUMBER', $3, $4, $5, $6, $7, $8, $9, $10)`,
      [changeId, change.proposal_sha256, number, call.contactedRole, call.calledAt, call.ibanReadBack, call.outcome, call.reference, call.note, actor.id],
    );
    const evidence = {
      method: "CALLBACK_KNOWN_NUMBER", contact_number: number, contacted_role: call.contactedRole,
      called_at: call.calledAt, outcome: call.outcome, proposal_sha256: change.proposal_sha256, reference: call.reference,
    };
    const moved = call.outcome === "CONFIRMED"
      ? await moveChange(client, change, { to: "VERIFIED", actor, action: "verified", reason: call.note, evidence, set: { verified_by: actor.id, verified_at: new Date() } })
      : await moveChange(client, change, {
          to: "REJECTED", actor, action: "verification_denied", reason: call.note, evidence,
          set: { decided_by: actor.id, decided_at: new Date(), decision_reason: call.note ?? "Rückruf: Lieferant bestätigt die Bankverbindung nicht" },
        });
    return { change: moved, replayed: false };
  });
}

/** The verification must be for exactly this proposal, which must be as it was proposed. */
async function checkEvidence(client, change) {
  const { rows: [v] } = await client.query("select * from finops.bank_change_verifications where change_id = $1", [change.id]);
  const bound = v?.outcome === "CONFIRMED"
    && v.proposal_sha256 === change.proposal_sha256
    && hashOfChange(change) === change.proposal_sha256
    && v.iban_read_back === change.proposed_iban;
  if (!bound) throw new RuleError(409, "EVIDENCE_MISMATCH", "Die Verifizierung passt nicht zu diesem Vorschlag; neu vorschlagen");
}

/** The trusted accounts must still be the ones the proposal was made against. */
async function checkMasterData(client, change) {
  await refuseKnownAccount(client, change.supplier_id, change.proposed_iban);
  const now = await trustedIbansOf(client, change.supplier_id);
  if (JSON.stringify(now) !== JSON.stringify([...change.trusted_ibans].sort())) {
    throw new RuleError(409, "MASTER_DATA_CHANGED", "Die Bankverbindungen des Lieferanten haben sich seit dem Vorschlag geändert; neu vorschlagen", {
      proposed_against: change.trusted_ibans, now,
    });
  }
}

export async function approveChange({ pool }, { changeId, actor, acknowledgeSharedIban = false, comment = null }) {
  return withTransaction(pool, async (client) => {
    const change = await lockChange(client, changeId);
    if (change.state === "APPROVED" && change.decided_by === actor.id) return { change, replayed: true };
    if (change.state === "PROPOSED") throw new RuleError(409, "CHANGE_NOT_VERIFIED", "Ohne Verifizierung durch Rückruf keine Freigabe");
    if (change.state !== "VERIFIED") throw stateConflict(change);
    refuseSeparation(change, actor.id, "approve");
    await lockActiveSupplier(client, change.supplier_id);
    await checkEvidence(client, change);
    await checkMasterData(client, change);
    const shared = await sharedWith(client, change.supplier_id, change.proposed_iban);
    if (shared.length && acknowledgeSharedIban !== true) {
      throw new RuleError(409, "SHARED_IBAN_NOT_ACKNOWLEDGED", "Diese IBAN ist auch bei einem anderen Lieferanten hinterlegt; ausdrücklich bestätigen", { shared_with: shared });
    }

    const { rows: [account] } = await client.query(
      `insert into finops.supplier_bank_accounts (supplier_id, iban, bic, status, valid_from, trusted_by_change_id)
       values ($1, $2, $3, 'ACTIVE', $4, $5) returning id`,
      [change.supplier_id, change.proposed_iban, change.proposed_bic, businessDate(), change.id],
    );
    const reason = typeof comment === "string" && comment.trim() ? comment.trim() : null;
    const moved = await moveChange(client, change, {
      to: "APPROVED", actor, action: "approved", reason,
      evidence: {
        bank_account_id: account.id, iban: change.proposed_iban, proposal_sha256: change.proposal_sha256,
        shared_with: shared, shared_iban_acknowledged: shared.length > 0,
      },
      set: { decided_by: actor.id, decided_at: new Date(), decision_reason: reason, bank_account_id: account.id },
    });
    return { change: moved, replayed: false };
  });
}

/** Rejecting or cancelling ends an open change; neither touches master data. */
async function close({ pool }, { changeId, actor, comment }, { to, step, action }) {
  const reason = requireReason(comment);
  return withTransaction(pool, async (client) => {
    const change = await lockChange(client, changeId);
    if (change.state === to && change.decided_by === actor.id) return { change, replayed: true };
    if (!OPEN_CHANGE_STATES.includes(change.state)) throw stateConflict(change);
    refuseSeparation(change, actor.id, step);
    const moved = await moveChange(client, change, {
      to, actor, action, reason, set: { decided_by: actor.id, decided_at: new Date(), decision_reason: reason },
    });
    return { change: moved, replayed: false };
  });
}

export const rejectChange = (deps, input) => close(deps, input, { to: "REJECTED", step: "reject", action: "rejected" });
export const cancelChange = (deps, input) => close(deps, input, { to: "CANCELLED", step: "cancel", action: "cancelled" });
