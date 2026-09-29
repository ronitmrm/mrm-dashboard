-- Legacy physical units imported without a purchase receipt can still carry
-- their verified original supplier and acquisition price.
ALTER TABLE store.assets
  ADD COLUMN acquisition_supplier_id uuid REFERENCES store.suppliers(id),
  ADD COLUMN acquisition_unit_price numeric(18,2)
    CHECK (acquisition_unit_price >= 0),
  ADD COLUMN acquisition_recorded_at timestamptz,
  ADD COLUMN acquisition_recorded_by_user_id uuid
    REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT store_assets_legacy_acquisition_pair_check
    CHECK ((acquisition_supplier_id IS NULL) = (acquisition_unit_price IS NULL));
