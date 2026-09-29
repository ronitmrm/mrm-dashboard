ALTER TABLE manufacturing.production_sessions
  DROP CONSTRAINT production_sessions_closed_role_valid,
  ADD CONSTRAINT production_sessions_closed_role_valid
    CHECK (closed_by_role IS NULL OR closed_by_role IN (
      'shop_floor', 'quality', 'authorized_staff'
    ));
