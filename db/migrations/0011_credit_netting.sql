-- Applying an open credit note to a payment.
--
-- A credit note is booked (CREDITED) and then reduces the next payment to the
-- same supplier. What was applied, to which payment, is a ledger rather than a
-- running balance on the credit note: an append-only record answers "why was
-- this payment 1.228,00 and not 1.428,00" months later, which a decremented
-- counter cannot. See ADR-050.
set search_path to finops;

create table finops.credit_applications (
  id              uuid primary key default gen_random_uuid(),
  credit_note_id  uuid not null references finops.invoices(id) on delete cascade,
  invoice_id      uuid not null references finops.invoices(id) on delete cascade,
  amount          numeric(14,2) not null check (amount > 0),
  created_at      timestamptz not null default now()
);

-- One application per pair, so a replayed payment instruction cannot consume
-- the same credit twice. The payment instruction is itself idempotent on the
-- invoice; this is the second lock on the same door.
create unique index credit_applications_once_per_pair
  on finops.credit_applications (credit_note_id, invoice_id);

create index credit_applications_credit_note_idx
  on finops.credit_applications (credit_note_id);
create index credit_applications_invoice_idx
  on finops.credit_applications (invoice_id);

comment on table finops.credit_applications is
  'Amounts of a booked credit note applied against invoice payments. Open balance of a credit note = its gross amount minus the sum of its applications.';
