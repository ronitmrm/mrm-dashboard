CREATE TABLE store.vendors (
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
CREATE UNIQUE INDEX store_vendors_code_unique
  ON store.vendors (organization_id, lower(code));

CREATE TABLE store.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  order_number text NOT NULL CHECK (length(btrim(order_number)) > 0),
  supplier_id uuid NOT NULL REFERENCES store.suppliers(id),
  item_type_id uuid NOT NULL REFERENCES store.item_types(id),
  order_date date NOT NULL DEFAULT current_date,
  ordered_quantity numeric(18,3) NOT NULL CHECK (ordered_quantity > 0),
  received_quantity numeric(18,3) NOT NULL DEFAULT 0
    CHECK (received_quantity >= 0 AND received_quantity <= ordered_quantity),
  unit_price numeric(18,2) NOT NULL CHECK (unit_price >= 0),
  status text NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open', 'Partially Received', 'Received', 'Cancelled')),
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX store_purchase_orders_number_unique
  ON store.purchase_orders (organization_id, lower(order_number));
CREATE INDEX store_purchase_orders_open_idx
  ON store.purchase_orders (organization_id, status, order_date DESC);

ALTER TABLE store.receipts
  ADD COLUMN purchase_order_id uuid REFERENCES store.purchase_orders(id);
CREATE INDEX store_receipts_purchase_order_idx
  ON store.receipts (organization_id, purchase_order_id, received_at DESC)
  WHERE purchase_order_id IS NOT NULL;

ALTER TABLE store.assets
  DROP CONSTRAINT assets_current_holder_type_check,
  ADD CONSTRAINT assets_current_holder_type_check
    CHECK (current_holder_type IN (
      'STORE', 'MACHINE', 'UNIT', 'DEPARTMENT', 'PERSON', 'VENDOR'
    )),
  ADD COLUMN current_vendor_id uuid REFERENCES store.vendors(id);
CREATE INDEX store_assets_vendor_idx
  ON store.assets (organization_id, current_vendor_id)
  WHERE current_vendor_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON
  store.vendors, store.purchase_orders
TO mrmpl_web;
GRANT SELECT ON
  store.vendors, store.purchase_orders
TO mrmpl_worker, mrmpl_reporting;
