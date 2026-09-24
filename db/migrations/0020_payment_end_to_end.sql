-- A payment is known at the bank by an id Nordwerk issues, not by the
-- supplier's invoice number (ADR-063).
--
-- Instructions from before this migration keep a null end_to_end_id: that id
-- was never sent, so reconciliation still recognises them by their reference.
-- The SEPA rules bind every row that has an id, which is every new one; an
-- old row stays updatable (confirmed, failed) whatever its reference holds.
set search_path to finops;

create sequence finops.payment_end_to_end_seq;

alter table finops.payment_instructions add column end_to_end_id text unique;

alter table finops.payment_instructions
  add constraint payment_instructions_end_to_end_id_format
    check (end_to_end_id ~ '^NW-P-[0-9]{8}$');

alter table finops.payment_instructions
  add constraint payment_instructions_reference_sepa
    check (end_to_end_id is null or (char_length(reference) <= 140 and reference ~ '^[A-Za-z0-9/?:().,''+ -]+$'));

comment on column finops.payment_instructions.end_to_end_id is
  'Issued at instruction, one per attempt; what reconciliation looks for in the bank line.';
