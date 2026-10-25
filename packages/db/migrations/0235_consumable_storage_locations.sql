-- Consumable rack/bin references do not allocate quantities between locations.
CREATE TABLE store.consumable_storage_locations (
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  item_type_id uuid NOT NULL REFERENCES store.item_types(id) ON DELETE CASCADE,
  accountable_store_id uuid NOT NULL REFERENCES store.accountable_stores(id),
  location_id uuid NOT NULL REFERENCES store.locations(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  remark text,
  PRIMARY KEY (item_type_id, accountable_store_id, location_id)
);
CREATE INDEX store_consumable_storage_locations_store_idx
  ON store.consumable_storage_locations (organization_id, accountable_store_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON store.consumable_storage_locations TO mrmpl_web;
GRANT SELECT ON store.consumable_storage_locations TO mrmpl_worker, mrmpl_reporting;

-- Preserve the racks currently shown before making references independent of balances.
INSERT INTO store.consumable_storage_locations (
  organization_id, item_type_id, accountable_store_id, location_id, updated_at
)
SELECT movement.organization_id, item.id, accountable.id, location.id, max(movement.moved_at)
FROM store.stock_movements movement
JOIN store.item_types item ON item.id = movement.item_type_id
  AND item.organization_id = movement.organization_id AND item.tracking_mode = 'CONSUMABLE'
JOIN store.locations location ON location.id = movement.location_id
  AND location.organization_id = movement.organization_id
JOIN store.accountable_stores accountable ON accountable.id = location.accountable_store_id
  AND accountable.organization_id = movement.organization_id
WHERE movement.asset_id IS NULL AND location.location_type = 'STORE' AND location.active
  AND accountable.active AND location.id <> accountable.default_location_id
GROUP BY movement.organization_id, item.id, accountable.id, location.id
HAVING sum(movement.quantity) > 0;

-- Receiving stock at a rack adds its reference without replacing any saved references.
CREATE FUNCTION store.remember_consumable_storage_location() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.asset_id IS NOT NULL OR NEW.quantity <= 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO store.consumable_storage_locations (
    organization_id, item_type_id, accountable_store_id, location_id, updated_by_user_id
  )
  SELECT NEW.organization_id, item.id, accountable.id, location.id, NEW.created_by_user_id
  FROM store.item_types item
  JOIN store.locations location ON location.id = NEW.location_id
    AND location.organization_id = item.organization_id
  JOIN store.accountable_stores accountable ON accountable.id = location.accountable_store_id
    AND accountable.organization_id = item.organization_id
  WHERE item.id = NEW.item_type_id AND item.organization_id = NEW.organization_id
    AND item.tracking_mode = 'CONSUMABLE' AND location.location_type = 'STORE'
    AND location.active AND accountable.active AND location.id <> accountable.default_location_id
  ON CONFLICT (item_type_id, accountable_store_id, location_id) DO NOTHING;
  RETURN NULL;
END;
$$;

CREATE TRIGGER store_stock_movements_remember_consumable_storage_location
  AFTER INSERT ON store.stock_movements
  FOR EACH ROW EXECUTE FUNCTION store.remember_consumable_storage_location();
