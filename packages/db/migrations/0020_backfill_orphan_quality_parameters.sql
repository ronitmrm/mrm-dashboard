-- A legacy first-piece report can predate its parameter master. Materialize a
-- deterministic fallback parameter so every archived dimension and sample has
-- a relational home without changing the recorded inspection values.

WITH archived_dimensions AS (
  SELECT
    inspection.id AS inspection_id,
    inspection.organization_id,
    inspection.operation_setup_id,
    inspection.source_id AS inspection_source_id,
    setup.route_option_id,
    route.item_id,
    dimension.value AS dimension,
    dimension.ordinality::integer AS sequence
  FROM quality.first_piece_inspections inspection
  JOIN manufacturing.operation_setups setup
    ON setup.id = inspection.operation_setup_id
  JOIN manufacturing.route_options route
    ON route.id = setup.route_option_id
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(inspection.source_payload->'payload'->'dimensions', '[]'::jsonb)
  ) WITH ORDINALITY AS dimension(value, ordinality)
), missing_dimensions AS (
  SELECT archived.*
  FROM archived_dimensions archived
  WHERE NOT EXISTS (
    SELECT 1
    FROM quality.parameter_definitions definition
    WHERE definition.organization_id = archived.organization_id
      AND definition.operation_setup_id = archived.operation_setup_id
      AND definition.active
      AND (
        lower(definition.parameter_code) = lower(COALESCE(
          archived.dimension->>'parameterCode',
          archived.dimension->>'code',
          archived.dimension->>'uid',
          ''
        ))
        OR lower(definition.name) = lower(COALESCE(
          archived.dimension->>'parameterName',
          archived.dimension->>'description',
          archived.dimension->>'name',
          ''
        ))
      )
  )
)
INSERT INTO quality.parameter_definitions (
  organization_id,
  item_id,
  route_option_id,
  operation_setup_id,
  parameter_code,
  name,
  data_type,
  unit,
  lower_limit,
  upper_limit,
  nominal_value,
  sequence,
  active,
  source_system,
  source_table,
  source_id,
  source_payload
)
SELECT
  missing.organization_id,
  missing.item_id,
  missing.route_option_id,
  missing.operation_setup_id,
  'LEGACY-' || left(md5(
    lower(COALESCE(
      missing.dimension->>'parameterName',
      missing.dimension->>'description',
      missing.dimension->>'name',
      'dimension-' || missing.sequence::text
    )) || '|' || COALESCE(missing.dimension->>'specification', '')
  ), 16),
  COALESCE(
    NULLIF(missing.dimension->>'parameterName', ''),
    NULLIF(missing.dimension->>'description', ''),
    NULLIF(missing.dimension->>'name', ''),
    'Legacy dimension ' || missing.sequence::text
  ),
  CASE
    WHEN migration.try_numeric(missing.dimension->'readings'->>0) IS NOT NULL
      THEN 'numeric'
    ELSE 'text'
  END,
  NULLIF(missing.dimension->>'unit', ''),
  CASE
    WHEN migration.try_numeric(missing.dimension->>'specification') IS NOT NULL
      AND migration.try_numeric(missing.dimension->>'toleranceMinus') IS NOT NULL
    THEN migration.try_numeric(missing.dimension->>'specification')
      - abs(migration.try_numeric(missing.dimension->>'toleranceMinus'))
  END,
  CASE
    WHEN migration.try_numeric(missing.dimension->>'specification') IS NOT NULL
      AND migration.try_numeric(missing.dimension->>'tolerancePlus') IS NOT NULL
    THEN migration.try_numeric(missing.dimension->>'specification')
      + abs(migration.try_numeric(missing.dimension->>'tolerancePlus'))
  END,
  migration.try_numeric(missing.dimension->>'specification'),
  missing.sequence,
  true,
  'convex_snapshot',
  'first_piece_inspection_orphan_parameter',
  missing.inspection_source_id || ':' || missing.sequence::text,
  missing.dimension
FROM missing_dimensions missing
ON CONFLICT (
  item_id,
  route_option_id,
  operation_setup_id,
  lower(parameter_code)
) DO NOTHING;

