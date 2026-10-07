ALTER TABLE store.assets
  DROP CONSTRAINT assets_status_check;
ALTER TABLE store.assets
  ADD CONSTRAINT assets_status_check
    CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'UNDER_MAINTENANCE', 'BROKEN', 'SCRAPPED', 'LOST'));

ALTER TABLE store.stock_movements
  DROP CONSTRAINT stock_movements_movement_type_check;
ALTER TABLE store.stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
    CHECK (movement_type IN ('RECEIPT', 'ISSUE', 'RETURN', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'SCRAP', 'LOSS'));
