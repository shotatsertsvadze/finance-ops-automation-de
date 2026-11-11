import { SEVERITY, failedWith } from "../checks.js";
import { runBusinessChecks } from "../validation/business-checks.js";
import { loadMasterData } from "../validation/lookup.js";

/**
 * Business facts, re-examined at the moment someone signs.
 *
 * Validation happens once, at intake. Master data does not: a supplier can be
 * blocked, a bank account retired or a purchase order consumed while an invoice
 * waits for a signature. `payableBlockers` alone covers missing fields and
 * unreadable structure, so a blocked supplier would be approved and paid on
 * the strength of a check run days earlier (ADR-041).
 *
 * The document itself cannot change (ADR-033), so this re-reads the stored
 * parse rather than the file, and only master data can move the answer.
 */

/**
 * Failures that have appeared since the last validation run.
 *
 * The distinction is the whole point. An invoice released from review still
 * carries the check that sent it there: a reviewer looked at that IBAN and
 * accepted it. Treating every failure as fresh would refuse every reviewed
 * exception and make review pointless. Only a check that was not failing then
 * and is failing now is new information.
 *
 * Severities match the routing rule, so the gate stops exactly what intake
 * would have stopped.
 */
export async function newBusinessFailures(client, invoice, policy, company) {
  if (!invoice.parsed) return null;

  const master = await loadMasterData(client, invoice.parsed, { excludeInvoiceId: invoice.id });
  const { checks } = runBusinessChecks(invoice.parsed, master, policy, company);

  const before = await previousStatuses(client, invoice.id);
  const failing = failedWith(checks, [SEVERITY.HIGH, SEVERITY.MEDIUM]);
  const fresh = failing.filter((c) => before.get(c.check) !== "FAILED");

  return { checks, fresh };
}

/** What the most recent run said about each business check. */
async function previousStatuses(client, invoiceId) {
  const { rows } = await client.query(
    `select check_code, status from finops.validation_results
     where invoice_id = $1
       and phase = 'BUSINESS'
       and run_no = (select max(run_no) from finops.validation_results where invoice_id = $1)`,
    [invoiceId],
  );
  return new Map(rows.map((r) => [r.check_code, r.status]));
}

/**
 * Records the re-check as a complete validation run, so the reviewer opens the
 * invoice and sees the current picture rather than the one that let it through.
 *
 * The technical results are carried forward from the previous run instead of
 * being recomputed: the document is an intake fact and cannot have changed, so
 * copying them states a fact rather than guessing one.
 */
export async function recordRecheck(client, invoiceId, checks) {
  const {
    rows: [{ run_no: runNo }],
  } = await client.query("select coalesce(max(run_no), 0) + 1 as run_no from finops.validation_results where invoice_id = $1", [invoiceId]);

  await client.query(
    `insert into finops.validation_results
       (invoice_id, run_no, phase, check_code, status, severity, expected, actual, reason, recommended_action)
     select invoice_id, $2, phase, check_code, status, severity, expected, actual, reason, recommended_action
     from finops.validation_results
     where invoice_id = $1 and phase = 'TECHNICAL' and run_no = $3`,
    [invoiceId, runNo, runNo - 1],
  );

  for (const c of checks) {
    await client.query(
      `insert into finops.validation_results
         (invoice_id, run_no, phase, check_code, status, severity, expected, actual, reason, recommended_action)
       values ($1, $2, 'BUSINESS', $3, $4, $5, $6, $7, $8, $9)`,
      [invoiceId, runNo, c.check, c.status, c.severity, c.expected, c.actual, c.reason, c.recommended_action],
    );
  }
  return runNo;
}
