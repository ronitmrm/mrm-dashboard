-- Keep the bounded dashboard source projection aligned with every supported
-- production floor, including full unit names retained from spreadsheet rows.

CREATE OR REPLACE FUNCTION derived.dashboard_production_floor_code(
  payload jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN normalized.value IN (
      'conventional 02',
      'production planning and control conventional 02'
    ) THEN 'conventional-02'
    WHEN normalized.value IN (
      'cnc',
      'cnc 01',
      'production planning and control cnc 01'
    ) THEN 'cnc'
    WHEN normalized.value IN (
      'forging',
      'production planning and control forging'
    ) THEN 'forging'
    ELSE 'conventional'
  END
  FROM (
    SELECT regexp_replace(
      lower(replace(btrim(COALESCE(
        payload ->> 'productionFloorCode',
        payload ->> 'productionFloor',
        payload ->> 'productionUnit',
        payload ->> 'Production Unit',
        payload #>> '{payload,productionFloorCode}',
        payload #>> '{payload,productionFloor}',
        payload #>> '{payload,productionUnit}',
        payload #>> '{payload,Production Unit}',
        payload #>> '{sourcePayload,productionFloorCode}',
        payload #>> '{sourcePayload,productionFloor}',
        payload #>> '{sourcePayload,productionUnit}',
        payload #>> '{sourcePayload,Production Unit}',
        ''
      )), '&', ' and ')),
      '[^a-z0-9]+',
      ' ',
      'g'
    ) AS value
  ) normalized
$$;

WITH updated AS (
  UPDATE derived.dashboard_source_records
  SET production_floor_code =
    derived.dashboard_production_floor_code(source_payload)
  WHERE production_floor_code IS DISTINCT FROM
    derived.dashboard_production_floor_code(source_payload)
  RETURNING organization_id
), updated_organizations AS (
  SELECT DISTINCT organization_id
  FROM updated
)
INSERT INTO derived.refresh_jobs (
  organization_id,
  queue_key,
  idempotency_key,
  status,
  run_after
)
SELECT
  updated_organizations.organization_id,
  'dashboard',
  gen_random_uuid()::text,
  'pending',
  now()
FROM updated_organizations
ON CONFLICT (organization_id, queue_key)
  WHERE status IN ('pending', 'running')
DO UPDATE SET
  run_after = LEAST(derived.refresh_jobs.run_after, now()),
  updated_at = now(),
  last_error = NULL;

ANALYZE derived.dashboard_source_records;
