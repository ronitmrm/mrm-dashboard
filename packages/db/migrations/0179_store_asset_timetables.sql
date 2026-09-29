ALTER TABLE store.asset_maintenance_schedules
  ALTER COLUMN definition_id DROP NOT NULL,
  ADD COLUMN schedule_type text NOT NULL DEFAULT 'MAINTENANCE'
    CHECK (schedule_type IN ('MAINTENANCE', 'CALIBRATION')),
  ADD COLUMN name text,
  ADD COLUMN frequency_days integer CHECK (frequency_days > 0),
  ADD CONSTRAINT store_asset_timetable_source_check CHECK (
    (definition_id IS NOT NULL AND name IS NULL AND frequency_days IS NULL)
    OR (definition_id IS NULL AND name IS NOT NULL
      AND length(btrim(name)) > 0 AND frequency_days IS NOT NULL)
  );
