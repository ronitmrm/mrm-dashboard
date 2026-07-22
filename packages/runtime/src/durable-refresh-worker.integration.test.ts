import { randomUUID } from "node:crypto"

import { migrateDatabase } from "@workspace/db"
import { Pool } from "pg"
import { createClient } from "redis"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  createDurableRefreshWorker,
  consumeOptionalRateLimit,
} from "./durable-refresh-worker"

const postgresUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test"
const redisUrl = process.env.TEST_REDIS_URL ?? "redis://localhost:6380"
const pool = new Pool({ connectionString: postgresUrl })
const suffix = randomUUID().slice(0, 8)
let organizationId: string

async function enqueueRefresh() {
  await pool.query(
    `
      INSERT INTO derived.refresh_jobs (
        organization_id, queue_key, idempotency_key, status, run_after
      )
      VALUES ($1, 'dashboard', $2, 'pending', now())
    `,
    [organizationId, randomUUID()]
  )
}

function model(build: number) {
  return async () => ({
    payload: { build, organizationId },
    sourceWatermark: { build },
  })
}

beforeAll(async () => {
  await migrateDatabase({ connectionString: postgresUrl })
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, $2)
      RETURNING id
    `,
    [`RUNTIME-${suffix}`, `Runtime ${suffix}`]
  )
  organizationId = organization.rows[0]!.id
})

afterAll(async () => {
  await pool.end()
})

describe("durable dashboard refresh runtime", () => {
  it("claims coalesced jobs once and retries without duplicate read-model versions", async () => {
    await enqueueRefresh()
    const first = createDurableRefreshWorker({
      buildReadModel: model(1),
      organizationId,
      postgresUrl,
      redisUrl,
      retryDelayMs: 0,
      workerId: `worker-a-${suffix}`,
    })
    const competing = createDurableRefreshWorker({
      buildReadModel: model(999),
      organizationId,
      postgresUrl,
      redisUrl,
      retryDelayMs: 0,
      workerId: `worker-b-${suffix}`,
    })
    try {
      const claims = await Promise.all([
        first.runRefreshOnce(),
        competing.runRefreshOnce(),
      ])
      expect(claims.map((claim) => claim.status).sort()).toEqual([
        "idle",
        "processed",
      ])

      await enqueueRefresh()
      let attempts = 0
      const retrying = createDurableRefreshWorker({
        buildReadModel: async () => {
          attempts += 1
          if (attempts === 1) throw new Error("synthetic refresh failure")
          return model(2)()
        },
        organizationId,
        postgresUrl,
        redisUrl,
        retryDelayMs: 0,
        workerId: `worker-retry-${suffix}`,
      })
      try {
        await expect(retrying.runRefreshOnce()).resolves.toMatchObject({
          attempts: 1,
          status: "retrying",
        })
        await expect(retrying.runRefreshOnce()).resolves.toMatchObject({
          attempts: 2,
          status: "processed",
          version: 2,
        })
      } finally {
        await retrying.close()
      }

      const evidence = await pool.query<{
        models: string
        versions: number[]
        watermark: string
      }>(
        `
          SELECT
            (SELECT count(*) FROM derived.dashboard_read_models
              WHERE organization_id = $1) AS models,
            (SELECT array_agg(version ORDER BY version)
              FROM derived.dashboard_read_models
              WHERE organization_id = $1) AS versions,
            (SELECT version::text FROM derived.refresh_watermarks
              WHERE organization_id = $1 AND key = 'dashboard') AS watermark
        `,
        [organizationId]
      )
      expect(evidence.rows[0]).toEqual({
        models: "2",
        versions: ["1", "2"],
        watermark: "2",
      })
    } finally {
      await first.close()
      await competing.close()
    }
  })

  it("publishes idempotent invalidations and uses Redis only as fail-open acceleration", async () => {
    const worker = createDurableRefreshWorker({
      buildReadModel: model(3),
      organizationId,
      postgresUrl,
      redisUrl,
      workerId: `worker-outbox-${suffix}`,
    })
    const redis = createClient({ url: redisUrl })
    redis.on("error", () => undefined)
    try {
      await worker.flushOutbox(1_000)
      await redis.connect()
      await expect(
        redis.get(`mrm:dashboard:version:${organizationId}`)
      ).resolves.toBe("2")

      const key = `mrm:test:rate:${suffix}`
      await expect(
        consumeOptionalRateLimit({ key, limit: 2, redisUrl, windowSeconds: 60 })
      ).resolves.toMatchObject({ allowed: true, source: "redis" })
      await expect(
        consumeOptionalRateLimit({ key, limit: 2, redisUrl, windowSeconds: 60 })
      ).resolves.toMatchObject({ allowed: true, source: "redis" })
      await expect(
        consumeOptionalRateLimit({ key, limit: 2, redisUrl, windowSeconds: 60 })
      ).resolves.toMatchObject({ allowed: false, source: "redis" })
      await expect(
        consumeOptionalRateLimit({
          key,
          limit: 1,
          redisUrl: "redis://127.0.0.1:6399",
          windowSeconds: 60,
        })
      ).resolves.toMatchObject({ allowed: true, source: "unavailable" })
    } finally {
      if (redis.isOpen) await redis.close()
      await worker.close()
    }
  })

  it("keeps Redis delivery failures durable and exposes retry and lag state", async () => {
    await enqueueRefresh()
    const worker = createDurableRefreshWorker({
      buildReadModel: model(3),
      organizationId,
      postgresUrl,
      redisUrl: "redis://127.0.0.1:6399",
      retryDelayMs: 0,
      workerId: `worker-offline-${suffix}`,
    })
    try {
      await expect(worker.runRefreshOnce()).resolves.toMatchObject({
        status: "processed",
        version: 3,
      })
      await expect(worker.flushOutboxOnce()).resolves.toMatchObject({
        status: "retrying",
      })
      await expect(worker.status(organizationId)).resolves.toMatchObject({
        failedJobs: 0,
        lastVersion: 3,
        oldestOutboxSeconds: expect.any(Number),
        outboxLastErrorCategory: "connectivity",
        pendingOutbox: expect.any(Number),
        retryingOutbox: expect.any(Number),
      })

      const evidence = await pool.query<{
        models: string
        pending_outbox: string
      }>(
        `
          SELECT
            (SELECT count(*) FROM derived.dashboard_read_models
              WHERE organization_id = $1) AS models,
            (SELECT count(*) FROM derived.outbox_events
              WHERE organization_id = $1 AND published_at IS NULL) AS pending_outbox
        `,
        [organizationId]
      )
      expect(evidence.rows[0]!.models).toBe("3")
      expect(Number(evidence.rows[0]!.pending_outbox)).toBeGreaterThan(0)
    } finally {
      await worker.close()
    }
  })
})
