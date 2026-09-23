-- An approved invoice can be stopped before money moves (ADR-054). Its own
-- file: Postgres does not allow a new enum value to be used in the
-- transaction that adds it.
set search_path to finops;

alter type finops.invoice_state add value if not exists 'CANCELLED';
