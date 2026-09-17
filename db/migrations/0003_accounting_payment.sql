-- Accounting handoff, simulated payment, and reconciliation against synthetic
-- bank data. No real banking: these tables record what would be handed to an
-- accounting system and a payment provider.
set search_path to finops;

create sequence finops.accounting_document_seq;

-- One accounting record per invoice. The unique key is the idempotency
-- guarantee: a repeated handoff cannot produce a second booking.
create table finops.accounting_records (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null unique references finops.invoices(id) on delete cascade,
  document_no       text not null unique,
  booking_date      date not null,
  supplier_no       text not null,
  creditor_account  text not null,
  expense_account   text not null,
  cost_center       text,
  tax_key           text not null,
  net_amount        numeric(14,2) not null,
  vat_amount        numeric(14,2) not null,
  gross_amount      numeric(14,2) not null,
  currency          text not null,
  reference         text not null,
  exported_at       timestamptz,
  created_at        timestamptz not null default now()
);

comment on table finops.accounting_records is
  'Vendor-neutral booking record. Account numbers and tax keys are demo assignments, not a certified SKR mapping.';

create type finops.payment_status as enum ('PENDING', 'EXECUTED', 'FAILED');

-- idempotency_key is derived from the invoice, so replaying a payment
-- instruction or a provider webhook cannot create a second payment.
create table finops.payment_instructions (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references finops.invoices(id) on delete cascade,
  idempotency_key  text not null unique,
  amount           numeric(14,2) not null,
  currency         text not null,
  creditor_iban    text not null,
  creditor_name    text not null,
  reference        text not null,
  status           finops.payment_status not null default 'PENDING',
  provider_ref     text,
  executed_at      timestamptz,
  created_at       timestamptz not null default now()
);

create type finops.bank_tx_status as enum ('UNMATCHED', 'MATCHED', 'EXCEPTION');

-- external_id is the bank's own transaction id: re-importing the same
-- statement is a no-op.
create table finops.bank_transactions (
  id                 uuid primary key default gen_random_uuid(),
  external_id        text not null unique,
  value_date         date not null,
  amount             numeric(14,2) not null,
  currency           text not null,
  counterparty_name  text,
  counterparty_iban  text,
  reference          text,
  status             finops.bank_tx_status not null default 'UNMATCHED',
  matched_invoice_id uuid references finops.invoices(id),
  match_reason       text,
  matched_at         timestamptz,
  imported_at        timestamptz not null default now()
);

create index bank_transactions_status_idx on finops.bank_transactions (status, value_date);

-- An invoice is reconciled by at most one transaction.
create unique index bank_transactions_one_match_per_invoice
  on finops.bank_transactions (matched_invoice_id)
  where status = 'MATCHED';
