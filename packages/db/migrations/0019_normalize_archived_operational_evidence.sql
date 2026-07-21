-- Normalize nested operational evidence that was retained losslessly in
-- source_payload during the Convex snapshot migration.

ALTER TABLE maintenance.checklist_items
  ADD COLUMN active boolean NOT NULL DEFAULT true;

UPDATE maintenance.checklist_items
SET active = NOT (
  lower(COALESCE(
    source_payload->'payload'->>'status',
    source_payload->>'status',
    'active'
  )) = 'inactive'
);

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
    ORDER BY
      CASE WHEN lower(definition.parameter_code) = lower(COALESCE(
        archived.dimension->>'parameterCode',
        archived.dimension->>'code',
        archived.dimension->>'uid',
        ''
      )) THEN 0 ELSE 1 END,
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
    WHEN resolved.data_type = 'boolean'
      AND NOT (lower(trim(resolved.dimension->'readings'->>0)) IN ('true', 'yes', '1', 'ok', 'pass'))
      THEN 'Not OK'
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
    ORDER BY
      CASE WHEN lower(definition.parameter_code) = lower(COALESCE(
        archived.dimension->>'parameterCode',
        archived.dimension->>'code',
        archived.dimension->>'uid',
        ''
      )) THEN 0 ELSE 1 END,
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
    WHEN resolved.data_type = 'boolean'
      AND NOT (lower(trim(sample.value #>> '{}')) IN ('true', 'yes', '1', 'ok', 'pass'))
      THEN 'Not OK'
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

WITH archived_readings AS (
  SELECT
    check_row.id AS hourly_check_id,
    check_row.organization_id,
    check_row.operation_setup_id,
    reading.value AS reading,
    reading.ordinality::integer AS sequence
  FROM quality.hourly_checks check_row
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(check_row.source_payload->'payload'->'readings', '[]'::jsonb)
  ) WITH ORDINALITY AS reading(value, ordinality)
), resolved_readings AS (
  SELECT archived.*, parameter.*
  FROM archived_readings archived
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
      AND (
        lower(definition.parameter_code) = lower(COALESCE(
          archived.reading->>'parameterCode',
          archived.reading->>'code',
          archived.reading->>'uid',
          ''
        ))
        OR lower(definition.name) = lower(COALESCE(
          archived.reading->>'parameterName',
          archived.reading->>'description',
          archived.reading->>'name',
          ''
        ))
      )
    ORDER BY
      CASE WHEN lower(definition.parameter_code) = lower(COALESCE(
        archived.reading->>'parameterCode',
        archived.reading->>'code',
        archived.reading->>'uid',
        ''
      )) THEN 0 ELSE 1 END,
      CASE WHEN migration.try_numeric(archived.reading->>'specification') IS NULL
        THEN 0
        ELSE abs(
          COALESCE(definition.nominal_value, 0)
          - migration.try_numeric(archived.reading->>'specification')
        )
      END,
      definition.sequence,
      definition.id
    LIMIT 1
  ) parameter ON true
)
INSERT INTO quality.hourly_check_readings (
  organization_id,
  hourly_check_id,
  parameter_definition_id,
  numeric_value,
  text_value,
  boolean_value,
  result,
  sequence
)
SELECT
  resolved.organization_id,
  resolved.hourly_check_id,
  resolved.parameter_definition_id,
  CASE WHEN resolved.data_type = 'numeric'
    THEN migration.try_numeric(resolved.reading->>'actualReading')
  END,
  CASE WHEN resolved.data_type NOT IN ('numeric', 'boolean')
    THEN resolved.reading->>'actualReading'
  END,
  CASE WHEN resolved.data_type = 'boolean' THEN
    lower(trim(resolved.reading->>'actualReading')) IN ('true', 'yes', '1', 'ok', 'pass')
  END,
  COALESCE(
    NULLIF(resolved.reading->>'result', ''),
    CASE
      WHEN resolved.data_type = 'numeric' AND (
        migration.try_numeric(resolved.reading->>'actualReading') IS NULL
        OR (resolved.lower_limit IS NOT NULL
          AND migration.try_numeric(resolved.reading->>'actualReading') < resolved.lower_limit)
        OR (resolved.upper_limit IS NOT NULL
          AND migration.try_numeric(resolved.reading->>'actualReading') > resolved.upper_limit)
      ) THEN 'Not OK'
      WHEN resolved.data_type = 'boolean'
        AND NOT (lower(trim(resolved.reading->>'actualReading')) IN ('true', 'yes', '1', 'ok', 'pass'))
        THEN 'Not OK'
      ELSE 'OK'
    END
  ),
  resolved.sequence
FROM resolved_readings resolved
ON CONFLICT (hourly_check_id, parameter_definition_id) DO NOTHING;

WITH archived_items AS (
  SELECT
    session.id AS session_id,
    session.organization_id,
    session.template_id,
    item.value AS item,
    item.ordinality::integer AS sequence
  FROM quality.setup_checklist_sessions session
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(session.source_payload->'payload'->'items', '[]'::jsonb)
  ) WITH ORDINALITY AS item(value, ordinality)
), resolved_items AS (
  SELECT archived.*, template_item.id AS template_item_id,
    template_item.response_type
  FROM archived_items archived
  JOIN LATERAL (
    SELECT item.*
    FROM quality.setup_checklist_template_items item
    WHERE item.template_id = archived.template_id
      AND item.active
      AND (
        lower(item.item_key) = lower(COALESCE(archived.item->>'itemKey', ''))
        OR lower(item.prompt) = lower(COALESCE(
          archived.item->>'checkPoint',
          archived.item->>'prompt',
          ''
        ))
        OR item.sequence = COALESCE(
          migration.try_numeric(archived.item->>'sequence')::integer,
          archived.sequence
        )
      )
    ORDER BY
      CASE WHEN lower(item.prompt) = lower(COALESCE(
        archived.item->>'checkPoint',
        archived.item->>'prompt',
        ''
      )) THEN 0 ELSE 1 END,
      item.sequence,
      item.id
    LIMIT 1
  ) template_item ON true
)
INSERT INTO quality.setup_checklist_results (
  organization_id,
  session_id,
  template_item_id,
  response_text,
  response_numeric,
  response_boolean,
  phase
)
SELECT
  resolved.organization_id,
  resolved.session_id,
  resolved.template_item_id,
  CASE WHEN resolved.response_type NOT IN ('number', 'numeric', 'checkbox', 'boolean', 'pass_fail', 'yes_no')
    THEN resolved.item ->> phase.value_key
  END,
  CASE WHEN resolved.response_type IN ('number', 'numeric')
    THEN migration.try_numeric(resolved.item ->> phase.value_key)
  END,
  CASE WHEN resolved.response_type IN ('checkbox', 'boolean', 'pass_fail', 'yes_no') THEN
    lower(trim(resolved.item ->> phase.value_key)) IN ('true', 'yes', '1', 'ok', 'pass')
  END,
  phase.name
