BEGIN;

ALTER TABLE store.suppliers
  ADD COLUMN gst_number text,
  ADD COLUMN address text;

-- Existing duplicate names are one business party under the new rule. Repoint
-- their history to the oldest record before enforcing the invariant.
CREATE TEMP TABLE store_supplier_merge ON COMMIT DROP AS
WITH ranked AS (
  SELECT id, organization_id,
    first_value(id) OVER (
      PARTITION BY organization_id,
        lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
      ORDER BY created_at, id
    ) AS keeper_id,
    row_number() OVER (
      PARTITION BY organization_id,
        lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
      ORDER BY created_at, id
    ) AS duplicate_rank
  FROM store.suppliers
)
SELECT id AS duplicate_id, keeper_id
FROM ranked
WHERE duplicate_rank > 1;

UPDATE store.supplier_prices price
SET supplier_id = merge.keeper_id
FROM store_supplier_merge merge
WHERE price.supplier_id = merge.duplicate_id;

UPDATE store.purchase_orders purchase_order
SET supplier_id = merge.keeper_id
FROM store_supplier_merge merge
WHERE purchase_order.supplier_id = merge.duplicate_id;

UPDATE store.receipts receipt
SET supplier_id = merge.keeper_id
FROM store_supplier_merge merge
WHERE receipt.supplier_id = merge.duplicate_id;

UPDATE store.suppliers keeper
SET email = COALESCE(keeper.email, merged.email),
  contact_details = COALESCE(keeper.contact_details, merged.contact_details),
  updated_at = now()
FROM (
  SELECT merge.keeper_id,
    max(NULLIF(btrim(duplicate.email), '')) AS email,
    max(NULLIF(btrim(duplicate.contact_details), '')) AS contact_details
  FROM store_supplier_merge merge
  JOIN store.suppliers duplicate ON duplicate.id = merge.duplicate_id
  GROUP BY merge.keeper_id
) merged
WHERE keeper.id = merged.keeper_id;

DELETE FROM store.suppliers supplier
USING store_supplier_merge merge
WHERE supplier.id = merge.duplicate_id;

UPDATE store.suppliers
SET name = regexp_replace(btrim(name), '\s+', ' ', 'g'),
  gst_number = NULLIF(upper(regexp_replace(btrim(gst_number), '\s+', '', 'g')), ''),
  address = NULLIF(btrim(address), ''),
  updated_at = now();

ALTER TABLE store.suppliers
  ADD CONSTRAINT store_suppliers_normalized_name_check CHECK (
    name = regexp_replace(btrim(name), '\s+', ' ', 'g')
  ),
  ADD CONSTRAINT store_suppliers_normalized_gst_check CHECK (
    gst_number IS NULL
    OR gst_number = upper(regexp_replace(btrim(gst_number), '\s+', '', 'g'))
  );

CREATE UNIQUE INDEX store_suppliers_name_unique
  ON store.suppliers (organization_id, lower(name));
CREATE UNIQUE INDEX store_suppliers_gst_unique
  ON store.suppliers (organization_id, lower(gst_number))
  WHERE gst_number IS NOT NULL;

INSERT INTO store.number_counters (
  organization_id, counter_key, counter_year, current_value
)
SELECT organization_id, 'SUPPLIER', 0,
  greatest(
    count(*)::integer,
    COALESCE(max(
      CASE WHEN code ~* '^SUP-[0-9]+$'
        THEN substring(code FROM '[0-9]+$')::integer
      END
    ), 0)
  )
FROM store.suppliers
GROUP BY organization_id
ON CONFLICT (organization_id, counter_key, counter_year)
DO UPDATE SET current_value = greatest(
  store.number_counters.current_value,
  EXCLUDED.current_value
);

ALTER TABLE store.supplier_prices
  ADD COLUMN active boolean NOT NULL DEFAULT true,
  ADD COLUMN superseded_at timestamptz;

WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY organization_id, item_type_id, supplier_id
      ORDER BY valid_from DESC, created_at DESC, id DESC
    ) AS revision_rank
  FROM store.supplier_prices
)
UPDATE store.supplier_prices price
SET active = false, superseded_at = now()
FROM ranked
WHERE ranked.id = price.id AND ranked.revision_rank > 1;

CREATE UNIQUE INDEX store_supplier_prices_one_active_unique
  ON store.supplier_prices (organization_id, item_type_id, supplier_id)
  WHERE active;
CREATE INDEX store_supplier_prices_recommendation_idx
  ON store.supplier_prices (
    organization_id, item_type_id, active, valid_from, unit_price
  );

ALTER TABLE store.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check,
  ADD COLUMN order_type text NOT NULL DEFAULT 'GOODS',
  ADD COLUMN repair_asset_id uuid REFERENCES store.assets(id),
  ADD COLUMN service_description text,
  ADD COLUMN service_price numeric(18,2),
  ADD CONSTRAINT purchase_orders_status_check
    CHECK (status IN (
      'Open', 'Partially Received', 'Received', 'Completed', 'Cancelled'
    )),
  ADD CONSTRAINT purchase_orders_type_check
    CHECK (order_type IN ('GOODS', 'REPAIR')),
  ADD CONSTRAINT purchase_orders_repair_details_check CHECK (
    (order_type = 'GOODS'
      AND repair_asset_id IS NULL
      AND service_description IS NULL
      AND service_price IS NULL)
    OR
    (order_type = 'REPAIR'
      AND repair_asset_id IS NOT NULL
      AND length(btrim(service_description)) > 0
      AND service_price >= 0)
  );
CREATE INDEX store_purchase_orders_repair_asset_idx
  ON store.purchase_orders (organization_id, repair_asset_id, order_date DESC)
  WHERE repair_asset_id IS NOT NULL;
CREATE UNIQUE INDEX store_purchase_orders_one_open_repair_unique
  ON store.purchase_orders (organization_id, repair_asset_id)
  WHERE order_type = 'REPAIR' AND status NOT IN ('Completed', 'Cancelled');

ALTER TABLE store.assets
  DROP CONSTRAINT assets_current_holder_type_check,
  ADD COLUMN current_supplier_id uuid REFERENCES store.suppliers(id),
  ADD CONSTRAINT assets_current_holder_type_check
    CHECK (current_holder_type IN (
      'STORE', 'MACHINE', 'UNIT', 'DEPARTMENT', 'PERSON', 'VENDOR', 'SUPPLIER'
    ));
CREATE INDEX store_assets_supplier_idx
  ON store.assets (organization_id, current_supplier_id)
  WHERE current_supplier_id IS NOT NULL;

ALTER TABLE store.documents
  DROP CONSTRAINT documents_document_type_check,
  DROP CONSTRAINT documents_check,
  ADD COLUMN item_type_id uuid REFERENCES store.item_types(id),
  ADD CONSTRAINT documents_document_type_check
    CHECK (document_type IN (
      'BILL', 'GUARANTEE_CARD', 'CALIBRATION_CERTIFICATE', 'ASSET_DRAWING',
      'OTHER'
    )),
  ADD CONSTRAINT documents_parent_check CHECK (
    asset_id IS NOT NULL
    OR receipt_id IS NOT NULL
    OR maintenance_record_id IS NOT NULL
    OR item_type_id IS NOT NULL
  );
CREATE UNIQUE INDEX store_documents_current_item_drawing_unique
  ON store.documents (organization_id, item_type_id)
  WHERE document_type = 'ASSET_DRAWING';

COMMIT;
