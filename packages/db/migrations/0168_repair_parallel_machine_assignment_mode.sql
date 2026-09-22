WITH corrected AS (
  UPDATE manufacturing.plan_override_events event
  SET source_payload = jsonb_set(
    event.source_payload,
    '{assignmentMode}',
    '"add_parallel_machine"'::jsonb
  )
  WHERE event.reversed_at IS NULL
    AND event.source_system = 'mrm-dashboard'
    AND event.source_table = 'planOverrides'
    AND event.source_payload->>'assignmentMode' = 'move'
    AND event.source_machine_id IS NULL
    AND NULLIF(event.source_payload->>'fromMachineNumber', '') IS NULL
    AND jsonb_array_length(
      CASE
        WHEN jsonb_typeof(event.source_payload->'interruptedSetups') = 'array'
          THEN event.source_payload->'interruptedSetups'
        ELSE '[]'::jsonb
      END
    ) = 0
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(event.source_payload->'queuePlacements') = 'array'
            THEN event.source_payload->'queuePlacements'
          ELSE '[]'::jsonb
        END
      ) placement
      WHERE placement->>'targetJobCardNumber' =
          event.source_payload->>'jobCardNumber'
        AND placement->>'targetSetupNumber' =
          event.source_payload->>'setupNumber'
        AND placement->>'targetMachineNumber' =
          event.source_payload->>'toMachineNumber'
        AND NULLIF(placement->>'targetSourceMachineNumber', '') IS NOT NULL
    )
  RETURNING event.organization_id
), corrected_organizations AS (
  SELECT DISTINCT organization_id
  FROM corrected
)
INSERT INTO derived.refresh_jobs (
  organization_id,
  queue_key,
  idempotency_key,
  status,
  run_after
)
SELECT
  corrected_organizations.organization_id,
  'dashboard',
  gen_random_uuid()::text,
  'pending',
  now()
FROM corrected_organizations
ON CONFLICT (organization_id, queue_key)
  WHERE status IN ('pending', 'running')
DO UPDATE SET
  run_after = LEAST(derived.refresh_jobs.run_after, now()),
  updated_at = now(),
  last_error = NULL;
