-- One company ledger, with an accountable store independent of physical holder.
CREATE TABLE store.accountable_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  code text NOT NULL CHECK (length(btrim(code)) > 0),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  kind text NOT NULL CHECK (kind IN ('MAIN', 'QUALITY', 'PRODUCTION')),
  production_floor_code text,
  default_location_id uuid,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'PRODUCTION') = (production_floor_code IS NOT NULL))
);
CREATE UNIQUE INDEX store_accountable_stores_code_unique
  ON store.accountable_stores (organization_id, lower(code));
CREATE UNIQUE INDEX store_accountable_stores_floor_unique
  ON store.accountable_stores (organization_id, production_floor_code)
  WHERE production_floor_code IS NOT NULL;

INSERT INTO store.accountable_stores (organization_id, code, name, kind)
SELECT id, 'MAIN', 'Main Store', 'MAIN' FROM core.organizations;
INSERT INTO store.accountable_stores (organization_id, code, name, kind)
SELECT id, 'QUALITY', 'Quality Store', 'QUALITY' FROM core.organizations;
INSERT INTO store.accountable_stores (
  organization_id, code, name, kind, production_floor_code
)
SELECT floor.organization_id, floor.code, floor.name || ' Store',
  'PRODUCTION', floor.code
FROM manufacturing.production_floors floor;

ALTER TABLE store.locations
  ADD COLUMN accountable_store_id uuid REFERENCES store.accountable_stores(id);
UPDATE store.locations location
SET accountable_store_id = accountable.id
FROM store.accountable_stores accountable
WHERE accountable.organization_id = location.organization_id
  AND accountable.kind = 'MAIN';
ALTER TABLE store.locations ALTER COLUMN accountable_store_id SET NOT NULL;
CREATE INDEX store_locations_accountable_store_idx
  ON store.locations (organization_id, accountable_store_id);

-- Existing locations and signed stock belong to Main Store. Each new store
-- receives one physical location; movements between stores use the same ledger.
INSERT INTO store.locations (
  organization_id, code, name, location_type, accountable_store_id
)
SELECT accountable.organization_id,
  'ACCOUNTABLE-' || upper(accountable.code), accountable.name,
  'STORE', accountable.id
FROM store.accountable_stores accountable
WHERE accountable.kind <> 'MAIN';
INSERT INTO store.locations (
  organization_id, code, name, location_type, accountable_store_id
)
SELECT accountable.organization_id, 'MAIN-STORE', accountable.name,
  'STORE', accountable.id
FROM store.accountable_stores accountable
WHERE accountable.kind = 'MAIN'
  AND NOT EXISTS (
    SELECT 1 FROM store.locations location
    WHERE location.accountable_store_id = accountable.id
      AND location.location_type = 'STORE' AND location.active
  );
UPDATE store.accountable_stores accountable
SET default_location_id = (
  SELECT candidate.id FROM store.locations candidate
  WHERE candidate.accountable_store_id = accountable.id
    AND candidate.location_type = 'STORE' AND candidate.active
  ORDER BY candidate.created_at, candidate.id LIMIT 1
);
ALTER TABLE store.accountable_stores
  ADD CONSTRAINT store_accountable_default_location_fk
    FOREIGN KEY (default_location_id) REFERENCES store.locations(id);

-- Organizations and production floors can also be created after this migration.
CREATE FUNCTION store.create_accountable_default_location()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO store.locations (
    organization_id, code, name, location_type, accountable_store_id
  ) VALUES (
    NEW.organization_id, 'ACCOUNTABLE-' || upper(NEW.code),
    NEW.name, 'STORE', NEW.id
  ) ON CONFLICT DO NOTHING;
  UPDATE store.accountable_stores
  SET default_location_id = (
    SELECT location.id FROM store.locations location
    WHERE location.accountable_store_id = NEW.id
      AND location.location_type = 'STORE' AND location.active
    ORDER BY location.created_at, location.id LIMIT 1
  ) WHERE id = NEW.id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER store_accountable_default_location
  AFTER INSERT ON store.accountable_stores
  FOR EACH ROW EXECUTE FUNCTION store.create_accountable_default_location();

CREATE FUNCTION store.seed_organization_stores()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO store.accountable_stores (organization_id, code, name, kind)
  VALUES (NEW.id, 'MAIN', 'Main Store', 'MAIN'),
    (NEW.id, 'QUALITY', 'Quality Store', 'QUALITY')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER store_organization_stores
  AFTER INSERT ON core.organizations
  FOR EACH ROW EXECUTE FUNCTION store.seed_organization_stores();

CREATE FUNCTION store.seed_production_floor_store()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO store.accountable_stores (
    organization_id, code, name, kind, production_floor_code, active
  ) VALUES (
    NEW.organization_id, NEW.code, NEW.name || ' Store',
    'PRODUCTION', NEW.code, NEW.active
  ) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER store_production_floor_store
  AFTER INSERT ON manufacturing.production_floors
  FOR EACH ROW EXECUTE FUNCTION store.seed_production_floor_store();

ALTER TABLE store.assets
  ADD COLUMN accountable_store_id uuid REFERENCES store.accountable_stores(id);
UPDATE store.assets asset
SET accountable_store_id = accountable.id
FROM store.accountable_stores accountable
WHERE accountable.organization_id = asset.organization_id
  AND accountable.kind = 'MAIN';
