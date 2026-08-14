import { randomUUID } from "node:crypto"

import type { PoolClient } from "pg"

export async function queueDashboardRefresh(
  client: PoolClient,
  organizationId: string
) {
  const idempotencyKey = randomUUID()
  const queued = await client.query<{ id: string; inserted: boolean }>(
    `INSERT INTO derived.refresh_jobs (
       organization_id, queue_key, idempotency_key, status, run_after
     ) VALUES ($1, 'dashboard', $2, 'pending', now())
     ON CONFLICT (organization_id, queue_key)
       WHERE status IN ('pending', 'running')
     DO UPDATE SET
       idempotency_key = derived.refresh_jobs.idempotency_key
     RETURNING id, idempotency_key = $2 AS inserted`,
    [organizationId, idempotencyKey]
  )
  const refreshJob = queued.rows[0]!
  if (refreshJob.inserted) {
    await client.query(
      `INSERT INTO derived.outbox_events (
         organization_id, topic, aggregate_type, aggregate_id,
         payload, idempotency_key
       ) VALUES ($1, 'dashboard.refresh.requested', 'refresh_job', $2, $3, $4)`,
      [
        organizationId,
        refreshJob.id,
        {
          organizationId,
          queueKey: "dashboard",
          refreshJobId: refreshJob.id,
        },
        randomUUID(),
      ]
    )
    return { jobId: refreshJob.id, queued: true, skipped: false }
  }
  return { jobId: refreshJob.id, queued: false, skipped: true }
}
