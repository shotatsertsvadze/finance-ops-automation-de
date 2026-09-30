-- Call-back numbers on file, the only numbers a bank-account verification may
-- record (ADR-077). A separate file because master_data.sql must still apply
-- to a schema from before 0022 (see upgrade.test.js). The numbers are in
-- 030 23125, a Berlin range reserved for fiction. Idempotent.
update finops.suppliers s set callback_phone = v.phone
from (values
  ('10000000-0000-0000-0000-000000000001'::uuid, '+49 30 23125 101'),
  ('10000000-0000-0000-0000-000000000002'::uuid, '+49 30 23125 102'),
  ('10000000-0000-0000-0000-000000000003'::uuid, '+49 30 23125 103'),
  ('10000000-0000-0000-0000-000000000004'::uuid, '+49 30 23125 104')
) as v(id, phone)
where s.id = v.id and s.callback_phone is null;
