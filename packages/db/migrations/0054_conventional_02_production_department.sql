UPDATE manufacturing.production_floors
SET name = 'Conventional-01 Production Department',
  updated_at = now()
WHERE code = 'conventional'
  AND name IS DISTINCT FROM 'Conventional-01 Production Department';

UPDATE manufacturing.production_floors
SET name = 'Production Planning & Control CNC-01',
  updated_at = now()
WHERE code = 'cnc'
  AND name IS DISTINCT FROM 'Production Planning & Control CNC-01';

INSERT INTO manufacturing.production_floors (
  organization_id,
  code,
  name
)
SELECT
  organization.id,
  'conventional-02',
  'Conventional-02 Production Department'
FROM core.organizations organization
ON CONFLICT (organization_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  active = true,
  updated_at = now();

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
    ))) IN ('conventional', 'conventional-02', 'cnc', 'forging')
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
