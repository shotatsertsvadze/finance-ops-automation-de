-- An invoice its credits cover entirely.
--
-- Netting reduces a payment. When the open credits reach the whole invoice
-- there is nothing left to send, and an instruction for 0.00 is not a payment.
-- Refusing it stranded the invoice, so it gets an ending of its own: settled
-- against the credits, with no money moving. See ADR-050.
set search_path to finops;

alter type finops.invoice_state add value if not exists 'SETTLED_BY_CREDIT';
