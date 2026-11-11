/**
 * The authoritative facts an explanation is built from: the invoice's state
 * and the checks of its latest validation run, plus the names that must be
 * removed before anything is sent (ADR-080). Read only; nothing is locked.
 */
export async function loadEvidence(pool, company, invoiceId) {
  const {
    rows: [invoice],
  } = await pool.query(
    `select i.id, i.document_type, i.state, i.review_reason, s.legal_name as supplier_name,
            i.parsed->'supplier'->>'name' as document_supplier_name, i.parsed->'buyer'->>'name' as document_buyer_name
     from finops.invoices i left join finops.suppliers s on s.id = i.supplier_id
     where i.id = $1`,
    [invoiceId],
  );
  if (!invoice) return null;
  const { rows: checks } = await pool.query(
    `select run_no, phase, check_code, status, severity, expected, actual, reason from finops.validation_results
     where invoice_id = $1 and run_no = (select max(run_no) from finops.validation_results where invoice_id = $1)
     order by phase, id`,
    [invoiceId],
  );
  const { supplier_name, document_supplier_name, document_buyer_name, ...facts } = invoice;
  return {
    invoice: facts,
    runNo: checks[0]?.run_no ?? null,
    checks,
    names: [supplier_name, document_supplier_name, document_buyer_name, company.legalName],
  };
}
