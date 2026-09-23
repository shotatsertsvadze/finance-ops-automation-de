-- A booking has one line per tax rate, under one document number (ADR-053).
--
-- One row per invoice could carry only one tax key, which a mixed-rate
-- invoice does not have. Idempotency (ADR-017) moves from "one row per
-- invoice" to "one row per invoice and tax key": a replayed handoff still
-- inserts nothing new, and the state machine refuses it before it gets here.
-- Existing rows are single-rate bookings and satisfy the new constraints.
set search_path to finops;

alter table finops.accounting_records drop constraint accounting_records_invoice_id_key;
alter table finops.accounting_records drop constraint accounting_records_document_no_key;

alter table finops.accounting_records
  add constraint accounting_records_one_line_per_rate unique (invoice_id, tax_key);
alter table finops.accounting_records
  add constraint accounting_records_document_line unique (document_no, tax_key);

comment on table finops.accounting_records is
  'Vendor-neutral booking lines, one per tax rate of an invoice, sharing its document number. Account numbers and tax keys are demo assignments, not a certified SKR mapping.';
