-- Every attempt to have an AI model explain why an invoice stopped (ADR-080).
-- Kept apart from the authoritative data: nothing in invoices, validation
-- results, routing, master data or the audit trail reads this table. Written
-- once per attempt, accepted or not; `input` is exactly what was sent, so the
-- record shows what left the system.
set search_path to finops;

create table finops.ai_explanations (
  id                 uuid primary key default gen_random_uuid(),
  invoice_id         uuid not null references finops.invoices(id) on delete cascade,
  run_no             integer not null,
  language           text not null check (language in ('de', 'en')),
  input_sha256       text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  input              jsonb not null,
  prompt_version     text not null,
  schema_version     text not null,
  provider           text not null,
  model              text not null,
  status             text not null check (status in ('ACCEPTED', 'REJECTED', 'FAILED')),
  output             jsonb,
  rejection_reasons  jsonb not null default '[]'::jsonb,
  error              text,
  duration_ms        integer,
  input_tokens       integer,
  output_tokens      integer,
  requested_by       uuid references finops.users(id),
  created_at         timestamptz not null default now(),
  constraint ai_accepted_is_clean check (
    status <> 'ACCEPTED' or (output is not null and rejection_reasons = '[]'::jsonb and error is null)),
  constraint ai_rejected_says_why check (status <> 'REJECTED' or rejection_reasons <> '[]'::jsonb),
  constraint ai_failed_says_why check (status <> 'FAILED' or error is not null)
);

-- One accepted explanation per cache key; a second concurrent request adds
-- nothing. Rejected and failed attempts are all kept.
create unique index ai_explanations_one_accepted
  on finops.ai_explanations (invoice_id, run_no, input_sha256, prompt_version, schema_version, provider, model, language)
  where status = 'ACCEPTED';
