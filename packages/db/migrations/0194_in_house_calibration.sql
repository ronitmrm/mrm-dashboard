ALTER TABLE store.calibration_visits
  ADD COLUMN method text NOT NULL DEFAULT 'SUPPLIER'
    CHECK (method IN ('SUPPLIER', 'IN_HOUSE'));

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
      AND purchase_order_id IS NULL AND outbound_movement_id IS NULL
      AND return_movement_id IS NULL AND maintenance_record_id IS NULL
      AND certificate_file_id IS NULL)
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
