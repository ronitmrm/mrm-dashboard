ALTER TABLE store.item_types
  ADD COLUMN manufacturer_make text,
  ADD COLUMN model_number text,
  ADD COLUMN rated_load text;

ALTER TABLE store.assets
  ADD COLUMN warranty_period text,
  ADD COLUMN installed_on date,
  ADD COLUMN stabilizer_asset_id uuid REFERENCES store.assets(id),
  ADD COLUMN mcb_number text;

ALTER TABLE store.receipt_lines
  ADD COLUMN warranty_period text;

ALTER TABLE store.assets
  ADD CONSTRAINT store_assets_stabilizer_not_self
  CHECK (stabilizer_asset_id IS NULL OR stabilizer_asset_id <> id);
