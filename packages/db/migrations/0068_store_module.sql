CREATE SCHEMA IF NOT EXISTS store;

CREATE TABLE store.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  code text NOT NULL CHECK (length(btrim(code)) > 0),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  location_type text NOT NULL DEFAULT 'STORE'
    CHECK (location_type IN ('STORE', 'DEPARTMENT', 'UNIT')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX store_locations_code_unique
  ON store.locations (organization_id, lower(code));

CREATE TABLE store.item_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  type_code text NOT NULL CHECK (length(btrim(type_code)) > 0),
  asset_type text NOT NULL CHECK (length(btrim(asset_type)) > 0),
  asset_category text NOT NULL CHECK (length(btrim(asset_category)) > 0),
  asset_subcategory text NOT NULL CHECK (length(btrim(asset_subcategory)) > 0),
  asset_name text NOT NULL CHECK (length(btrim(asset_name)) > 0),
  identification_name text NOT NULL CHECK (length(btrim(identification_name)) > 0),
  applicable_item_code text,
  drawing_number text,
  tracking_mode text NOT NULL CHECK (tracking_mode IN ('SERIALIZED', 'CONSUMABLE')),
  unit text NOT NULL DEFAULT 'Nos' CHECK (length(btrim(unit)) > 0),
  minimum_stock numeric(18,3) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  next_asset_number integer NOT NULL DEFAULT 1 CHECK (next_asset_number > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX store_item_types_code_unique
  ON store.item_types (organization_id, lower(type_code));
CREATE UNIQUE INDEX store_item_types_combination_unique
  ON store.item_types (
    organization_id, lower(asset_type), lower(asset_category),
    lower(asset_subcategory), lower(asset_name)
  );

CREATE TABLE store.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  code text NOT NULL CHECK (length(btrim(code)) > 0),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  contact_details text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX store_suppliers_code_unique
  ON store.suppliers (organization_id, lower(code));

CREATE TABLE store.supplier_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  item_type_id uuid NOT NULL REFERENCES store.item_types(id),
  supplier_id uuid NOT NULL REFERENCES store.suppliers(id),
  unit_price numeric(18,2) NOT NULL CHECK (unit_price >= 0),
  valid_from date NOT NULL DEFAULT current_date,
  quote_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE INDEX store_supplier_prices_item_idx
  ON store.supplier_prices (organization_id, item_type_id, valid_from DESC);

CREATE TABLE store.number_counters (
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  counter_key text NOT NULL,
  counter_year integer NOT NULL,
  current_value integer NOT NULL CHECK (current_value > 0),
  PRIMARY KEY (organization_id, counter_key, counter_year)
);

CREATE TABLE store.code_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  request_number text NOT NULL,
  requested_asset_type text NOT NULL,
  requested_category text NOT NULL,
  requested_subcategory text NOT NULL,
  requested_asset_name text NOT NULL,
  identification_name text NOT NULL,
  requested_by text NOT NULL,
  department text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Existing Code Found', 'Code Created', 'Closed')),
  resolved_item_type_id uuid REFERENCES store.item_types(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  resolved_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX store_code_requests_number_unique
  ON store.code_requests (organization_id, lower(request_number));

CREATE TABLE store.requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  request_number text NOT NULL,
  item_type_id uuid NOT NULL REFERENCES store.item_types(id),
  location_id uuid NOT NULL REFERENCES store.locations(id),
  department text NOT NULL CHECK (length(btrim(department)) > 0),
  requested_by text NOT NULL CHECK (length(btrim(requested_by)) > 0),
  requested_quantity numeric(18,3) NOT NULL CHECK (requested_quantity > 0),
  issued_quantity numeric(18,3) NOT NULL DEFAULT 0
    CHECK (issued_quantity >= 0 AND issued_quantity <= requested_quantity),
  status text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Partially Issued', 'Fulfilled', 'Cancelled')),
  required_on date,
  purpose text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX store_requisitions_number_unique
  ON store.requisitions (organization_id, lower(request_number));
CREATE INDEX store_requisitions_queue_idx
  ON store.requisitions (organization_id, status, created_at DESC);

CREATE TABLE store.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  receipt_number text NOT NULL,
  location_id uuid NOT NULL REFERENCES store.locations(id),
  supplier_id uuid REFERENCES store.suppliers(id),
  bill_number text,
  bill_date date,
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by text,
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX store_receipts_number_unique
  ON store.receipts (organization_id, lower(receipt_number));

CREATE TABLE store.receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  receipt_id uuid NOT NULL REFERENCES store.receipts(id),
  item_type_id uuid NOT NULL REFERENCES store.item_types(id),
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  warranty_until date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE store.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  item_type_id uuid NOT NULL REFERENCES store.item_types(id),
  receipt_line_id uuid REFERENCES store.receipt_lines(id),
  asset_code text NOT NULL CHECK (length(btrim(asset_code)) > 0),
  identification_name text NOT NULL CHECK (length(btrim(identification_name)) > 0),
  manufacturer_serial_number text,
  status text NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'UNDER_MAINTENANCE', 'BROKEN', 'SCRAPPED')),
  current_location_id uuid REFERENCES store.locations(id),
  current_holder_type text NOT NULL DEFAULT 'STORE'
    CHECK (current_holder_type IN ('STORE', 'MACHINE', 'UNIT', 'DEPARTMENT', 'PERSON')),
  current_holder_reference text,
  current_holder_name text,
  current_machine_id uuid REFERENCES catalog.machines(id),
  warranty_until date,
  acquired_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX store_assets_code_unique
  ON store.assets (organization_id, lower(asset_code));
CREATE INDEX store_assets_machine_idx
  ON store.assets (organization_id, current_machine_id)
  WHERE current_machine_id IS NOT NULL;

CREATE TABLE store.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  item_type_id uuid NOT NULL REFERENCES store.item_types(id),
  asset_id uuid REFERENCES store.assets(id),
  location_id uuid NOT NULL REFERENCES store.locations(id),
  requisition_id uuid REFERENCES store.requisitions(id),
  receipt_line_id uuid REFERENCES store.receipt_lines(id),
  movement_type text NOT NULL
    CHECK (movement_type IN ('RECEIPT', 'ISSUE', 'RETURN', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'SCRAP')),
  quantity numeric(18,3) NOT NULL CHECK (quantity <> 0),
  from_holder_type text,
  from_holder_reference text,
  from_holder_name text,
  to_holder_type text,
  to_holder_reference text,
  to_holder_name text,
  moved_at timestamptz NOT NULL DEFAULT now(),
  moved_by text,
  remark text,
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE INDEX store_stock_movements_balance_idx
  ON store.stock_movements (organization_id, item_type_id, location_id, moved_at);
CREATE INDEX store_stock_movements_asset_history_idx
  ON store.stock_movements (organization_id, asset_id, moved_at DESC)
  WHERE asset_id IS NOT NULL;

CREATE TABLE store.asset_maintenance_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  asset_id uuid NOT NULL REFERENCES store.assets(id),
  definition_id uuid NOT NULL REFERENCES maintenance.definitions(id),
  first_due_on date NOT NULL,
  last_completed_on date,
  next_due_on date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  UNIQUE (asset_id, definition_id)
);
CREATE INDEX store_asset_maintenance_due_idx
  ON store.asset_maintenance_schedules (organization_id, next_due_on)
  WHERE active;