FROM resolved_items resolved
CROSS JOIN LATERAL (VALUES
  ('start'::text, 'startValue'::text),
  ('end'::text, 'endValue'::text)
) AS phase(name, value_key)
WHERE resolved.item ? phase.value_key
ON CONFLICT (session_id, template_item_id, phase) DO NOTHING;

INSERT INTO quality.setup_checklist_template_items (
  organization_id,
  template_id,
  item_key,
  prompt,
  response_type,
  required,
  sequence,
  active,
  source_system,
  source_table,
  source_id,
  source_payload
)
SELECT
  template.organization_id,
  template.id,
  item.item_key,
  item.prompt,
  'text',
  false,
  item.sequence,
  true,
  'convex_snapshot',
  'setup_checklist_legacy_field',
  template.id::text || ':' || item.item_key,
  jsonb_build_object('legacyField', item.item_key)
FROM quality.setup_checklist_templates template
CROSS JOIN (VALUES
  ('modhiyu', 'Modhiyu', 1),
  ('helperCode', 'Helper code', 2),
  ('setterCode', 'Setter code', 3),
  ('qcController', 'QC controller', 4),
  ('settingStartTime', 'Setting start time', 5),
  ('settingEndTime', 'Setting end time', 6),
  ('rimmerAvailability', 'Rimmer availability', 7)
) AS item(item_key, prompt, sequence)
WHERE lower(template.code) = 'setup-legacy'
ON CONFLICT (template_id, item_key) DO NOTHING;

INSERT INTO quality.setup_checklist_results (
  organization_id,
  session_id,
  template_item_id,
  response_text,
  phase
)
SELECT
  session.organization_id,
  session.id,
  template_item.id,
  session.source_payload->'payload'->>field.item_key,
  'end'
FROM quality.setup_checklist_sessions session
CROSS JOIN (VALUES
  ('modhiyu'),
  ('helperCode'),
  ('setterCode'),
  ('qcController'),
  ('settingStartTime'),
  ('settingEndTime'),
  ('rimmerAvailability')
) AS field(item_key)
JOIN quality.setup_checklist_template_items template_item
  ON template_item.template_id = session.template_id
  AND template_item.item_key = field.item_key
WHERE session.source_payload->>'entryType' = 'setup_checklist'
  AND session.source_payload->'payload' ? field.item_key
ON CONFLICT (session_id, template_item_id, phase) DO NOTHING;
