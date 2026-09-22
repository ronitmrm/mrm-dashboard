-- Existing revised cycle standards need the same forward-planning marker that
-- future Cycle Time Master edits write. The original created timestamp remains
-- unchanged; this marker is used only for remaining-quantity forecasts.
UPDATE manufacturing.operation_cycle_standards
SET source_payload = CASE
  WHEN jsonb_typeof(source_payload->'payload') = 'object'
    THEN source_payload || jsonb_build_object(
      'payload', (source_payload->'payload')
        || jsonb_build_object('cycleRevisionEffectiveAt', updated_at)
    )
  ELSE COALESCE(source_payload, '{}'::jsonb)
    || jsonb_build_object('cycleRevisionEffectiveAt', updated_at)
END
WHERE row_version > 1
  AND source_payload IS NOT NULL
  AND COALESCE(
    source_payload->'payload'->>'cycleRevisionEffectiveAt',
    source_payload->>'cycleRevisionEffectiveAt',
    ''
  ) = '';