ALTER TABLE store.assets ALTER COLUMN accountable_store_id SET NOT NULL;
CREATE INDEX store_assets_accountable_store_idx
  ON store.assets (organization_id, accountable_store_id, item_type_id);

-- Legacy receipts and test fixtures may omit the new column. Main Store is the
-- safe default; explicit departmental transfers always write another owner.
CREATE FUNCTION store.default_main_accountable_store()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.accountable_store_id IS NULL THEN
    NEW.accountable_store_id := (
      SELECT id FROM store.accountable_stores
      WHERE organization_id = NEW.organization_id AND kind = 'MAIN'
    );
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER store_location_default_main_accountable
  BEFORE INSERT ON store.locations
  FOR EACH ROW EXECUTE FUNCTION store.default_main_accountable_store();
CREATE TRIGGER store_asset_default_main_accountable
  BEFORE INSERT ON store.assets
  FOR EACH ROW EXECUTE FUNCTION store.default_main_accountable_store();

CREATE TABLE store.asset_accountability_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  asset_id uuid NOT NULL REFERENCES store.assets(id),
  source_store_id uuid NOT NULL REFERENCES store.accountable_stores(id),
  destination_store_id uuid NOT NULL REFERENCES store.accountable_stores(id),
  transferred_at timestamptz NOT NULL DEFAULT now(),
  transferred_by text,
  remark text,
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  CHECK (source_store_id <> destination_store_id)
);
CREATE INDEX store_asset_accountability_transfers_asset_idx
  ON store.asset_accountability_transfers
    (organization_id, asset_id, transferred_at DESC);

CREATE TABLE store.department_stock_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  operation_type text NOT NULL CHECK (
    operation_type IN ('TRANSFER', 'CONSUMPTION', 'LOSS', 'DAMAGE')
  ),
  item_type_id uuid NOT NULL REFERENCES store.item_types(id),
  source_store_id uuid NOT NULL REFERENCES store.accountable_stores(id),
  destination_store_id uuid REFERENCES store.accountable_stores(id),
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  machine_reference text,
  job_card_reference text,
  operator_name text,
  operated_on date NOT NULL DEFAULT current_date,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  CHECK ((operation_type = 'TRANSFER') = (destination_store_id IS NOT NULL)),
  CHECK (destination_store_id IS NULL OR destination_store_id <> source_store_id)
);
CREATE INDEX store_department_stock_operations_store_idx
  ON store.department_stock_operations
    (organization_id, source_store_id, created_at DESC);
ALTER TABLE store.stock_movements
  ADD COLUMN department_stock_operation_id uuid
    REFERENCES store.department_stock_operations(id);

-- A location's consumable balance must never become negative, including when
-- an existing Main Store issue races a departmental transfer.
CREATE FUNCTION store.prevent_negative_consumable_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  current_balance numeric(18,3);
BEGIN
  IF NEW.asset_id IS NOT NULL OR NEW.quantity >= 0 THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.organization_id::text || ':' || NEW.item_type_id::text || ':' ||
      NEW.location_id::text, 0));
  SELECT COALESCE(sum(quantity), 0) INTO current_balance
  FROM store.stock_movements
  WHERE organization_id = NEW.organization_id
    AND item_type_id = NEW.item_type_id
    AND location_id = NEW.location_id AND asset_id IS NULL;
  IF current_balance + NEW.quantity < 0 THEN
    RAISE EXCEPTION 'Insufficient consumable quantity at Store location.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER store_nonnegative_consumable_balance
  BEFORE INSERT ON store.stock_movements
  FOR EACH ROW EXECUTE FUNCTION store.prevent_negative_consumable_balance();

CREATE TABLE store.gauge_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  set_code text NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  accountable_store_id uuid NOT NULL REFERENCES store.accountable_stores(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX store_gauge_sets_code_unique
  ON store.gauge_sets (organization_id, lower(set_code));
CREATE TABLE store.gauge_set_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  gauge_set_id uuid NOT NULL REFERENCES store.gauge_sets(id),
  asset_id uuid NOT NULL REFERENCES store.assets(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX store_gauge_set_one_active_membership
  ON store.gauge_set_memberships (organization_id, asset_id)
  WHERE removed_at IS NULL;
CREATE INDEX store_gauge_set_memberships_set_idx
  ON store.gauge_set_memberships (organization_id, gauge_set_id, removed_at);
CREATE TABLE store.gauge_set_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  gauge_set_id uuid NOT NULL REFERENCES store.gauge_sets(id),
  moved_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
ALTER TABLE store.stock_movements
  ADD COLUMN gauge_set_movement_id uuid REFERENCES store.gauge_set_movements(id);

GRANT SELECT, INSERT, UPDATE ON
  store.accountable_stores, store.asset_accountability_transfers,
  store.department_stock_operations,
  store.gauge_sets, store.gauge_set_memberships, store.gauge_set_movements
TO mrmpl_web;
GRANT SELECT ON
  store.accountable_stores, store.asset_accountability_transfers,
  store.department_stock_operations,
  store.gauge_sets, store.gauge_set_memberships, store.gauge_set_movements
TO mrmpl_worker, mrmpl_reporting;
