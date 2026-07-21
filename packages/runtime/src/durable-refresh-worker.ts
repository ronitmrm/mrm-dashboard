import { buildCanonicalDashboardReadModel } from "@workspace/db"
import { Pool, type PoolClient } from "pg"
import { createClient } from "redis"

type JsonRecord = Record<string, unknown>

export type RefreshBuildContext = {
  attempt: number
  jobId: string
  organizationId: string
  workerId: string
}

export type ReadModelBuild = {
  payload: JsonRecord
  sourceWatermark: JsonRecord
}

export type ReadModelBuilder = (
  client: PoolClient,
  context: RefreshBuildContext
) => Promise<ReadModelBuild>

type DurableRefreshWorkerOptions = {
  buildReadModel?: ReadModelBuilder
  maxAttempts?: number
  organizationId?: string
  postgresUrl: string
  redisUrl: string
  retryDelayMs?: number
  workerId: string
}

type OutboxRow = {
  aggregate_id: string | null
  aggregate_type: string
  attempts: number
  id: string
  idempotency_key: string
  organization_id: string | null
  payload: JsonRecord
  topic: string
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function optionalRedisClient(redisUrl: string) {
  const client = createClient({
    socket: {
      connectTimeout: 250,
      reconnectStrategy: false,
    },
    url: redisUrl,
  })
  client.on("error", () => undefined)
  return client
}

async function closeRedis(client: ReturnType<typeof createClient>) {
  if (client.isOpen) await client.close()
}

export async function buildCanonicalRuntimeReadModel(
  client: PoolClient,
  context: RefreshBuildContext
): Promise<ReadModelBuild> {
  return buildCanonicalDashboardReadModel(client, context)
}

export function createDurableRefreshWorker({
  buildReadModel = buildCanonicalRuntimeReadModel,
  maxAttempts = 5,
  organizationId,
  postgresUrl,
  redisUrl,
  retryDelayMs = 1_000,
  workerId,
}: DurableRefreshWorkerOptions) {
  const pool = new Pool({ connectionString: postgresUrl })

  return {
    async close() {
      await pool.end()
    },

    async runRefreshOnce() {
      const client = await pool.connect()
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ")
        const claim = await client.query<{
          attempts: number
          id: string
          organization_id: string
        }>(
          `
            SELECT id, organization_id, attempts
            FROM derived.refresh_jobs
            WHERE status = 'pending' AND run_after <= now()
              AND ($1::uuid IS NULL OR organization_id = $1)
            ORDER BY run_after, created_at, id
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          `,
          [organizationId ?? null]
        )
        const job = claim.rows[0]
        if (!job) {
          await client.query("COMMIT")
          return { status: "idle" as const }
        }

        const attempt = job.attempts + 1
        const attemptRow = await client.query<{ id: string }>(
          `
            INSERT INTO derived.refresh_job_attempts (
              organization_id, refresh_job_id, attempt, worker_id, status
            )
            VALUES ($1, $2, $3, $4, 'running')
            RETURNING id
          `,
          [job.organization_id, job.id, attempt, workerId]
        )
        await client.query(
          `
            UPDATE derived.refresh_jobs
            SET status = 'running', attempts = $2, locked_at = now(),
              locked_by = $3, started_at = now(), completed_at = NULL,
              updated_at = now()
            WHERE id = $1
          `,
          [job.id, attempt, workerId]
        )
        await client.query("SAVEPOINT refresh_attempt")
        const startedAt = Date.now()

        try {
          const built = await buildReadModel(client, {
            attempt,
            jobId: job.id,
            organizationId: job.organization_id,
            workerId,
          })
          await client.query(
            `
              INSERT INTO derived.refresh_watermarks (
                organization_id, key, version, source_watermark
              )
              VALUES ($1, 'dashboard', 0, '{}'::jsonb)
              ON CONFLICT (organization_id, key) DO NOTHING
            `,
            [job.organization_id]
          )
          const current = await client.query<{ version: string }>(
            `
              SELECT version::text AS version
              FROM derived.refresh_watermarks
              WHERE organization_id = $1 AND key = 'dashboard'
              FOR UPDATE
            `,
            [job.organization_id]
          )
          const version = Number(current.rows[0]!.version) + 1
          await client.query(
            `
              INSERT INTO derived.dashboard_read_models (
                organization_id, version, payload, source_watermark
              )
              VALUES ($1, $2, $3, $4)
            `,
            [job.organization_id, version, built.payload, built.sourceWatermark]
          )
          await client.query(
            `
              UPDATE derived.refresh_watermarks
              SET version = $3, source_watermark = $4, updated_at = now()
              WHERE organization_id = $1 AND key = $2
            `,
            [job.organization_id, "dashboard", version, built.sourceWatermark]
          )
          await client.query(
            `
              INSERT INTO derived.outbox_events (
                organization_id, topic, aggregate_type, aggregate_id,
                payload, idempotency_key
              )
              VALUES ($1, 'dashboard.read_model.updated',
                'dashboard_read_model', $2, $3, $4)
              ON CONFLICT (idempotency_key) DO NOTHING
            `,
            [
              job.organization_id,
              job.id,
              { organizationId: job.organization_id, version },
              `dashboard-read-model:${job.organization_id}:${version}`,
            ]
          )
          const durationMs = Date.now() - startedAt
          await client.query(
            `
              UPDATE derived.refresh_jobs
              SET status = 'complete', locked_at = NULL, locked_by = NULL,
                completed_at = now(), last_duration_ms = $2,
                last_model_version = $3, last_error = NULL, updated_at = now()
              WHERE id = $1
            `,
            [job.id, durationMs, version]
          )
          await client.query(
            `
              UPDATE derived.refresh_job_attempts
              SET status = 'complete', completed_at = now(),
                duration_ms = $2, model_version = $3
              WHERE id = $1
            `,
            [attemptRow.rows[0]!.id, durationMs, version]
          )
          await client.query("RELEASE SAVEPOINT refresh_attempt")
          await client.query("COMMIT")
          return {
            attempts: attempt,
            jobId: job.id,
            organizationId: job.organization_id,
            status: "processed" as const,
            version,
          }
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT refresh_attempt")
          const message = errorMessage(error)
          const status = attempt >= maxAttempts ? "failed" : "pending"
          const durationMs = Date.now() - startedAt
          await client.query(
            `
              UPDATE derived.refresh_jobs
              SET status = $2, run_after = now() + ($3 * interval '1 millisecond'),
                locked_at = NULL, locked_by = NULL, completed_at = now(),
                last_duration_ms = $4, last_error = $5, updated_at = now()
              WHERE id = $1
            `,
            [job.id, status, retryDelayMs, durationMs, message]
          )
          await client.query(
            `
              UPDATE derived.refresh_job_attempts
              SET status = 'failed', completed_at = now(), duration_ms = $2,
                error = $3
              WHERE id = $1
            `,
            [attemptRow.rows[0]!.id, durationMs, message]
          )
          await client.query("RELEASE SAVEPOINT refresh_attempt")
          await client.query("COMMIT")
          return {
            attempts: attempt,
            error: message,
            jobId: job.id,
            organizationId: job.organization_id,
            status:
              status === "failed" ? ("failed" as const) : ("retrying" as const),
          }
        }
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    },

    async flushOutboxOnce() {
      const client = await pool.connect()
      let event: OutboxRow | undefined
      try {
        await client.query("BEGIN")
        const claim = await client.query<OutboxRow>(
          `
            SELECT id, organization_id, topic, aggregate_type, aggregate_id,
              payload, idempotency_key, attempts
            FROM derived.outbox_events
            WHERE published_at IS NULL AND available_at <= now()
              AND ($1::uuid IS NULL OR organization_id = $1)
              AND (locked_at IS NULL OR locked_at < now() - interval '5 minutes')
            ORDER BY available_at, occurred_at, id
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          `,
          [organizationId ?? null]
        )
        event = claim.rows[0]
        if (!event) {
          await client.query("COMMIT")
          return { status: "idle" as const }
        }
        await client.query(
          `
            UPDATE derived.outbox_events
            SET locked_at = now(), locked_by = $2, attempts = attempts + 1
            WHERE id = $1
          `,
          [event.id, workerId]
        )
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined)
        throw error
      } finally {
        client.release()
      }

      const redis = optionalRedisClient(redisUrl)
      try {
        await redis.connect()
        const version = Number(event.payload.version)
        if (
          event.topic === "dashboard.read_model.updated" &&
          event.organization_id &&
          Number.isFinite(version)
        ) {
          await redis.eval(
            `
              local current = tonumber(redis.call('GET', KEYS[1]) or '0')
              local incoming = tonumber(ARGV[1])
              if incoming > current then
                redis.call('SET', KEYS[1], ARGV[1])
              end
              return math.max(current, incoming)
            `,
            {
              arguments: [String(version)],
              keys: [`mrm:dashboard:version:${event.organization_id}`],
            }
          )
        }
        await redis.publish(
          "mrm:invalidations",
          JSON.stringify({
            aggregateId: event.aggregate_id,
            aggregateType: event.aggregate_type,
            idempotencyKey: event.idempotency_key,
            organizationId: event.organization_id,
            payload: event.payload,
            topic: event.topic,
          })
        )
        await pool.query(
          `
            UPDATE derived.outbox_events
            SET published_at = now(), locked_at = NULL, locked_by = NULL,
              last_error = NULL
            WHERE id = $1
          `,
          [event.id]
        )
        return { eventId: event.id, status: "published" as const }
      } catch (error) {
        const message = errorMessage(error)
        await pool.query(
          `
            UPDATE derived.outbox_events
            SET available_at = now() + ($2 * interval '1 millisecond'),
              locked_at = NULL, locked_by = NULL, last_error = $3
            WHERE id = $1
          `,
          [event.id, retryDelayMs, message]
        )
        return {
          error: message,
          eventId: event.id,
          status: "retrying" as const,
        }
      } finally {
        await closeRedis(redis)
      }
    },

    async flushOutbox(limit = 100) {
      let published = 0
      let retrying = 0
      for (let index = 0; index < Math.max(0, limit); index += 1) {
        const result = await this.flushOutboxOnce()
        if (result.status === "idle") break
        if (result.status === "published") published += 1
        if (result.status === "retrying") retrying += 1
      }
      return { published, retrying }
    },

    async status(organizationId?: string) {
      const result = await pool.query<{
        failed_jobs: string
        last_error: string | null
        last_version: string | null
        oldest_pending_seconds: string | null
        oldest_outbox_seconds: string | null
        outbox_last_error: string | null
        pending_jobs: string
        pending_outbox: string
        retrying_outbox: string
        running_jobs: string
      }>(
        `
          SELECT
            (SELECT count(*) FROM derived.refresh_jobs job
              WHERE ($1::uuid IS NULL OR job.organization_id = $1)
                AND job.status = 'pending') AS pending_jobs,
            (SELECT count(*) FROM derived.refresh_jobs job
              WHERE ($1::uuid IS NULL OR job.organization_id = $1)
                AND job.status = 'running') AS running_jobs,
            (SELECT count(*) FROM derived.refresh_jobs job
              WHERE ($1::uuid IS NULL OR job.organization_id = $1)
                AND job.status = 'failed') AS failed_jobs,
            (SELECT extract(epoch FROM (now() - min(job.run_after)))::text
              FROM derived.refresh_jobs job
              WHERE ($1::uuid IS NULL OR job.organization_id = $1)
                AND job.status = 'pending') AS oldest_pending_seconds,
            (SELECT max(model.version)::text
              FROM derived.dashboard_read_models model
              WHERE ($1::uuid IS NULL OR model.organization_id = $1))
              AS last_version,
            (SELECT count(*) FROM derived.outbox_events event
              WHERE ($1::uuid IS NULL OR event.organization_id = $1)
                AND event.published_at IS NULL) AS pending_outbox,
            (SELECT count(*) FROM derived.outbox_events event
              WHERE ($1::uuid IS NULL OR event.organization_id = $1)
                AND event.published_at IS NULL AND event.attempts > 0)
              AS retrying_outbox,
            (SELECT extract(epoch FROM (now() - min(event.available_at)))::text
              FROM derived.outbox_events event
              WHERE ($1::uuid IS NULL OR event.organization_id = $1)
                AND event.published_at IS NULL) AS oldest_outbox_seconds,
            (SELECT event.last_error FROM derived.outbox_events event
              WHERE ($1::uuid IS NULL OR event.organization_id = $1)
                AND event.last_error IS NOT NULL
              ORDER BY event.occurred_at DESC LIMIT 1) AS outbox_last_error,
            (SELECT attempt.error FROM derived.refresh_job_attempts attempt
              WHERE ($1::uuid IS NULL OR attempt.organization_id = $1)
                AND attempt.error IS NOT NULL
              ORDER BY attempt.completed_at DESC NULLS LAST LIMIT 1)
              AS last_error
        `,
        [organizationId ?? null]
      )
      const row = result.rows[0]!
      return {
        failedJobs: Number(row.failed_jobs),
        lastError: row.last_error,
        lastVersion:
          row.last_version === null ? null : Number(row.last_version),
        oldestPendingSeconds:
          row.oldest_pending_seconds === null
            ? null
            : Math.max(0, Number(row.oldest_pending_seconds)),
        oldestOutboxSeconds:
          row.oldest_outbox_seconds === null
            ? null
            : Math.max(0, Number(row.oldest_outbox_seconds)),
        outboxLastError: row.outbox_last_error,
        pendingJobs: Number(row.pending_jobs),
        pendingOutbox: Number(row.pending_outbox),
        retryingOutbox: Number(row.retrying_outbox),
        runningJobs: Number(row.running_jobs),
      }
    },
  }
}

export async function consumeOptionalRateLimit({
  key,
  limit,
  redisUrl,
  windowSeconds,
}: {
  key: string
  limit: number
  redisUrl: string
  windowSeconds: number
}) {
  const redis = optionalRedisClient(redisUrl)
  try {
    await redis.connect()
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, windowSeconds)
    const ttl = await redis.ttl(key)
    return {
      allowed: count <= limit,
      count,
      retryAfterSeconds: Math.max(0, ttl),
      source: "redis" as const,
    }
  } catch {
    return {
      allowed: true,
      count: null,
      retryAfterSeconds: 0,
      source: "unavailable" as const,
    }
  } finally {
    await closeRedis(redis)
  }
}
