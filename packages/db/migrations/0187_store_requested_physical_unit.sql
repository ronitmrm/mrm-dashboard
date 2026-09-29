-- A requester may name a particular physical Unit ID, or leave selection to
-- Store by requesting only the Asset Code. A named unit is one request line.
CREATE UNIQUE INDEX store_assets_id_item_type_unique
  ON store.assets (id, item_type_id);

ALTER TABLE store.requisitions
  ADD COLUMN requested_asset_id uuid,
  ADD CONSTRAINT store_requisitions_requested_asset_quantity_check
    CHECK (requested_asset_id IS NULL OR requested_quantity = 1),
  ADD CONSTRAINT store_requisitions_requested_asset_item_type_fk
    FOREIGN KEY (requested_asset_id, item_type_id)
    REFERENCES store.assets (id, item_type_id);

CREATE INDEX store_requisitions_requested_asset_idx
  ON store.requisitions (organization_id, requested_asset_id)
  WHERE requested_asset_id IS NOT NULL;
