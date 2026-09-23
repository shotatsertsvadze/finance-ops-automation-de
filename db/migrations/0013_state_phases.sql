-- The states added for credit notes, placed where 0004 and 0009 could not
-- place them. Each state now has one phase in server/domain/workflow/states.js
-- and every list derives from it; the SQL here is the one copy that cannot be
-- derived, and a test compares it with PAYABLE_STATES. See ADR-051.
set search_path to finops;

-- A credited or settled document is as final as a paid one, so a second
-- payable record under the same supplier invoice number stays impossible.
-- If existing rows already break this, the index fails to build and the
-- migration stops: that is a duplicate to investigate, not to absorb.
drop index if exists finops.invoices_one_payable_per_number;
create unique index invoices_one_payable_per_number on finops.invoices (supplier_id, invoice_number)
  where state in ('APPROVED', 'ACCOUNTING_READY', 'PAYMENT_PENDING', 'PAID', 'RECONCILED',
                  'RECONCILIATION_EXCEPTION', 'CREDITED', 'SETTLED_BY_CREDIT');

-- Repair (ADR-037): settling against credits released the invoice's claim on
-- its purchase order, although the goods were delivered and the order spent.
-- Restores the claim for every capacity-holding state that lacks one, so it
-- also covers anything 0009 could not yet name. Safe to re-run.
insert into finops.po_commitments (purchase_order_id, invoice_id, amount)
select i.purchase_order_id, i.id,
       case when i.document_type = 'CREDIT_NOTE' then -i.net_amount else i.net_amount end
from finops.invoices i
where i.purchase_order_id is not null
  and i.net_amount is not null
  and i.state in ('READY_FOR_APPROVAL', 'APPROVED', 'ACCOUNTING_READY', 'PAYMENT_PENDING', 'PAID',
                  'RECONCILED', 'RECONCILIATION_EXCEPTION', 'CREDITED', 'SETTLED_BY_CREDIT')
  and not exists (
    select 1 from finops.po_commitments c
    where c.invoice_id = i.id and c.status = 'ACTIVE'
  );
