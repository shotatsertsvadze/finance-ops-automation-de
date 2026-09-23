-- A payment can now fail and be instructed again (ADR-055).
set search_path to finops;

-- A failed payment is still owed and still approved, so a second payable
-- record under the same supplier invoice number stays impossible.
drop index if exists finops.invoices_one_payable_per_number;
create unique index invoices_one_payable_per_number on finops.invoices (supplier_id, invoice_number)
  where state in ('APPROVED', 'ACCOUNTING_READY', 'PAYMENT_PENDING', 'PAYMENT_FAILED', 'PAID', 'RECONCILED',
                  'RECONCILIATION_EXCEPTION', 'CREDITED', 'SETTLED_BY_CREDIT');

-- Idempotency moves from "one instruction per invoice" to "one per attempt":
-- the key names the attempt, and at most one instruction per invoice is live
-- (pending or executed) at any time, so a replay still cannot pay twice.
create unique index payment_instructions_one_live_per_invoice
  on finops.payment_instructions (invoice_id) where status in ('PENDING', 'EXECUTED');

-- Credits applied to a payment that failed are released, not deleted: the
-- ledger keeps the record, and the balance counts only live applications.
alter table finops.credit_applications add column released_at timestamptz;
drop index finops.credit_applications_once_per_pair;
create unique index credit_applications_once_per_pair
  on finops.credit_applications (credit_note_id, invoice_id) where released_at is null;