CREATE TABLE store.asset_maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  asset_id uuid NOT NULL REFERENCES store.assets(id),
  schedule_id uuid REFERENCES store.asset_maintenance_schedules(id),
  maintenance_type text NOT NULL CHECK (maintenance_type IN ('MAINTENANCE', 'CALIBRATION', 'BREAKDOWN')),
  completed_on date NOT NULL,
  completed_by text NOT NULL,
  supplier_name text,
  certificate_number text,
  work_done text,
  result text,
  cost numeric(18,2) CHECK (cost IS NULL OR cost >= 0),
  next_due_on date,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE INDEX store_asset_maintenance_history_idx
  ON store.asset_maintenance_records (organization_id, asset_id, completed_on DESC);

CREATE TABLE store.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  asset_id uuid REFERENCES store.assets(id),
  receipt_id uuid REFERENCES store.receipts(id),
  maintenance_record_id uuid REFERENCES store.asset_maintenance_records(id),
  document_type text NOT NULL CHECK (document_type IN ('BILL', 'GUARANTEE_CARD', 'CALIBRATION_CERTIFICATE', 'OTHER')),
  bill_number text,
  file_name text,
  storage_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  CHECK (asset_id IS NOT NULL OR receipt_id IS NOT NULL OR maintenance_record_id IS NOT NULL)
);

INSERT INTO identity.permissions (key, module, name)
VALUES
  ('store.read', 'store', 'View Store'),
  ('store.requests.write', 'store', 'Submit Store requests'),
  ('store.manage', 'store', 'Manage Store stock and assets')
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM identity.roles AS roles
CROSS JOIN identity.permissions AS permissions
WHERE roles.key = 'administrator'
  AND permissions.key IN ('store.read', 'store.requests.write', 'store.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

GRANT USAGE ON SCHEMA store TO mrmpl_web, mrmpl_worker, mrmpl_reporting;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA store TO mrmpl_web;
GRANT SELECT ON ALL TABLES IN SCHEMA store TO mrmpl_worker, mrmpl_reporting;

ALTER DEFAULT PRIVILEGES IN SCHEMA store
  GRANT SELECT, INSERT, UPDATE ON TABLES TO mrmpl_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA store
  GRANT SELECT ON TABLES TO mrmpl_worker, mrmpl_reporting;
