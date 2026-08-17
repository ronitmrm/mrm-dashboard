ALTER TABLE store.suppliers
  ADD COLUMN email text;

ALTER TABLE store.purchase_orders RENAME TO purchase_order_lines;
ALTER INDEX store.purchase_orders_pkey RENAME TO purchase_order_lines_pkey;
DROP INDEX store.store_purchase_orders_number_unique;
DROP INDEX store.store_purchase_orders_open_idx;

CREATE TABLE store.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  order_number text NOT NULL CHECK (length(btrim(order_number)) > 0),
  supplier_id uuid NOT NULL REFERENCES store.suppliers(id),
  order_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open', 'Partially Received', 'Received', 'Cancelled')),
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX store_purchase_order_headers_number_unique
  ON store.purchase_orders (organization_id, lower(order_number));
CREATE INDEX store_purchase_order_headers_open_idx
  ON store.purchase_orders (organization_id, status, order_date DESC);

ALTER TABLE store.purchase_order_lines
  ADD COLUMN purchase_order_id uuid;

UPDATE store.purchase_order_lines
SET purchase_order_id = gen_random_uuid();

INSERT INTO store.purchase_orders (
  id, organization_id, order_number, supplier_id, order_date, status, remark,
  created_at, updated_at, created_by_user_id, updated_by_user_id
)
SELECT purchase_order_id, organization_id, order_number, supplier_id,
  order_date, status, remark, created_at, updated_at,
  created_by_user_id, updated_by_user_id
FROM store.purchase_order_lines;

ALTER TABLE store.purchase_order_lines
  ALTER COLUMN purchase_order_id SET NOT NULL,
  ADD CONSTRAINT purchase_order_lines_purchase_order_id_fkey
    FOREIGN KEY (purchase_order_id) REFERENCES store.purchase_orders(id),
  DROP COLUMN order_number,
  DROP COLUMN supplier_id,
  DROP COLUMN order_date,
  DROP COLUMN status,
  DROP COLUMN remark;

CREATE INDEX store_purchase_order_lines_order_idx
  ON store.purchase_order_lines (organization_id, purchase_order_id, created_at);

ALTER TABLE store.receipts
  RENAME COLUMN purchase_order_id TO purchase_order_line_id;
ALTER TABLE store.receipts
  RENAME CONSTRAINT receipts_purchase_order_id_fkey
    TO receipts_purchase_order_line_id_fkey;
ALTER INDEX store.store_receipts_purchase_order_idx
  RENAME TO store_receipts_purchase_order_line_idx;

GRANT SELECT, INSERT, UPDATE ON
  store.purchase_orders, store.purchase_order_lines
TO mrmpl_web;
GRANT SELECT ON
  store.purchase_orders, store.purchase_order_lines
TO mrmpl_worker, mrmpl_reporting;
