-- Approval steps are kept, numbered by round, instead of deleted when an
-- invoice is released again (ADR-067). Rows that already exist are round 1:
-- the earlier rounds they would have followed were deleted before this.
set search_path to finops;

alter table finops.approval_steps add column round integer not null default 1;

alter table finops.approval_steps drop constraint approval_steps_invoice_id_step_no_key;
alter table finops.approval_steps add constraint approval_steps_one_per_round unique (invoice_id, round, step_no);

comment on column finops.approval_steps.round is
  'Each release into approval starts a new round; only the highest round is live.';
