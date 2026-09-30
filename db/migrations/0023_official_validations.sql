-- What the official validator (KoSIT) said about a document, one row per
-- validation run that asked it or had to (ADR-078). Written once beside the
-- run's check results and never changed: a retry is a new run with its own
-- row. The raw report is kept for traceability; the application reads the
-- normalised columns.
set search_path to finops;

create table finops.official_validations (
  id                        uuid primary key default gen_random_uuid(),
  invoice_id                uuid not null references finops.invoices(id) on delete cascade,
  run_no                    integer not null,
  outcome                   text not null check (outcome in (
                              'ACCEPTED', 'REJECTED', 'UNPROCESSABLE', 'ERROR', 'TIMEOUT', 'UNAVAILABLE',
                              'INVALID_RESPONSE', 'NOT_CONFIGURED')),
  verdict                   text check (verdict in ('ACCEPTED', 'REJECTED')),
  http_status               integer,
  validator_version         text,
  configuration_version     text not null,
  scenario                  text,
  document_sha256           text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  reported_document_sha256  text,
  messages                  jsonb not null default '[]'::jsonb,
  error                     text,
  duration_ms               integer,
  report                    text,
  report_sha256             text check (report_sha256 ~ '^[0-9a-f]{64}$'),
  validated_at              timestamptz not null default now(),
  unique (invoice_id, run_no),
  -- A verdict exactly when the validator gave one, and only about this document.
  constraint official_verdict_is_an_answer check ((verdict is not null) = (outcome in ('ACCEPTED', 'REJECTED'))),
  constraint official_verdict_names_document check (
    verdict is null or (validator_version is not null and reported_document_sha256 = document_sha256)),
  constraint official_report_hashed check ((report is null) = (report_sha256 is null))
);
