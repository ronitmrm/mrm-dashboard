-- A Store's rack/bin record is independent of the unit's assigned holder.
CREATE TABLE store.asset_storage_locations (
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  asset_id uuid NOT NULL REFERENCES store.assets(id) ON DELETE CASCADE,
  accountable_store_id uuid NOT NULL REFERENCES store.accountable_stores(id),
  location_id uuid NOT NULL REFERENCES store.locations(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  remark text,
  PRIMARY KEY (asset_id, accountable_store_id)
);
CREATE INDEX store_asset_storage_locations_store_idx
  ON store.asset_storage_locations (organization_id, accountable_store_id);

GRANT SELECT, INSERT, UPDATE ON store.asset_storage_locations TO mrmpl_web;
GRANT SELECT ON store.asset_storage_locations TO mrmpl_worker, mrmpl_reporting;

-- Retain each Store's last recorded rack, including Main's before an issue.
INSERT INTO store.asset_storage_locations (
  organization_id, asset_id, accountable_store_id, location_id, updated_at
)
SELECT DISTINCT ON (asset_id, accountable_store_id)
  organization_id, asset_id, accountable_store_id, location_id, recorded_at
FROM (
  SELECT asset.organization_id, asset.id AS asset_id,
    location.accountable_store_id, location.id AS location_id,
    asset.updated_at AS recorded_at, 1 AS current_location
  FROM store.assets asset
  JOIN store.locations location ON location.id = asset.current_location_id
    AND location.organization_id = asset.organization_id
  WHERE asset.current_holder_type = 'STORE' AND location.location_type = 'STORE'
  UNION ALL
  SELECT movement.organization_id, movement.asset_id,
    location.accountable_store_id, location.id, movement.moved_at, 0
  FROM store.stock_movements movement
  JOIN store.locations location ON location.id = movement.location_id
    AND location.organization_id = movement.organization_id
  WHERE movement.asset_id IS NOT NULL AND location.location_type = 'STORE'
) recorded
ORDER BY asset_id, accountable_store_id, current_location DESC, recorded_at DESC,
  location_id;

-- Physical receipts/returns continue to choose storage in the receiving Store.
-- A storage-only update never writes store.assets or invokes this trigger.
CREATE FUNCTION store.remember_asset_storage_location() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.current_location_id IS NOT DISTINCT FROM OLD.current_location_id
    AND NEW.current_holder_type IS NOT DISTINCT FROM OLD.current_holder_type THEN
    RETURN NULL;
  END IF;
  INSERT INTO store.asset_storage_locations (
    organization_id, asset_id, accountable_store_id, location_id,
    updated_at, updated_by_user_id
  )
  SELECT NEW.organization_id, NEW.id, location.accountable_store_id, location.id,
    NEW.updated_at, NEW.updated_by_user_id
  FROM store.locations location
  WHERE location.id = NEW.current_location_id
    AND location.organization_id = NEW.organization_id AND location.location_type = 'STORE'
  ON CONFLICT (asset_id, accountable_store_id) DO UPDATE SET
    location_id = EXCLUDED.location_id, updated_at = EXCLUDED.updated_at,
    updated_by_user_id = EXCLUDED.updated_by_user_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER store_assets_remember_storage_location
  AFTER INSERT OR UPDATE OF current_location_id, current_holder_type ON store.assets
  FOR EACH ROW WHEN (NEW.current_holder_type = 'STORE' AND NEW.current_location_id IS NOT NULL)
  EXECUTE FUNCTION store.remember_asset_storage_location();
