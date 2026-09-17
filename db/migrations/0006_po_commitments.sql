-- Purchase-order capacity as a ledger of commitments.
--
-- Previously purchase_orders.remaining_amount was read but never consumed, so
-- two invoices that each fit inside it both became payable. Rather than
-- mutating that balance in place, which would be destructive, hard to audit
-- and racy, each invoice that is live against an order holds a row here.
-- Available capacity is the opening remaining amount minus the active
-- commitments.
set search_path to finops;

create type finops.commitment_status as enum ('ACTIVE', 'RELEASED');

create table finops.po_commitments (
  id                 uuid primary key default gen_random_uuid(),
  purchase_order_id  uuid not null references finops.purchase_orders(id),
  invoice_id         uuid not null references finops.invoices(id) on delete cascade,
  amount             numeric(14,2) not null,
  status             finops.commitment_status not null default 'ACTIVE',
  created_at         timestamptz not null default now(),
  released_at        timestamptz
);

-- One live claim per invoice: re-validating an invoice must not commit twice.
create unique index po_commitments_one_active_per_invoice
  on finops.po_commitments (invoice_id) where status = 'ACTIVE';

create index po_commitments_order_idx
  on finops.po_commitments (purchase_order_id) where status = 'ACTIVE';

comment on column finops.purchase_orders.remaining_amount is
  'Opening balance when this system took the order over. Capacity available now is this minus the active commitments in finops.po_commitments.';
