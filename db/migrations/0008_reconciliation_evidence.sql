-- Manually closing a reconciliation exception must consume the bank evidence.
--
-- Until now resolving an exception changed only the invoice. Its transaction
-- stayed EXCEPTION and was picked up by the next run, which reset it to
-- UNMATCHED while keeping the old invoice link, leaving it free to attach
-- itself to a later invoice.
set search_path to finops;

alter type finops.bank_tx_status add value if not exists 'RESOLVED';
