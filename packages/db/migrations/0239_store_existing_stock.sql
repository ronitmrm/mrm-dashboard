CREATE TABLE store.existing_stock_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  entry_key uuid NOT NULL,
  input_checksum text NOT NULL,
  item_type_id uuid NOT NULL REFERENCES store.item_types(id),
  location_id uuid NOT NULL REFERENCES store.locations(id),
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  purchased_on date,
  supplier_id uuid REFERENCES store.suppliers(id),
  unit_price numeric(18,2) CHECK (unit_price >= 0),
  bill_number text,
  bill_date date,
  manufacturer_make text,
  serial_numbers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(serial_numbers) = 'array'),
  installed_on date,
  warranty_period text,
  warranty_until date,
  condition text NOT NULL CHECK (condition IN ('AVAILABLE', 'BROKEN')),
  remark text,
  recorded_by text NOT NULL,
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, entry_key)
);
CREATE INDEX existing_stock_entries_recent_idx
  ON store.existing_stock_entries (organization_id, created_at DESC);

ALTER TABLE store.assets
  ADD COLUMN existing_stock_entry_id uuid REFERENCES store.existing_stock_entries(id),
  DROP CONSTRAINT store_assets_legacy_acquisition_pair_check;
CREATE INDEX store_assets_existing_stock_entry_idx ON store.assets (existing_stock_entry_id)
  WHERE existing_stock_entry_id IS NOT NULL;
ALTER TABLE store.stock_movements
  ADD COLUMN existing_stock_entry_id uuid REFERENCES store.existing_stock_entries(id);

GRANT SELECT, INSERT ON store.existing_stock_entries TO mrmpl_web;
GRANT SELECT ON store.existing_stock_entries TO mrmpl_worker, mrmpl_reporting;
