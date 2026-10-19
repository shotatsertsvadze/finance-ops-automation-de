-- Supplier inquiries (ADR-084), in two tables that are only ever added to.
-- `ai_supplier_inquiries` records every attempt to have a model draft one,
-- like `ai_explanations`: what was sent, what came back, and whether the
-- deterministic checks accepted it. `supplier_inquiries` records a text a
-- person approved, from an AI draft or from the fixed template. Neither moves
-- an invoice. That an inquiry was sent is the `information_requested` audit
-- event that names it, written when a person says they sent it by hand.
set search_path to finops;

create table finops.ai_supplier_inquiries (
  id                 uuid primary key default gen_random_uuid(),
  invoice_id         uuid not null references finops.invoices(id) on delete cascade,
  run_no             integer not null,
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
  constraint ai_inquiry_accepted_is_clean check (
    status <> 'ACCEPTED' or (output is not null and rejection_reasons = '[]'::jsonb and error is null)),
  constraint ai_inquiry_rejected_says_why check (status <> 'REJECTED' or rejection_reasons <> '[]'::jsonb),
  constraint ai_inquiry_failed_says_why check (status <> 'FAILED' or error is not null)
);

-- One accepted draft per cache key; rejected and failed attempts are all kept.
create unique index ai_supplier_inquiries_one_accepted
  on finops.ai_supplier_inquiries (invoice_id, run_no, input_sha256, prompt_version, schema_version, provider, model)
  where status = 'ACCEPTED';

create table finops.supplier_inquiries (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid not null references finops.invoices(id) on delete cascade,
  run_no         integer not null,
  source         text not null check (source in ('AI', 'TEMPLATE')),
  ai_inquiry_id  uuid references finops.ai_supplier_inquiries(id),
  subject        text not null check (length(btrim(subject)) between 1 and 200),
  body           text not null check (length(btrim(body)) between 1 and 4000),
  approved_by    uuid not null references finops.users(id),
  approved_at    timestamptz not null default now(),
  constraint supplier_inquiry_ai_has_draft check ((source = 'AI') = (ai_inquiry_id is not null))
);

create index supplier_inquiries_invoice_idx on finops.supplier_inquiries (invoice_id, approved_at);
