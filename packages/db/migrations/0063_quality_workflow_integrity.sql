-- Quality writes replace nested readings, so the web role needs narrowly
-- scoped delete access to those replaceable child rows.
GRANT DELETE ON
  quality.first_piece_readings,
  quality.first_piece_reading_samples,
  quality.hourly_check_readings
TO mrmpl_web;

-- Keep the newest active definition when historical imports contain the same
-- parameter/specification more than once for one setup.
WITH ranked_parameters AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY organization_id, operation_setup_id,
        lower(btrim(name)),
        lower(btrim(COALESCE(
          source_payload->'payload'->>'specification',
          source_payload->>'specification',
          nominal_value::text,
          ''
        )))
      ORDER BY updated_at DESC, id DESC
    ) AS duplicate_rank
  FROM quality.parameter_definitions
  WHERE active
)
UPDATE quality.parameter_definitions parameter
SET active = false,
  source_payload = CASE
    WHEN jsonb_typeof(parameter.source_payload->'payload') = 'object'
      THEN jsonb_set(
        parameter.source_payload,
        '{payload,status}',
        '"Inactive"'::jsonb,
        true
      )
    ELSE jsonb_set(
      COALESCE(parameter.source_payload, '{}'::jsonb),
      '{status}',
      '"Inactive"'::jsonb,
      true
    )
  END,
  updated_at = now(),
  row_version = parameter.row_version + 1
FROM ranked_parameters ranked
WHERE parameter.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX parameter_definitions_active_name_spec_unique
  ON quality.parameter_definitions (
    organization_id,
    operation_setup_id,
    lower(btrim(name)),
    lower(btrim(COALESCE(
      source_payload->'payload'->>'specification',
      source_payload->>'specification',
      nominal_value::text,
      ''
    )))
  )
  WHERE active;
