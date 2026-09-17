-- An approval says what was approved, not only who approved.
--
-- Until now a signature was valid because nothing could rewrite an invoice
-- after it left review: extraction runs only inside processInvoice, which is
-- gated on REPROCESSABLE_STATES. That is an accident of a list. Recording the
-- document, the validation run and the amount on the decision turns it into a
-- fact the next gate can check.
set search_path to finops;

alter table finops.approval_steps add column document_sha256 text;
alter table finops.approval_steps add column validation_run_no integer;
alter table finops.approval_steps add column decided_gross numeric(14,2);

comment on column finops.approval_steps.document_sha256 is
  'The invoice file this decision was given for. Null while the step is pending.';
comment on column finops.approval_steps.validation_run_no is
  'The validation run whose results the approver saw.';
comment on column finops.approval_steps.decided_gross is
  'The gross amount as it stood at the moment of the decision.';
