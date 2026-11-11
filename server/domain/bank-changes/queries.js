import { sharedWith } from "./master-data.js";

const CHANGE_COLUMNS = `c.*, s.supplier_no, s.legal_name as supplier_name, s.callback_phone,
  pu.name as proposed_by_name, vu.name as verified_by_name, du.name as decided_by_name,
  si.invoice_number as source_invoice_number`;

const CHANGE_JOINS = `from finops.bank_account_changes c
  join finops.suppliers s on s.id = c.supplier_id
  join finops.users pu on pu.id = c.proposed_by
  left join finops.users vu on vu.id = c.verified_by
  left join finops.users du on du.id = c.decided_by
  left join finops.invoices si on si.id = c.source_invoice_id`;

/** Open changes first, then the rest, newest first. */
export async function listChanges(pool) {
  const { rows } = await pool.query(
    `select ${CHANGE_COLUMNS} ${CHANGE_JOINS}
     order by (c.state in ('PROPOSED', 'VERIFIED')) desc, c.proposed_at desc limit 200`,
  );
  return rows;
}

export async function changeDetail(pool, id) {
  const {
    rows: [change],
  } = await pool.query(`select ${CHANGE_COLUMNS} ${CHANGE_JOINS} where c.id = $1`, [id]);
  if (!change) return null;
  const [accounts, verification, events, revalidations, pending, sharedNow] = await Promise.all([
    pool.query(
      "select iban, bic, status, valid_from, trusted_by_change_id from finops.supplier_bank_accounts where supplier_id = $1 order by created_at, iban",
      [change.supplier_id],
    ),
    pool.query(
      `select v.*, u.name as verified_by_name from finops.bank_change_verifications v
       join finops.users u on u.id = v.verified_by where v.change_id = $1`,
      [id],
    ),
    pool.query(
      `select e.*, u.name as actor_name from finops.bank_change_events e left join finops.users u on u.id = e.actor_id
       where e.change_id = $1 order by e.id`,
      [id],
    ),
    pool.query(
      `select r.*, i.invoice_number, i.state as invoice_state from finops.bank_change_revalidations r
       join finops.invoices i on i.id = r.invoice_id where r.change_id = $1 order by r.revalidated_at, i.invoice_number`,
      [id],
    ),
    pendingInvoices(pool, change),
    sharedWith(pool, change.supplier_id, change.proposed_iban),
  ]);
  return {
    ...change,
    supplier_accounts: accounts.rows,
    verification: verification.rows[0] ?? null,
    events: events.rows,
    revalidations: revalidations.rows,
    pending_invoices: pending,
    // As master data holds it now; `shared_with` is what the proposal saw.
    shared_with_now: sharedNow,
  };
}

/**
 * Invoices of the change's supplier that carry its IBAN, are still open for a
 * decision, were last stopped by that IBAN, and have not been revalidated for
 * this change: what a retry would take, and what waits for a person. One
 * re-validated by hand since has nothing left for the change to do.
 */
export async function pendingInvoices(db, change) {
  const { rows } = await db.query(
    `select i.id as invoice_id, i.invoice_number, i.state from finops.invoices i
     where i.supplier_id = $1 and i.supplier_iban_raw = $2 and i.state in ('REVIEW_REQUIRED', 'INFO_REQUESTED')
       and not exists (select 1 from finops.bank_change_revalidations r where r.change_id = $3 and r.invoice_id = i.id)
       and exists (
         select 1 from finops.validation_results v
         where v.invoice_id = i.id and v.check_code = 'supplier_iban_match' and v.status = 'FAILED'
           and v.run_no = (select max(run_no) from finops.validation_results where invoice_id = i.id))
     order by i.received_at, i.id`,
    [change.supplier_id, change.proposed_iban, change.id],
  );
  return rows;
}

/** The changes proposing the IBAN this invoice carries, for its detail screen. */
export async function changesForInvoice(pool, invoice) {
  if (!invoice.supplier_id || !invoice.supplier_iban_raw) return [];
  const { rows } = await pool.query(
    `select id, change_no, state, revalidated_at from finops.bank_account_changes
     where supplier_id = $1 and proposed_iban = $2 order by proposed_at desc`,
    [invoice.supplier_id, invoice.supplier_iban_raw],
  );
  return rows;
}
