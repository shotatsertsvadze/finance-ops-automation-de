-- Credit notes: the same document pipeline, a different ending.
--
-- A credit note says the supplier owes us, so it shares intake, validation,
-- routing and the accounting handoff with an invoice, and then leaves the
-- money path instead of being paid. See ADR-049.
--
-- Amounts stay positive, as the document states them. The direction is carried
-- by document_type, not by a sign: making it a sign would push the question
-- into the totals chain, the approval tiers and every check that reads an
-- amount.
set search_path to finops;

alter table finops.invoices
  add column if not exists document_type text not null default 'INVOICE';

alter table finops.invoices
  add constraint invoices_document_type_known
  check (document_type in ('INVOICE', 'CREDIT_NOTE'));

-- The invoice a credit note refers to, as the document names it. Free text on
-- purpose: it is the supplier's reference, which may name a document this
-- system has never seen.
alter table finops.invoices
  add column if not exists credits_invoice_raw text;

comment on column finops.invoices.document_type is
  'INVOICE or CREDIT_NOTE (UNTDID 1001 code 381). A credit note is never paid.';

alter type finops.invoice_state add value if not exists 'CREDITED';
