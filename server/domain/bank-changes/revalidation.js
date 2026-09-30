import { withTransaction } from "../../db.js";
import { processInTransaction } from "../intake/intake.js";
import { latestRunNo } from "../approvals/binding.js";
import { SYSTEM } from "../workflow/transitions.js";
import { log } from "../../log.js";
import { approveChange } from "./changes.js";
import { lockChange, stateConflict, writeChangeEvent } from "./trail.js";

/**
 * Approving commits master data first; the invoices it concerns are validated
 * again afterwards, each on its own. One invoice that fails must not undo a
 * verified account, and the retry picks up what is left (ADR-077).
 */
export async function approveAndRevalidate(deps, input) {
  const approved = await approveChange(deps, input);
  const revalidation = await revalidateChange(deps, input.changeId, SYSTEM);
  return { ...approved, revalidation };
}

/**
 * Invoices of the change's supplier that carry its IBAN, are still open for a
 * decision and have not been revalidated for this change yet. INFO_REQUESTED
 * is among them only to be reported: a person's open question is answered by
 * a person, and then the retry takes it.
 */
async function candidates(pool, change) {
  const { rows } = await pool.query(
    `select i.id, i.invoice_number from finops.invoices i
     where i.supplier_id = $1 and i.supplier_iban_raw = $2 and i.state in ('REVIEW_REQUIRED', 'INFO_REQUESTED')
       and not exists (select 1 from finops.bank_change_revalidations r where r.change_id = $3 and r.invoice_id = i.id)
     order by i.received_at, i.id`,
    [change.supplier_id, change.proposed_iban, change.id],
  );
  return rows;
}

async function failedIbanMatch(client, invoiceId, runNo) {
  const { rows } = await client.query(
    "select 1 from finops.validation_results where invoice_id = $1 and run_no = $2 and check_code = 'supplier_iban_match' and status = 'FAILED'",
    [invoiceId, runNo],
  );
  return rows.length > 0;
}

/**
 * One invoice: the run and its link to the change commit together or not at
 * all, and the lock on the invoice makes a second retry wait and then find
 * the link.
 */
async function revalidateOne(deps, change, invoiceId, actor) {
  return withTransaction(deps.pool, async (client) => {
    const { rows: [invoice] } = await client.query("select state from finops.invoices where id = $1 for update", [invoiceId]);
    if (invoice.state === "INFO_REQUESTED") return "waiting";
    if (invoice.state !== "REVIEW_REQUIRED") return "skipped";
    const { rows: linked } = await client.query(
      "select 1 from finops.bank_change_revalidations where change_id = $1 and invoice_id = $2", [change.id, invoiceId],
    );
    const fromRun = await latestRunNo(client, invoiceId);
    if (linked.length || !(await failedIbanMatch(client, invoiceId, fromRun))) return "skipped";

    const after = await processInTransaction(client, deps, invoiceId, actor, { bank_change_id: change.id, change_no: change.change_no });
    const toRun = await latestRunNo(client, invoiceId);
    await client.query(
      `insert into finops.bank_change_revalidations (change_id, invoice_id, from_state, to_state, from_run_no, to_run_no)
       values ($1, $2, 'REVIEW_REQUIRED', $3, $4, $5)`,
      [change.id, invoiceId, after.state, fromRun, toRun],
    );
    return { to_state: after.state, from_run_no: fromRun, to_run_no: toRun };
  });
}

/** The change is complete once nothing is left waiting or failed; recorded once. */
async function markComplete(pool, changeId, actor) {
  await withTransaction(pool, async (client) => {
    const change = await lockChange(client, changeId);
    if (change.revalidated_at) return;
    await client.query("update finops.bank_account_changes set revalidated_at = now() where id = $1", [changeId]);
    await writeChangeEvent(client, { changeId, actor, action: "revalidation_completed", fromState: change.state, toState: change.state });
  });
}

export async function revalidateChange(deps, changeId, actor) {
  const change = await withTransaction(deps.pool, (client) => lockChange(client, changeId));
  if (change.state !== "APPROVED") throw stateConflict(change);

  const result = { revalidated: [], waiting: [], failed: [] };
  for (const { id, invoice_number: invoiceNumber } of await candidates(deps.pool, change)) {
    try {
      const outcome = await revalidateOne(deps, change, id, actor);
      if (outcome === "waiting") result.waiting.push({ invoice_id: id, invoice_number: invoiceNumber });
      else if (outcome !== "skipped") result.revalidated.push({ invoice_id: id, invoice_number: invoiceNumber, ...outcome });
    } catch (error) {
      log("warn", "bank change revalidation failed", { change_no: change.change_no, invoice_id: id, error: error.message });
      result.failed.push({ invoice_id: id, invoice_number: invoiceNumber });
    }
  }
  if (!result.waiting.length && !result.failed.length) await markComplete(deps.pool, changeId, actor);
  return result;
}
