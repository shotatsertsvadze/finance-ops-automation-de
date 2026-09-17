import { canTransition } from "./states.js";
import { syncCommitment } from "../purchase-orders/commitments.js";

/**
 * A refusal carries a stable `code` as well as its German sentence. The
 * sentence is what the server has always said and what a non-UI caller reads;
 * the code is what lets the client say it in the reader's language, the same
 * way a check is rendered from its check_code (ADR-042).
 */
export class TransitionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.status = 409;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.status = 404;
    this.code = code;
    this.details = details;
  }
}

export const SYSTEM = { type: "SYSTEM", id: null };
export const human = (userId) => ({ type: "HUMAN", id: userId });

/**
 * The only way an invoice changes state. Locks the row, checks the transition
 * table, updates the state and writes the audit event in the caller's
 * transaction. `client` must be a transaction client.
 */
export async function transition(client, { invoiceId, to, actor, action, reason = null, evidence = {}, reviewReason = null }) {
  const { rows } = await client.query("select state from finops.invoices where id = $1 for update", [invoiceId]);
  if (!rows[0]) throw new NotFoundError("INVOICE_NOT_FOUND", `Rechnung ${invoiceId} nicht gefunden`);
  const from = rows[0].state;
  if (!canTransition(from, to)) {
    throw new TransitionError("TRANSITION_NOT_ALLOWED", `Übergang ${from} -> ${to} ist nicht erlaubt`, { from, to, action });
  }
  await client.query(
    "update finops.invoices set state = $2, review_reason = $3, updated_at = now() where id = $1",
    [invoiceId, to, reviewReason],
  );
  await writeEvent(client, { invoiceId, actor, action, fromState: from, toState: to, reason, evidence });
  // A purchase order is a spending limit, so the claim on it belongs to the
  // state change, not to whichever caller remembered to adjust it.
  await syncCommitment(client, invoiceId, to);
  return { from, to };
}

/** Audit an action that does not change state (e.g. a single approval step). */
export async function recordEvent(client, { invoiceId, actor, action, reason = null, evidence = {} }) {
  const { rows } = await client.query("select state from finops.invoices where id = $1", [invoiceId]);
  if (!rows[0]) throw new NotFoundError("INVOICE_NOT_FOUND", `Rechnung ${invoiceId} nicht gefunden`);
  await writeEvent(client, { invoiceId, actor, action, fromState: rows[0].state, toState: rows[0].state, reason, evidence });
}

export async function writeEvent(client, { invoiceId, actor, action, fromState, toState, reason, evidence }) {
  if (actor.type === "HUMAN" && !actor.id) throw new TransitionError("HUMAN_ACTION_WITHOUT_ACTOR", "Menschliche Aktion ohne Akteur", { action });
  await client.query(
    `insert into finops.audit_events (invoice_id, actor_type, actor_id, action, from_state, to_state, reason, evidence)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [invoiceId, actor.type, actor.id, action, fromState, toState, reason, JSON.stringify(evidence)],
  );
}
