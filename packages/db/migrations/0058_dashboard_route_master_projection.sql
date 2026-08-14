UPDATE manufacturing.operation_setups
SET source_table = 'dataEntries',
  updated_at = now(),
  row_version = row_version + 1
WHERE source_payload IS NOT NULL
  AND source_system = 'mrm-dashboard'
  AND source_table IS DISTINCT FROM 'dataEntries';

INSERT INTO derived.refresh_jobs (
  organization_id,
  queue_key,
  idempotency_key,
  status,
  run_after
)
SELECT
  route_organizations.organization_id,
  'dashboard',
  gen_random_uuid()::text,
  'pending',
  now()
FROM (
  SELECT DISTINCT organization_id
  FROM manufacturing.operation_setups
  WHERE source_payload IS NOT NULL
    AND (
      source_table = 'dataEntries'
      OR source_system = 'mrm-dashboard'
    )
) route_organizations
ON CONFLICT (organization_id, queue_key)
  WHERE status IN ('pending', 'running')
DO UPDATE SET
  run_after = LEAST(derived.refresh_jobs.run_after, now()),
  updated_at = now(),
  last_error = NULL;

ANALYZE derived.dashboard_source_records;
