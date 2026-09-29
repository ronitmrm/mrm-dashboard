ALTER TABLE manufacturing.production_sessions
  DROP CONSTRAINT production_sessions_started_role_valid,
  ALTER COLUMN started_by_role SET DEFAULT 'machinist',
  ADD CONSTRAINT production_sessions_started_role_valid
    CHECK (started_by_role IN ('shop_floor', 'machinist'));
