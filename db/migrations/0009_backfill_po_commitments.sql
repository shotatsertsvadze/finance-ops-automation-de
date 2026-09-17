-- Repair: 0006 created the commitment ledger empty.
--
-- An installation that already had invoices in capacity-holding states came out
-- of the upgrade with no record of those claims, so the whole opening balance
-- of every order looked free and the next invoice could spend it again. New
-- installations are unaffected, which is exactly why reset-and-seed tests
-- could not see this.
--
-- Append-only and safe to re-run: an invoice that already holds an active
-- commitment is skipped, and the partial unique index would refuse a duplicate.
set search_path to finops;

insert into finops.po_commitments (purchase_order_id, invoice_id, amount)
select i.purchase_order_id, i.id, i.net_amount
from finops.invoices i
where i.purchase_order_id is not null
  and i.net_amount is not null
  and i.state in ('READY_FOR_APPROVAL', 'APPROVED', 'ACCOUNTING_READY',
                  'PAYMENT_PENDING', 'PAID', 'RECONCILED', 'RECONCILIATION_EXCEPTION')
  and not exists (
    select 1 from finops.po_commitments c
    where c.invoice_id = i.id and c.status = 'ACTIVE'
  );

-- An order that was already overspent before the ledger existed stays
-- overspent. Saying so is the point: silently absorbing it would hide the very
-- condition the ledger was added to prevent.
do $$
declare
  overrun record;
begin
  for overrun in
    select p.po_number, p.remaining_amount, sum(c.amount) as committed
    from finops.po_commitments c
    join finops.purchase_orders p on p.id = c.purchase_order_id
    where c.status = 'ACTIVE'
    group by p.po_number, p.remaining_amount
    having sum(c.amount) > p.remaining_amount
  loop
    raise notice 'Bestellung % ist bereits ueberschritten: % gebunden, % offen',
      overrun.po_number, overrun.committed, overrun.remaining_amount;
  end loop;
end $$;
