import { randomUUID } from "node:crypto"

import type { PoolClient } from "pg"

export async function queueDashboardRefresh(
  client: PoolClient,
  organizationId: string
) {
  // Coalesce only work the worker has not claimed. Locking that pending job
  // keeps its rebuild from starting before this mutation commits. Touch its
  // row version so an older REPEATABLE READ snapshot cannot consume it.
  const pending = await client.query<{ id: string }>(
    `WITH pending AS (
       SELECT id FROM derived.refresh_jobs
       WHERE organization_id = $1 AND status = 'pending'
         AND (queue_key = 'dashboard' OR queue_key LIKE 'dashboard:%')
       ORDER BY run_after, created_at, id
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE derived.refresh_jobs job
     SET idempotency_key = job.idempotency_key
     FROM pending WHERE job.id = pending.id
     RETURNING job.id`,
    [organizationId]
  )
  if (pending.rows[0]) {
    return { jobId: pending.rows[0].id, queued: false, skipped: true }
  }

  // A unique key avoids the partial unique index waiting on a running rebuild.
  // The successor remains durable in the same transaction as the mutation.
  const jobId = randomUUID()
  await client.query(
    `INSERT INTO derived.refresh_jobs (
       id, organization_id, queue_key, idempotency_key, status, run_after
     ) VALUES ($1::uuid, $2, $3, $1::text, 'pending', now())`,
    [jobId, organizationId, `dashboard:refresh:${jobId}`]
  )
  await client.query(
    `INSERT INTO derived.outbox_events (
       organization_id, topic, aggregate_type, aggregate_id,
       payload, idempotency_key
     ) VALUES ($1, 'dashboard.refresh.requested', 'refresh_job', $2, $3, $4)`,
    [
      organizationId,
      jobId,
      { organizationId, queueKey: "dashboard", refreshJobId: jobId },
      randomUUID(),
    ]
  )
  await client.query("SELECT pg_notify('mrm_dashboard_refresh', $1)", [
    JSON.stringify({ v: 1, organizationId, queueKey: "dashboard" }),
  ])
  return { jobId, queued: true, skipped: false }
}
