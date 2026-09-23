/**
 * Approval rounds (ADR-067). Each release into approval starts a new round;
 * the rounds before it stay, cancelled, as the record of who signed what.
 */

/** SQL for "this invoice's live round", with the invoice id as `$1`. */
export const CURRENT_ROUND = "(select max(round) from finops.approval_steps where invoice_id = $1)";

/** Starts a new round with these steps. Nothing is written for none. */
export async function startRound(client, invoiceId, steps) {
  if (steps.length === 0) return;
  const { rows: [{ round }] } = await client.query(
    "select coalesce(max(round), 0) + 1 as round from finops.approval_steps where invoice_id = $1", [invoiceId],
  );
  for (const step of steps) {
    await client.query(
      "insert into finops.approval_steps (invoice_id, round, step_no, required_role) values ($1, $2, $3, $4)",
      [invoiceId, round, step.step_no, step.required_role],
    );
  }
}
