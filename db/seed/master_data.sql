-- Synthetic master data for Nordwerk GmbH (fictional). Idempotent.
set search_path to finops;

insert into finops.users (id, name, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Anna Berger',      'anna.berger@nordwerk.example',  'AP_CLERK'),
  ('00000000-0000-0000-0000-000000000002', 'Tim Kessler',      'tim.kessler@nordwerk.example',  'MANAGER'),
  ('00000000-0000-0000-0000-000000000003', 'Lea Sommer',       'lea.sommer@nordwerk.example',   'MANAGER'),
  ('00000000-0000-0000-0000-000000000004', 'Jonas Weber',      'jonas.weber@nordwerk.example',  'FINANCE'),
  ('00000000-0000-0000-0000-000000000005', 'Dr. Sabine Vogt',  'sabine.vogt@nordwerk.example',  'CFO'),
  ('00000000-0000-0000-0000-000000000006', 'System Admin',     'admin@nordwerk.example',        'ADMIN')
on conflict (id) do nothing;

insert into finops.suppliers (id, supplier_no, legal_name, vat_id, status, default_cost_center, payment_terms_days, risk_level) values
  ('10000000-0000-0000-0000-000000000001', 'S-1001', 'Berliner Bürobedarf GmbH', 'DE123456789', 'ACTIVE',  'CC-100', 30, 'LOW'),
  ('10000000-0000-0000-0000-000000000002', 'S-1002', 'Havel Logistik GmbH',      'DE234567890', 'ACTIVE',  'CC-300', 14, 'LOW'),
  ('10000000-0000-0000-0000-000000000003', 'S-1003', 'Spree IT-Systeme AG',      'DE345678901', 'ACTIVE',  'CC-200', 30, 'LOW'),
  ('10000000-0000-0000-0000-000000000004', 'S-1004', 'Altmark Werkzeuge GmbH',   'DE456789012', 'BLOCKED', 'CC-400', 30, 'HIGH')
on conflict (id) do nothing;

insert into finops.supplier_bank_accounts (supplier_id, iban, bic, status) values
  ('10000000-0000-0000-0000-000000000001', 'DE89370400440532013000', 'COBADEFFXXX', 'ACTIVE'),
  ('10000000-0000-0000-0000-000000000002', 'DE02120300000000202051', 'BYLADEM1001', 'ACTIVE'),
  ('10000000-0000-0000-0000-000000000003', 'DE02500105170137075030', 'INGDDEFFXXX', 'ACTIVE'),
  ('10000000-0000-0000-0000-000000000004', 'DE02100500000054540402', 'BELADEBEXXX', 'ACTIVE')
on conflict (supplier_id, iban) do nothing;

insert into finops.purchase_orders (id, po_number, supplier_id, approved_amount, remaining_amount, currency, cost_center, requester_user_id, status) values
  ('20000000-0000-0000-0000-000000000101', 'PO-2026-0101', '10000000-0000-0000-0000-000000000001',  2000.00,  1500.00, 'EUR', 'CC-100', '00000000-0000-0000-0000-000000000002', 'OPEN'),
  ('20000000-0000-0000-0000-000000000102', 'PO-2026-0102', '10000000-0000-0000-0000-000000000001',   500.00,   500.00, 'EUR', 'CC-100', '00000000-0000-0000-0000-000000000002', 'OPEN'),
  ('20000000-0000-0000-0000-000000000201', 'PO-2026-0201', '10000000-0000-0000-0000-000000000002',  3000.00,  3000.00, 'EUR', 'CC-300', '00000000-0000-0000-0000-000000000003', 'OPEN'),
  ('20000000-0000-0000-0000-000000000303', 'PO-2026-0303', '10000000-0000-0000-0000-000000000003',  5000.00,  5000.00, 'EUR', 'CC-200', '00000000-0000-0000-0000-000000000002', 'OPEN'),
  ('20000000-0000-0000-0000-000000000305', 'PO-2026-0305', '10000000-0000-0000-0000-000000000003', 40000.00, 40000.00, 'EUR', 'CC-200', '00000000-0000-0000-0000-000000000002', 'OPEN')
on conflict (id) do nothing;
