-- Default Store locations describe assignment, not an explicitly chosen rack/bin.
DELETE FROM store.asset_storage_locations storage
USING store.accountable_stores accountable
WHERE storage.accountable_store_id = accountable.id
  AND storage.location_id = accountable.default_location_id;

GRANT DELETE ON store.asset_storage_locations TO mrmpl_web;

CREATE OR REPLACE FUNCTION store.remember_asset_storage_location() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Receipt/return without a rack leaves this Store's storage unassigned.
  DELETE FROM store.asset_storage_locations storage
  USING store.accountable_stores accountable
  WHERE storage.asset_id = NEW.id AND storage.accountable_store_id = accountable.id
    AND accountable.default_location_id = NEW.current_location_id;

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
  JOIN store.accountable_stores accountable ON accountable.id = location.accountable_store_id
  WHERE location.id = NEW.current_location_id
    AND location.organization_id = NEW.organization_id AND location.location_type = 'STORE'
    AND location.id <> accountable.default_location_id
  ON CONFLICT (asset_id, accountable_store_id) DO UPDATE SET
    location_id = EXCLUDED.location_id, updated_at = EXCLUDED.updated_at,
    updated_by_user_id = EXCLUDED.updated_by_user_id;
  RETURN NULL;
END;
$$;
