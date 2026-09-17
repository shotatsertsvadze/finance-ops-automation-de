-- Core schema for the finance-ops PoC. Append-only: later changes go into new files.
create schema if not exists finops;
set search_path to finops;

create extension if not exists pgcrypto;

create type finops.user_role as enum ('AP_CLERK', 'MANAGER', 'FINANCE', 'CFO', 'ADMIN');

create table finops.users (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null unique,
  role        finops.user_role not null,
  created_at  timestamptz not null default now()
);

create type finops.supplier_status as enum ('ACTIVE', 'BLOCKED', 'INACTIVE');

create table finops.suppliers (
  id                   uuid primary key default gen_random_uuid(),
  supplier_no          text not null unique,
  legal_name           text not null,
  vat_id               text unique,
  status               finops.supplier_status not null default 'ACTIVE',
  default_cost_center  text,
  payment_terms_days   integer,
  risk_level           text not null default 'LOW',
  created_at           timestamptz not null default now()
);

create type finops.bank_account_status as enum ('ACTIVE', 'RETIRED');

create table finops.supplier_bank_accounts (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null references finops.suppliers(id),
  iban         text not null,
  bic          text,
  status       finops.bank_account_status not null default 'ACTIVE',
  valid_from   date not null default current_date,
  created_at   timestamptz not null default now(),
  unique (supplier_id, iban)
);

create type finops.po_status as enum ('OPEN', 'CLOSED');

create table finops.purchase_orders (
  id                 uuid primary key default gen_random_uuid(),
  po_number          text not null unique,
  supplier_id        uuid not null references finops.suppliers(id),
  approved_amount    numeric(14,2) not null,
  remaining_amount   numeric(14,2) not null,
  currency           text not null default 'EUR',
  cost_center        text,
  requester_user_id  uuid references finops.users(id),
  status             finops.po_status not null default 'OPEN',
  created_at         timestamptz not null default now()
);

create type finops.invoice_state as enum (
  'RECEIVED', 'VALIDATING', 'REVIEW_REQUIRED', 'INFO_REQUESTED',
  'READY_FOR_APPROVAL', 'APPROVED', 'ACCOUNTING_READY', 'PAYMENT_PENDING',
  'PAID', 'RECONCILED', 'RECONCILIATION_EXCEPTION', 'REJECTED', 'DUPLICATE'
);

create table finops.invoices (
  id                   uuid primary key default gen_random_uuid(),
  state                finops.invoice_state not null default 'RECEIVED',
  review_reason        text,
  -- intake facts: written once, never updated
  received_at          timestamptz not null default now(),
  source_channel       text not null,
  original_filename    text not null,
  file_sha256          text not null,
  file_path            text not null,
  file_size_bytes      integer not null,
  duplicate_of         uuid references finops.invoices(id),
  -- extracted from the document
  format               text,
  invoice_number       text,
  issue_date           date,
  due_date             date,
  supplier_name_raw    text,
  supplier_vat_id_raw  text,
  supplier_iban_raw    text,
  buyer_name_raw       text,
  buyer_reference      text,
  po_reference_raw     text,
  currency             text,
  net_amount           numeric(14,2),
  vat_amount           numeric(14,2),
  gross_amount         numeric(14,2),
  payment_terms_raw    text,
  parsed               jsonb,
  -- resolved by business validation
  supplier_id          uuid references finops.suppliers(id),
  purchase_order_id    uuid references finops.purchase_orders(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- The same file exists at most once as a live invoice.
create unique index invoices_live_file_hash on finops.invoices (file_sha256)
  where state <> 'DUPLICATE';

-- Two payable records for one supplier invoice number are impossible.
create unique index invoices_one_payable_per_number on finops.invoices (supplier_id, invoice_number)
  where state in ('APPROVED', 'ACCOUNTING_READY', 'PAYMENT_PENDING', 'PAID', 'RECONCILED');

create index invoices_state_idx on finops.invoices (state, received_at desc);

create table finops.invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references finops.invoices(id) on delete cascade,
  line_no      integer not null,
  description  text,
  quantity     numeric(14,4),
  unit_code    text,
  unit_price   numeric(14,4),
  line_net     numeric(14,2),
  unique (invoice_id, line_no)
);

create type finops.check_phase as enum ('TECHNICAL', 'BUSINESS');
create type finops.check_status as enum ('PASSED', 'FAILED', 'WARNING', 'SKIPPED', 'INFO');
create type finops.check_severity as enum ('LOW', 'MEDIUM', 'HIGH', 'INFO');

create table finops.validation_results (
  id                  bigserial primary key,
  invoice_id          uuid not null references finops.invoices(id) on delete cascade,
  run_no              integer not null,
  phase               finops.check_phase not null,
  check_code          text not null,
  status              finops.check_status not null,
  severity            finops.check_severity not null,
  expected            text,
  actual              text,
  reason              text not null,
  recommended_action  text not null,
  created_at          timestamptz not null default now(),
  unique (invoice_id, run_no, check_code)
);

create table finops.routing_decisions (
  id              bigserial primary key,
  invoice_id      uuid not null references finops.invoices(id) on delete cascade,
  run_no          integer not null,
  decision        text not null,
  target_state    finops.invoice_state not null,
  review_reason   text,
  required_steps  jsonb not null default '[]'::jsonb,
  reasons         jsonb not null default '[]'::jsonb,
  policy          jsonb not null,
  created_at      timestamptz not null default now(),
  unique (invoice_id, run_no)
);

create type finops.approval_step_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

create table finops.approval_steps (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid not null references finops.invoices(id) on delete cascade,
  step_no        integer not null,
  required_role  finops.user_role not null,
  status         finops.approval_step_status not null default 'PENDING',
  actor_id       uuid references finops.users(id),
  decided_at     timestamptz,
  comment        text,
  created_at     timestamptz not null default now(),
  unique (invoice_id, step_no)
);

create type finops.actor_type as enum ('SYSTEM', 'HUMAN');

create table finops.audit_events (
  id           bigserial primary key,
  invoice_id   uuid not null references finops.invoices(id) on delete cascade,
  occurred_at  timestamptz not null default now(),
  actor_type   finops.actor_type not null,
  actor_id     uuid references finops.users(id),
  action       text not null,
  from_state   finops.invoice_state,
  to_state     finops.invoice_state not null,
  reason       text,
  evidence     jsonb not null default '{}'::jsonb,
  check (actor_type = 'SYSTEM' or actor_id is not null)
);

create index audit_events_invoice_idx on finops.audit_events (invoice_id, occurred_at, id);

