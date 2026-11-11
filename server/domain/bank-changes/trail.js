import { NotFoundError, TransitionError } from "../errors.js";
import { canMoveChange } from "./rules.js";

export async function lockChange(client, changeId) {
  const {
    rows: [change],
  } = await client.query("select * from finops.bank_account_changes where id = $1 for update", [changeId]);
  if (!change) throw new NotFoundError("CHANGE_NOT_FOUND", "Änderung der Bankverbindung nicht gefunden");
  return change;
}

export const stateConflict = (change) =>
  new TransitionError("CHANGE_STATE_CONFLICT", `${change.change_no} ist im Status ${change.state}; diese Aktion ist nicht mehr möglich`, {
    state: change.state,
  });

/**
 * The only way a change moves, the counterpart of transition() for invoices
 * (ADR-002): checks the table, writes the state and the decision columns, and
 * the event in the same transaction. `set` names columns from code, never input.
 */
export async function moveChange(client, change, { to, actor, action, reason = null, evidence = {}, set = {} }) {
  if (!canMoveChange(change.state, to)) throw stateConflict(change);
  const columns = Object.keys(set);
  const {
    rows: [moved],
  } = await client.query(
    `update finops.bank_account_changes set state = $2${columns.map((c, i) => `, ${c} = $${i + 3}`).join("")}
     where id = $1 returning *`,
    [change.id, to, ...Object.values(set)],
  );
  await writeChangeEvent(client, { changeId: change.id, actor, action, fromState: change.state, toState: to, reason, evidence });
  return moved;
}

export async function writeChangeEvent(client, { changeId, actor, action, fromState, toState, reason = null, evidence = {} }) {
  await client.query(
    `insert into finops.bank_change_events (change_id, actor_type, actor_id, action, from_state, to_state, reason, evidence)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [changeId, actor.type, actor.id, action, fromState, toState, reason, JSON.stringify(evidence)],
  );
}
