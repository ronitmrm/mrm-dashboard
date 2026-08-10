import { randomUUID } from "node:crypto"

import type { PoolClient } from "pg"

export async function queueDashboardRefresh(
  client: PoolClient,
  organizationId: string
) {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO derived.refresh_jobs (
       organization_id, queue_key, idempotency_key, status, run_after
     ) VALUES ($1, 'dashboard', $2, 'pending', now())
     ON CONFLICT (organization_id, queue_key)
       WHERE status IN ('pending', 'running')
     DO NOTHING
     RETURNING id`,
    [organizationId, randomUUID()]
  )
  const insertedJob = inserted.rows[0]
  if (insertedJob) {
    await client.query(
      `INSERT INTO derived.outbox_events (
         organization_id, topic, aggregate_type, aggregate_id,
         payload, idempotency_key
       ) VALUES ($1, 'dashboard.refresh.requested', 'refresh_job', $2, $3, $4)`,
      [
        organizationId,
        insertedJob.id,
        {
          organizationId,
          queueKey: "dashboard",
          refreshJobId: insertedJob.id,
        },
        randomUUID(),
      ]
    )
    return { jobId: insertedJob.id, queued: true, skipped: false }
  }

  const active = await client.query<{ id: string }>(
    `SELECT id
     FROM derived.refresh_jobs
     WHERE organization_id = $1
       AND queue_key = 'dashboard'
       AND status IN ('pending', 'running')
     ORDER BY created_at
     LIMIT 1`,
    [organizationId]
  )
  const activeJob = active.rows[0]
  if (!activeJob) throw new Error("Active dashboard refresh job was not found")
  return { jobId: activeJob.id, queued: false, skipped: true }
}
