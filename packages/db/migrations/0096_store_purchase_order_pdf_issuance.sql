-- Durable Store Purchase Order issuance state.
ALTER TABLE store.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check1,
  ADD COLUMN issuance_id uuid,
  ADD COLUMN issuance_fingerprint text,
  ADD COLUMN issuance_state text NOT NULL DEFAULT 'issued',
  ADD COLUMN issued_at timestamptz,
  ADD CONSTRAINT store_purchase_orders_issuance_state_check
    CHECK (issuance_state IN ('pending', 'issued')),
  ADD CONSTRAINT store_purchase_orders_issuance_identity_check CHECK (
    (issuance_id IS NULL AND issuance_fingerprint IS NULL)
    OR
    (issuance_id IS NOT NULL AND length(btrim(issuance_fingerprint)) > 0)
  );

UPDATE store.purchase_orders
SET issued_at = created_at
WHERE issuance_state = 'issued' AND issued_at IS NULL;

CREATE UNIQUE INDEX store_purchase_orders_issuance_unique
  ON store.purchase_orders (organization_id, issuance_id, supplier_id)
  WHERE issuance_id IS NOT NULL;

CREATE INDEX store_purchase_orders_issued_register_idx
  ON store.purchase_orders (organization_id, order_date DESC, created_at DESC)
  WHERE issuance_state = 'issued';
