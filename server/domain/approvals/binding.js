import { toCents } from "../money.js";

/**
 * What an approval was given for. A decision names the document, the
 * validation run whose results the approver saw, and the amount at that
 * moment, so a later gate can check that it is still signing the same thing.
 */
export function bindingOf(invoice, runNo) {
  return {
    document_sha256: invoice.file_sha256,
    validation_run_no: runNo,
    decided_gross: invoice.gross_amount,
  };
}

/** The validation run an approver would be looking at right now. */
export async function latestRunNo(client, invoiceId) {
  const { rows: [row] } = await client.query(
    "select coalesce(max(run_no), 0) as run_no from finops.validation_results where invoice_id = $1",
    [invoiceId],
  );
  return row.run_no;
}

const FIELDS = [
  ["document_sha256", (a, b) => a === b],
  ["validation_run_no", (a, b) => Number(a) === Number(b)],
  ["decided_gross", (a, b) => toCents(a) === toCents(b)],
];

/**
 * Where the invoice as it stands now disagrees with a decision already taken.
 * Steps decided before this column existed carry no binding and are skipped:
 * an absent record is not evidence of a change.
 */
export function bindingDrift(binding, decidedSteps) {
  const drift = [];
  for (const step of decidedSteps) {
    if (step.document_sha256 === null || step.document_sha256 === undefined) continue;
    for (const [field, equal] of FIELDS) {
      if (equal(step[field], binding[field])) continue;
      drift.push({ step_no: step.step_no, field, approved: step[field], current: binding[field] });
    }
  }
  return drift;
}
