ALTER TABLE store.purchase_orders
  DROP CONSTRAINT purchase_orders_repair_details_check,
  ADD CONSTRAINT purchase_orders_repair_details_check CHECK (
    (order_type = 'GOODS' AND repair_asset_id IS NULL
      AND service_description IS NULL AND service_price IS NULL)
    OR (order_type = 'REPAIR' AND (
      (repair_asset_id IS NULL AND service_description IS NULL
        AND service_price IS NULL)
      OR (repair_asset_id IS NOT NULL
        AND length(btrim(service_description)) > 0 AND service_price >= 0)
    ))
  );

CREATE TABLE store.repair_purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  purchase_order_id uuid NOT NULL REFERENCES store.purchase_orders(id),
  asset_id uuid NOT NULL REFERENCES store.assets(id),
  service_description text NOT NULL CHECK (length(btrim(service_description)) > 0),
  service_price numeric(18,2) NOT NULL CHECK (service_price >= 0),
  status text NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open', 'Completed', 'Cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_order_id, asset_id)
);

INSERT INTO store.repair_purchase_order_items (
  organization_id, purchase_order_id, asset_id,
  service_description, service_price, status
)
SELECT organization_id, id, repair_asset_id,
  service_description, service_price,
  CASE WHEN status = 'Completed' THEN 'Completed'
    WHEN status = 'Cancelled' THEN 'Cancelled' ELSE 'Open' END
FROM store.purchase_orders
WHERE order_type = 'REPAIR' AND repair_asset_id IS NOT NULL;

CREATE UNIQUE INDEX store_repair_purchase_order_items_one_open_asset_unique
  ON store.repair_purchase_order_items (organization_id, asset_id)
  WHERE status = 'Open';
CREATE INDEX store_repair_purchase_order_items_order_idx
  ON store.repair_purchase_order_items (organization_id, purchase_order_id);

CREATE FUNCTION store.sync_single_unit_repair_order_item()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_type <> 'REPAIR' OR NEW.repair_asset_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO store.repair_purchase_order_items (
      organization_id, purchase_order_id, asset_id,
      service_description, service_price, status
    ) VALUES (
      NEW.organization_id, NEW.id, NEW.repair_asset_id,
      NEW.service_description, NEW.service_price,
      CASE WHEN NEW.status = 'Completed' THEN 'Completed'
        WHEN NEW.status = 'Cancelled' THEN 'Cancelled' ELSE 'Open' END
    );
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE store.repair_purchase_order_items
    SET status = CASE WHEN NEW.status = 'Completed' THEN 'Completed'
      WHEN NEW.status = 'Cancelled' THEN 'Cancelled' ELSE 'Open' END
    WHERE purchase_order_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_single_unit_repair_order_item
AFTER INSERT OR UPDATE OF status ON store.purchase_orders
FOR EACH ROW EXECUTE FUNCTION store.sync_single_unit_repair_order_item();

GRANT SELECT, INSERT, UPDATE ON store.repair_purchase_order_items TO mrmpl_web;
GRANT SELECT ON store.repair_purchase_order_items TO mrmpl_worker, mrmpl_reporting;
