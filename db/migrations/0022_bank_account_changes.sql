-- A supplier's trusted bank accounts change only through a proposal that a
-- second person verifies by calling back on the number on file and a third
-- approves (ADR-077). The rules that must hold whatever the code does are
-- constraints here: who may not be whom, what each state has filled in, and
-- one open change per supplier.
set search_path to finops;

alter table finops.suppliers add column callback_phone text;
comment on column finops.suppliers.callback_phone is
  'Number on file for call-backs; the only number a bank-account verification may record.';

create type finops.bank_change_state as enum ('PROPOSED', 'VERIFIED', 'APPROVED', 'REJECTED', 'CANCELLED');
create sequence finops.bank_change_no_seq;

create table finops.bank_account_changes (
  id                        uuid primary key default gen_random_uuid(),
  change_no                 text not null unique default 'BAC-' || lpad(nextval('finops.bank_change_no_seq')::text, 6, '0'),
  supplier_id               uuid not null references finops.suppliers(id),
  proposed_iban             text not null check (proposed_iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  proposed_bic              text,
  trusted_ibans             text[] not null,
  shared_with               jsonb not null default '[]'::jsonb,
  source_invoice_id         uuid references finops.invoices(id),
  reason                    text not null check (btrim(reason) <> ''),
  proposal_sha256           text not null check (proposal_sha256 ~ '^[0-9a-f]{64}$'),
  required_distinct_actors  smallint not null check (required_distinct_actors in (2, 3)),
  state                     finops.bank_change_state not null default 'PROPOSED',
  proposed_by               uuid not null references finops.users(id),
  proposed_at               timestamptz not null default now(),
  verified_by               uuid references finops.users(id),
  verified_at               timestamptz,
  decided_by                uuid references finops.users(id),
  decided_at                timestamptz,
  decision_reason           text,
  bank_account_id           uuid references finops.supplier_bank_accounts(id),
  revalidated_at            timestamptz,
  constraint bank_change_verifier_not_proposer check (verified_by <> proposed_by),
  constraint bank_change_state_fields check (
    case state
      when 'PROPOSED' then verified_by is null and decided_by is null and bank_account_id is null
      when 'VERIFIED' then verified_by is not null and verified_at is not null
        and decided_by is null and bank_account_id is null
      when 'APPROVED' then verified_by is not null and decided_by is not null and decided_at is not null
        and bank_account_id is not null and decided_by <> proposed_by
        and (required_distinct_actors = 2 or decided_by <> verified_by)
      when 'REJECTED' then decided_by is not null and decided_at is not null and decided_by <> proposed_by
        and decision_reason is not null and bank_account_id is null
      when 'CANCELLED' then decided_by = proposed_by and decided_at is not null
        and decision_reason is not null and bank_account_id is null
    end
  )
);

create unique index bank_account_changes_one_open_per_supplier
  on finops.bank_account_changes (supplier_id) where state in ('PROPOSED', 'VERIFIED');

-- One verification per change, never edited: a correction is a new proposal.
create table finops.bank_change_verifications (
  id               uuid primary key default gen_random_uuid(),
  change_id        uuid not null unique references finops.bank_account_changes(id),
  proposal_sha256  text not null check (proposal_sha256 ~ '^[0-9a-f]{64}$'),
  method           text not null check (method = 'CALLBACK_KNOWN_NUMBER'),
  contact_number   text not null check (btrim(contact_number) <> ''),
  contacted_role   text not null check (length(btrim(contacted_role)) between 1 and 100),
  called_at        timestamptz not null,
  iban_read_back   text,
  outcome          text not null check (outcome in ('CONFIRMED', 'DENIED')),
  reference        text check (length(reference) <= 64),
  note             text check (length(note) <= 1000),
  verified_by      uuid not null references finops.users(id),
  recorded_at      timestamptz not null default now(),
  check (outcome = 'DENIED' or iban_read_back is not null)
);

-- The change's own trail, shaped like audit_events and protected the same way
-- (ADR-068): audit_events belongs to an invoice and its states.
create table finops.bank_change_events (
  id           bigserial primary key,
  change_id    uuid not null references finops.bank_account_changes(id),
  occurred_at  timestamptz not null default now(),
  actor_type   finops.actor_type not null,
  actor_id     uuid references finops.users(id),
  action       text not null,
  from_state   finops.bank_change_state,
  to_state     finops.bank_change_state not null,
  reason       text,
  evidence     jsonb not null default '{}'::jsonb,
  check (actor_type = 'SYSTEM' or actor_id is not null)
);
create index bank_change_events_by_change on finops.bank_change_events (change_id, id);

-- Which invoice an approved change re-validated, from which run to which.
-- Written in the same transaction as that run, so a run never lacks its link
-- and a retry never runs an invoice twice.
create table finops.bank_change_revalidations (
  change_id       uuid not null references finops.bank_account_changes(id),
  invoice_id      uuid not null references finops.invoices(id),
  from_state      finops.invoice_state not null,
  to_state        finops.invoice_state not null,
  from_run_no     integer not null,
  to_run_no       integer not null check (to_run_no > from_run_no),
  revalidated_at  timestamptz not null default now(),
  primary key (change_id, invoice_id)
);

alter table finops.supplier_bank_accounts
  add column trusted_by_change_id uuid references finops.bank_account_changes(id);
comment on column finops.supplier_bank_accounts.trusted_by_change_id is
  'The approved change that added this account; null for accounts seeded or migrated.';

-- For finding an IBAN under other suppliers. Deliberately not unique: factoring
-- and group treasury put several suppliers on one account (ADR-077).
create index supplier_bank_accounts_by_iban on finops.supplier_bank_accounts (iban);
