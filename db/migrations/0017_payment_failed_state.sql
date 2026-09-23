-- A payment the bank did not carry out (ADR-055). Its own file: Postgres does
-- not allow a new enum value to be used in the transaction that adds it.
set search_path to finops;

alter type finops.invoice_state add value if not exists 'PAYMENT_FAILED';
