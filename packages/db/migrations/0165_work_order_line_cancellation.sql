BEGIN;

ALTER TABLE manufacturing.work_orders
  ADD COLUMN cancellation_reason text,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancelled_by_user_id uuid
    REFERENCES identity.users(id) ON DELETE SET NULL;

CREATE INDEX work_orders_cancelled_at_idx
  ON manufacturing.work_orders (organization_id, cancelled_at DESC)
  WHERE status = 'Cancelled';

COMMIT;
