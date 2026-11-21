-- Planner decisions undone through dashboard corrections kept reversed_at NULL,
-- so shop-floor checks still enforced them (e.g. an undone early Setup 2 machine
-- reservation blocked Start machine on the machine the planner moved it to).
UPDATE manufacturing.plan_override_events override_event
SET reversed_at = correction.corrected_at
FROM (
  SELECT organization_id, target_source_id,
    min(COALESCE(original_timestamp, imported_at)) AS corrected_at
  FROM audit.legacy_convex_corrections
  WHERE target_source_table = 'planOverrides'
    AND correction_type IN ('reverse', 'replace', 'close')
  GROUP BY organization_id, target_source_id
) correction
WHERE override_event.organization_id = correction.organization_id
  AND override_event.reversed_at IS NULL
  AND (override_event.source_id = correction.target_source_id
    OR override_event.source_payload->>'_id' = correction.target_source_id);
