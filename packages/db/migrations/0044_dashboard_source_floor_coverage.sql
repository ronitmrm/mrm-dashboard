-- Materialize the dashboard's floor-normalization contract so bounded source
-- reads can count and limit each category/floor through ordered indexes.

CREATE OR REPLACE FUNCTION derived.dashboard_production_floor_code(
  payload jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN lower(btrim(COALESCE(
      payload ->> 'productionFloorCode',
      payload ->> 'productionFloor',
      payload #>> '{payload,productionFloorCode}',
      payload #>> '{payload,productionFloor}',
      payload #>> '{sourcePayload,productionFloorCode}',
      payload #>> '{sourcePayload,productionFloor}',
      ''
    ))) IN ('conventional', 'cnc', 'forging')
    THEN lower(btrim(COALESCE(
      payload ->> 'productionFloorCode',
      payload ->> 'productionFloor',
      payload #>> '{payload,productionFloorCode}',
      payload #>> '{payload,productionFloor}',
      payload #>> '{sourcePayload,productionFloorCode}',
      payload #>> '{sourcePayload,productionFloor}',
      ''
    )))
    ELSE 'conventional'
  END
$$;

ALTER TABLE derived.dashboard_source_records
  ADD COLUMN production_floor_code text;

UPDATE derived.dashboard_source_records
SET production_floor_code =
  derived.dashboard_production_floor_code(source_payload);

ALTER TABLE derived.dashboard_source_records
  ALTER COLUMN production_floor_code SET NOT NULL;

CREATE OR REPLACE FUNCTION derived.set_dashboard_source_floor_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.production_floor_code :=
    derived.dashboard_production_floor_code(NEW.source_payload);
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_dashboard_source_floor_code
BEFORE INSERT OR UPDATE OF source_payload
ON derived.dashboard_source_records
FOR EACH ROW
EXECUTE FUNCTION derived.set_dashboard_source_floor_code();

CREATE INDEX dashboard_source_records_entry_floor_read_idx
  ON derived.dashboard_source_records (
    organization_id, source_kind, entry_type, production_floor_code,
    changed_at DESC, source_id DESC
  )
  INCLUDE (source_group);

CREATE INDEX dashboard_source_records_group_floor_read_idx
  ON derived.dashboard_source_records (
    organization_id, source_kind, source_group, production_floor_code,
    changed_at DESC, source_id DESC
  )
  INCLUDE (entry_type);

CREATE INDEX dashboard_source_records_correction_floor_read_idx
  ON derived.dashboard_source_records (
    organization_id, production_floor_code,
    changed_at DESC, source_id DESC
  )
  INCLUDE (source_group, entry_type)
  WHERE source_kind = 'correction';

DROP INDEX derived.dashboard_source_records_bounded_read_idx;
DROP INDEX derived.dashboard_source_records_group_read_idx;
DROP INDEX derived.dashboard_source_records_entry_type_read_idx;
DROP INDEX derived.dashboard_source_records_physical_group_read_idx;

ANALYZE derived.dashboard_source_records;
