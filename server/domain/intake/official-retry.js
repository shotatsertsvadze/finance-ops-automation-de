import { withTransaction } from "../../db.js";
import { log } from "../../log.js";
import { processInTransaction } from "./intake.js";

/**
 * The official validation of an invoice's latest run, if one was attempted.
 * A null verdict means the validator gave no answer to trust.
 */
const LATEST = `select o.run_no, o.outcome, o.verdict from finops.official_validations o
  where o.invoice_id = $1 and o.run_no = (select max(run_no) from finops.validation_results where invoice_id = $1)`;

/** Invoices in review whose latest run asked the validator and got no verdict. */
async function stranded(pool) {
  const { rows } = await pool.query(
    `select i.id from finops.invoices i
     join finops.official_validations o on o.invoice_id = i.id
       and o.run_no = (select max(run_no) from finops.validation_results where invoice_id = i.id)
     where i.state = 'REVIEW_REQUIRED' and o.verdict is null
     order by i.received_at, i.id`,
  );
  return rows.map((r) => r.id);
}

/**
 * One invoice, under its lock: still in review, still without a verdict, or
 * nothing happens, so a replayed or concurrent retry does not run it twice.
 */
async function retryOne(deps, invoiceId, actor) {
  return withTransaction(deps.pool, async (client) => {
    const { rows: [invoice] } = await client.query("select state from finops.invoices where id = $1 for update", [invoiceId]);
    const { rows: [before] } = await client.query(LATEST, [invoiceId]);
    if (invoice.state !== "REVIEW_REQUIRED" || !before || before.verdict !== null) return null;
    const after = await processInTransaction(client, deps, invoiceId, actor, { official_validation_retry: true, previous_run: before.run_no });
    const { rows: [now] } = await client.query(LATEST, [invoiceId]);
    return { invoice_id: invoiceId, from_run: before.run_no, to_run: now.run_no, outcome: now.outcome, state: after.state };
  });
}

/**
 * After the validator was down: validates the stranded invoices again, each as
 * a new run beside the failed one (ADR-078). Asks the validator first, so a
 * retry while it is still down adds nothing to the record.
 */
export async function retryOfficialValidation(deps, actor) {
  const client = deps.officialValidator?.client;
  if (!client || !(await client.available())) return { validator_available: false, retried: [], failed: [] };
  const result = { validator_available: true, retried: [], failed: [] };
  for (const invoiceId of await stranded(deps.pool)) {
    try {
      const retried = await retryOne(deps, invoiceId, actor);
      if (retried) result.retried.push(retried);
    } catch (error) {
      log("warn", "official validation retry failed", { invoice_id: invoiceId, error: error.message });
      result.failed.push(invoiceId);
    }
  }
  return result;
}
