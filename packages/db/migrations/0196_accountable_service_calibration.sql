-- Service orders retain their originating accountable store even while the
-- physical Unit ID is with a supplier or a production department.
ALTER TABLE store.purchase_orders
  ADD COLUMN origin_store_id uuid REFERENCES store.accountable_stores(id);

UPDATE store.purchase_orders purchase_order
SET origin_store_id = COALESCE(
  (SELECT asset.accountable_store_id
   FROM store.assets asset
   WHERE asset.id = purchase_order.repair_asset_id),
  (SELECT asset.accountable_store_id
   FROM store.repair_purchase_order_items repair_item
   JOIN store.assets asset ON asset.id = repair_item.asset_id
   WHERE repair_item.purchase_order_id = purchase_order.id
   ORDER BY repair_item.created_at, repair_item.id
   LIMIT 1)
)
WHERE purchase_order.order_type = 'REPAIR';

ALTER TABLE store.purchase_orders
  ADD CONSTRAINT store_service_order_origin_required CHECK (
    order_type <> 'REPAIR' OR origin_store_id IS NOT NULL
  );
CREATE INDEX store_purchase_orders_origin_idx
  ON store.purchase_orders (organization_id, origin_store_id, order_date DESC)
  WHERE origin_store_id IS NOT NULL;

-- Failed supplier calibration remains with its open service PO. A new visit
-- can reuse that PO for corrective calibration and keep the failed record.
ALTER TABLE store.calibration_visits
  DROP CONSTRAINT calibration_visits_purchase_order_id_key;
CREATE INDEX store_calibration_visits_purchase_order_idx
  ON store.calibration_visits (purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;

ALTER TABLE store.calibration_visits
  DROP CONSTRAINT store_calibration_visit_stage_check;
ALTER TABLE store.calibration_visits
  ADD CONSTRAINT store_calibration_visit_stage_check CHECK (
    (method = 'IN_HOUSE' AND status = 'OPEN'
      AND selected_offer_id IS NULL AND agreed_price IS NULL
      AND purchase_order_id IS NULL AND outbound_movement_id IS NULL
      AND return_movement_id IS NULL AND maintenance_record_id IS NULL)
    OR (method = 'IN_HOUSE' AND status IN ('PASSED', 'FAILED')
      AND selected_offer_id IS NULL AND agreed_price IS NULL
      AND purchase_order_id IS NULL AND outbound_movement_id IS NULL
      AND return_movement_id IS NULL AND maintenance_record_id IS NOT NULL
      AND certificate_file_id IS NOT NULL)
    OR (method = 'IN_HOUSE' AND status = 'CANCELLED'
      AND selected_offer_id IS NULL AND agreed_price IS NULL
      AND purchase_order_id IS NULL AND outbound_movement_id IS NULL
      AND return_movement_id IS NULL AND maintenance_record_id IS NULL)
    OR (method = 'SUPPLIER' AND status = 'OPEN'
      AND (purchase_order_id IS NULL OR selected_offer_id IS NOT NULL)
      AND outbound_movement_id IS NULL AND return_movement_id IS NULL
      AND maintenance_record_id IS NULL AND certificate_file_id IS NULL)
    OR (method = 'SUPPLIER' AND status = 'DISPATCHED'
      AND selected_offer_id IS NOT NULL AND purchase_order_id IS NOT NULL
      AND outbound_movement_id IS NOT NULL AND return_movement_id IS NULL
      AND maintenance_record_id IS NULL AND certificate_file_id IS NULL)
    OR (method = 'SUPPLIER' AND status = 'RETURNED'
      AND selected_offer_id IS NOT NULL AND purchase_order_id IS NOT NULL
      AND outbound_movement_id IS NOT NULL AND return_movement_id IS NOT NULL
      AND maintenance_record_id IS NULL)
    OR (method = 'SUPPLIER' AND status IN ('PASSED', 'FAILED')
      AND selected_offer_id IS NOT NULL AND purchase_order_id IS NOT NULL
      AND outbound_movement_id IS NOT NULL AND return_movement_id IS NOT NULL
      AND maintenance_record_id IS NOT NULL AND certificate_file_id IS NOT NULL)
    OR (method = 'SUPPLIER' AND status = 'CANCELLED'
      AND (outbound_movement_id IS NULL OR return_movement_id IS NOT NULL)
      AND maintenance_record_id IS NULL AND certificate_file_id IS NULL)
  );

INSERT INTO identity.permissions (key, module, name, description) VALUES
  ('iso.calibration_plan.read', 'iso', 'View calibration plan',
    'View the ISO calibration plan and linked certificates.'),
  ('quality.control.calibration.read', 'quality', 'View calibration work',
    'View every Unit ID due for calibration across accountable stores.'),
  ('quality.control.calibration.write', 'quality', 'Record calibration',
    'Record calibration movement, certificate, and technical sign-off.'),
  ('quality.store.read', 'quality', 'View Quality Store',
    'View stock and Unit IDs accountable to Quality Store.'),
  ('quality.store.write', 'quality', 'Manage Quality Store',
    'Transfer, issue, and consume stock accountable to Quality Store.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.permissions (key, module, name, description)
SELECT format('operations.floors.%s.store.%s', floor.code, action.code),
  'operations',
  format('%s %s Store', action.label, floor.name),
  format('%s stock accountable to %s Store.', action.description, floor.name)
FROM (VALUES
  ('conventional', 'Conventional-01'),
  ('conventional-02', 'Conventional-02'),
  ('cnc', 'CNC-01'),
  ('forging', 'Forging')
) AS floor(code, name)
CROSS JOIN (VALUES
  ('read', 'View', 'View'),
  ('write', 'Manage', 'Manage')
) AS action(code, label, description)
ON CONFLICT (key) DO NOTHING;

-- Keep new store control scoped. Generic department roles are not granted all
-- production stores; administrators can assign individual floor permissions.
INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM identity.roles role
JOIN identity.permissions permission ON
  permission.key IN (
    'iso.calibration_plan.read',
    'quality.control.calibration.read', 'quality.control.calibration.write',
    'quality.store.read', 'quality.store.write'
  ) OR permission.key LIKE 'operations.floors.%.store.%'
WHERE role.key = 'administrator'
ON CONFLICT DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM identity.roles role
JOIN identity.permissions permission ON permission.key IN (
  'iso.calibration_plan.read',
  'quality.control.calibration.read', 'quality.control.calibration.write',
  'quality.store.read', 'quality.store.write'
)
WHERE role.key = 'quality-assurance-hod'
ON CONFLICT DO NOTHING;
