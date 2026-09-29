-- One calibration visit belongs to one physical Unit ID and its timetable.
-- Supplier offers are visit-specific; the accepted price is copied onto the
-- visit so later quote revisions cannot change an issued service order.
CREATE UNIQUE INDEX store_asset_maintenance_schedules_id_asset_unique
  ON store.asset_maintenance_schedules (id, asset_id);

CREATE TABLE store.calibration_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  asset_id uuid NOT NULL REFERENCES store.assets(id),
  schedule_id uuid NOT NULL,
  due_on date NOT NULL,
  scope text NOT NULL CHECK (length(btrim(scope)) > 0),
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN (
      'OPEN', 'DISPATCHED', 'RETURNED', 'PASSED', 'FAILED', 'CANCELLED'
    )),
  selected_offer_id uuid,
  agreed_price numeric(18,2) CHECK (agreed_price >= 0),
  purchase_order_id uuid UNIQUE REFERENCES store.purchase_orders(id),
  outbound_movement_id uuid UNIQUE REFERENCES store.stock_movements(id),
  return_movement_id uuid UNIQUE REFERENCES store.stock_movements(id),
  maintenance_record_id uuid UNIQUE REFERENCES store.asset_maintenance_records(id),
  certificate_file_id uuid UNIQUE REFERENCES core.files(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  CONSTRAINT store_calibration_visit_schedule_asset_fk
    FOREIGN KEY (schedule_id, asset_id)
    REFERENCES store.asset_maintenance_schedules(id, asset_id),
  CONSTRAINT store_calibration_visit_offer_price_check CHECK (
    (selected_offer_id IS NULL AND agreed_price IS NULL)
    OR (selected_offer_id IS NOT NULL AND agreed_price IS NOT NULL)
  ),
  CONSTRAINT store_calibration_visit_stage_check CHECK (
    (status = 'OPEN'
      AND purchase_order_id IS NULL AND outbound_movement_id IS NULL
      AND return_movement_id IS NULL AND maintenance_record_id IS NULL
      AND certificate_file_id IS NULL)
    OR (status = 'DISPATCHED'
      AND selected_offer_id IS NOT NULL AND purchase_order_id IS NOT NULL
      AND outbound_movement_id IS NOT NULL AND return_movement_id IS NULL
      AND maintenance_record_id IS NULL AND certificate_file_id IS NULL)
    OR (status = 'RETURNED'
      AND selected_offer_id IS NOT NULL AND purchase_order_id IS NOT NULL
      AND outbound_movement_id IS NOT NULL AND return_movement_id IS NOT NULL
      AND maintenance_record_id IS NULL)
    OR (status IN ('PASSED', 'FAILED')
      AND selected_offer_id IS NOT NULL AND purchase_order_id IS NOT NULL
      AND outbound_movement_id IS NOT NULL AND return_movement_id IS NOT NULL
      AND maintenance_record_id IS NOT NULL
      AND certificate_file_id IS NOT NULL)
    OR (status = 'CANCELLED'
      AND (outbound_movement_id IS NULL OR return_movement_id IS NOT NULL)
      AND maintenance_record_id IS NULL AND certificate_file_id IS NULL)
  )
);

CREATE UNIQUE INDEX store_calibration_visits_one_open_schedule_unique
  ON store.calibration_visits (organization_id, schedule_id)
  WHERE status IN ('OPEN', 'DISPATCHED', 'RETURNED');
CREATE INDEX store_calibration_visits_asset_history_idx
  ON store.calibration_visits (organization_id, asset_id, created_at DESC);

CREATE TABLE store.calibration_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  visit_id uuid NOT NULL REFERENCES store.calibration_visits(id),
  supplier_id uuid NOT NULL REFERENCES store.suppliers(id),
  quoted_price numeric(18,2) NOT NULL CHECK (quoted_price >= 0),
  quoted_on date NOT NULL DEFAULT current_date,
  quote_reference text,
  notes text,
  quote_file_id uuid UNIQUE REFERENCES core.files(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  UNIQUE (id, visit_id)
);

CREATE INDEX store_calibration_offers_visit_idx
  ON store.calibration_offers (organization_id, visit_id, quoted_on DESC, created_at DESC);

ALTER TABLE store.calibration_visits
  ADD CONSTRAINT store_calibration_visit_selected_offer_fk
  FOREIGN KEY (selected_offer_id, id)
  REFERENCES store.calibration_offers(id, visit_id);

GRANT SELECT, INSERT, UPDATE ON store.calibration_visits TO mrmpl_web;
GRANT SELECT, INSERT ON store.calibration_offers TO mrmpl_web;
GRANT UPDATE (quote_file_id) ON store.calibration_offers TO mrmpl_web;
GRANT SELECT ON store.calibration_visits, store.calibration_offers
  TO mrmpl_worker, mrmpl_reporting;
