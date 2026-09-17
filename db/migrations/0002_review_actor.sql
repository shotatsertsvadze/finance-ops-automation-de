-- Who released an invoice from review. Needed to enforce four-eyes after a
-- review: the person who cleared the exception must not also approve it.
-- Cleared whenever the release is undone (information requested, re-validated).
set search_path to finops;

alter table finops.invoices
  add column review_accepted_by uuid references finops.users(id);

comment on column finops.invoices.review_accepted_by is
  'Actor who moved this invoice from REVIEW_REQUIRED to READY_FOR_APPROVAL.';