WITH archived_dimensions AS (
  SELECT
    inspection.id AS inspection_id,
    inspection.organization_id,
    inspection.operation_setup_id,
    dimension.value AS dimension,
    dimension.ordinality::integer AS sequence
  FROM quality.first_piece_inspections inspection
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(inspection.source_payload->'payload'->'dimensions', '[]'::jsonb)
  ) WITH ORDINALITY AS dimension(value, ordinality)
), resolved_dimensions AS (
  SELECT archived.*, parameter.*
  FROM archived_dimensions archived
  JOIN LATERAL (
    SELECT
      definition.id AS parameter_definition_id,
      definition.data_type,
      definition.lower_limit,
      definition.upper_limit
    FROM quality.parameter_definitions definition
    WHERE definition.organization_id = archived.organization_id
      AND definition.operation_setup_id = archived.operation_setup_id
      AND definition.active
      AND lower(definition.name) = lower(COALESCE(
        archived.dimension->>'parameterName',
        archived.dimension->>'description',
        archived.dimension->>'name',
        ''
      ))
    ORDER BY
      CASE WHEN migration.try_numeric(archived.dimension->>'specification') IS NULL
        THEN 0
        ELSE abs(
          COALESCE(definition.nominal_value, 0)
          - migration.try_numeric(archived.dimension->>'specification')
        )
      END,
      definition.sequence,
      definition.id
    LIMIT 1
  ) parameter ON true
)
INSERT INTO quality.first_piece_readings (
  organization_id,
  inspection_id,
  parameter_definition_id,
  numeric_value,
  text_value,
  boolean_value,
  result,
  sequence
)
SELECT
  resolved.organization_id,
  resolved.inspection_id,
  resolved.parameter_definition_id,
  CASE WHEN resolved.data_type = 'numeric'
    THEN migration.try_numeric(resolved.dimension->'readings'->>0)
  END,
  CASE WHEN resolved.data_type NOT IN ('numeric', 'boolean')
    THEN resolved.dimension->'readings'->>0
  END,
  CASE WHEN resolved.data_type = 'boolean' THEN
    lower(trim(resolved.dimension->'readings'->>0)) IN ('true', 'yes', '1', 'ok', 'pass')
  END,
  CASE
    WHEN resolved.data_type = 'numeric' AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(resolved.dimension->'readings', '[]'::jsonb)) sample
      WHERE migration.try_numeric(sample #>> '{}') IS NULL
        OR (resolved.lower_limit IS NOT NULL
          AND migration.try_numeric(sample #>> '{}') < resolved.lower_limit)
        OR (resolved.upper_limit IS NOT NULL
          AND migration.try_numeric(sample #>> '{}') > resolved.upper_limit)
    ) THEN 'Not OK'
    ELSE 'OK'
  END,
  resolved.sequence
FROM resolved_dimensions resolved
ON CONFLICT (inspection_id, parameter_definition_id) DO NOTHING;

WITH archived_dimensions AS (
  SELECT
    inspection.id AS inspection_id,
    inspection.organization_id,
    inspection.operation_setup_id,
    dimension.value AS dimension
  FROM quality.first_piece_inspections inspection
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(inspection.source_payload->'payload'->'dimensions', '[]'::jsonb)
  ) AS dimension(value)
), resolved_dimensions AS (
  SELECT archived.*, parameter.*
  FROM archived_dimensions archived
  JOIN LATERAL (
    SELECT
      definition.id AS parameter_definition_id,
      definition.data_type,
      definition.lower_limit,
      definition.upper_limit
    FROM quality.parameter_definitions definition
    WHERE definition.organization_id = archived.organization_id
      AND definition.operation_setup_id = archived.operation_setup_id
      AND definition.active
      AND lower(definition.name) = lower(COALESCE(
        archived.dimension->>'parameterName',
        archived.dimension->>'description',
        archived.dimension->>'name',
        ''
      ))
    ORDER BY
      CASE WHEN migration.try_numeric(archived.dimension->>'specification') IS NULL
        THEN 0
        ELSE abs(
          COALESCE(definition.nominal_value, 0)
          - migration.try_numeric(archived.dimension->>'specification')
        )
      END,
      definition.sequence,
      definition.id
    LIMIT 1
  ) parameter ON true
)
INSERT INTO quality.first_piece_reading_samples (
  organization_id,
  reading_id,
  sample_number,
  numeric_value,
  text_value,
  boolean_value,
  result,
  source_payload
)
SELECT
  resolved.organization_id,
  reading.id,
  sample.ordinality::integer,
  CASE WHEN resolved.data_type = 'numeric'
    THEN migration.try_numeric(sample.value #>> '{}')
  END,
  CASE WHEN resolved.data_type NOT IN ('numeric', 'boolean')
    THEN sample.value #>> '{}'
  END,
  CASE WHEN resolved.data_type = 'boolean' THEN
    lower(trim(sample.value #>> '{}')) IN ('true', 'yes', '1', 'ok', 'pass')
  END,
  CASE
    WHEN resolved.data_type = 'numeric' AND (
      migration.try_numeric(sample.value #>> '{}') IS NULL
      OR (resolved.lower_limit IS NOT NULL
        AND migration.try_numeric(sample.value #>> '{}') < resolved.lower_limit)
      OR (resolved.upper_limit IS NOT NULL
        AND migration.try_numeric(sample.value #>> '{}') > resolved.upper_limit)
    ) THEN 'Not OK'
    ELSE 'OK'
  END,
  jsonb_build_object('dimension', resolved.dimension, 'value', sample.value)
FROM resolved_dimensions resolved
JOIN quality.first_piece_readings reading
  ON reading.inspection_id = resolved.inspection_id
  AND reading.parameter_definition_id = resolved.parameter_definition_id
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(resolved.dimension->'readings', '[]'::jsonb)
) WITH ORDINALITY AS sample(value, ordinality)
ON CONFLICT (reading_id, sample_number) DO NOTHING;
