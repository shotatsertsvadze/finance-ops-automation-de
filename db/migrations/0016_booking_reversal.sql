-- Stopping a booked invoice reverses its booking (ADR-054).
--
-- A reversal is its own document: new document number, the same lines with
-- the sign turned, and the number of the booking it reverses. Idempotency
-- stays per (invoice, tax key), once for the booking and once for its
-- reversal; the state machine refuses a second cancellation before either.
set search_path to finops;

alter table finops.accounting_records add column reverses_document_no text;

alter table finops.accounting_records drop constraint accounting_records_one_line_per_rate;

create unique index accounting_records_one_line_per_rate
  on finops.accounting_records (invoice_id, tax_key) where reverses_document_no is null;
create unique index accounting_records_one_reversal_per_rate
  on finops.accounting_records (invoice_id, tax_key) where reverses_document_no is not null;

comment on column finops.accounting_records.reverses_document_no is
  'Set on a reversal line: the document number of the booking it cancels.';
