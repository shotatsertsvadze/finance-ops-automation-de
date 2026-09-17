-- Control fixes after an independent review of Phases 0-2.
set search_path to finops;

-- An invoice that was ever an exception must not be auto-approved later, even
-- after the master data that caused the exception is corrected (ADR-019).
alter table finops.invoices add column had_exception boolean not null default false;

comment on column finops.invoices.had_exception is
  'True once the invoice has entered REVIEW_REQUIRED. Never cleared: a corrected exception still requires a human approval.';

-- Duplicate protection must survive every state an approved invoice can reach.
-- RECONCILIATION_EXCEPTION is reachable from PAID and was missing, so an
-- invoice parked there lost its protection against a second payable record.
drop index if exists finops.invoices_one_payable_per_number;

create unique index invoices_one_payable_per_number on finops.invoices (supplier_id, invoice_number)
  where state in ('APPROVED', 'ACCOUNTING_READY', 'PAYMENT_PENDING', 'PAID', 'RECONCILED', 'RECONCILIATION_EXCEPTION');
