import { randomUUID } from "node:crypto"

import { migrateDatabase } from "@workspace/db"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { createDurableRefreshWorker } from "./durable-refresh-worker"
import { runSafetySweepCycle } from "./worker-loop"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test"
const pool = new Pool({ connectionString, max: 2 })
let organizationId: string

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const suffix = randomUUID().slice(0, 8)
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, $2)
      RETURNING id
    `,
    [`SWEEP-${suffix}`, `Sweep ${suffix}`]
  )
  organizationId = organization.rows[0]!.id
})

afterAll(async () => {
  await pool.end()
})

describe("durable refresh safety sweep", () => {
  it("uses exactly four PostgreSQL statements for two healthy idle sweeps", async () => {
    const worker = createDurableRefreshWorker({
      organizationId,
      postgresPool: pool,
      postgresUrl: connectionString,
      redisUrl: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6380",
      workerId: `sweep-idle-${randomUUID()}`,
    })
    const query = vi.spyOn(pool, "query")
    query.mockClear()
    try {
      await expect(worker.probeWork()).resolves.toEqual({
        eligibleRefresh: false,
        publishableOutbox: false,
      })
      await expect(worker.probeWork()).resolves.toEqual({
        eligibleRefresh: false,
        publishableOutbox: false,
      })
      expect(query).toHaveBeenCalledTimes(4)
    } finally {
      query.mockRestore()
      await worker.close()
    }
  })

  it("recovers durable work whose notification was missed", async () => {
    await pool.query(
      `
        INSERT INTO derived.refresh_jobs (
          organization_id, queue_key, idempotency_key, status, run_after
        ) VALUES ($1, 'dashboard', $2, 'pending', now())
      `,
      [organizationId, randomUUID()]
    )
    const worker = createDurableRefreshWorker({
      buildReadModel: async () => ({
        payload: { recoveredBy: "sweep" },
        sourceWatermark: { recoveredBy: "sweep" },
      }),
      organizationId,
      postgresPool: pool,
      postgresUrl: connectionString,
      redisUrl: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6380",
      workerId: `sweep-recovery-${randomUUID()}`,
    })
    try {
      const cycle = await runSafetySweepCycle({
        consecutiveFailures: 0,
        maxRetryDelayMs: 30_000,
        probeWork: worker.probeWork,
        runBatch: async () => {
          const result = await worker.runRefreshOnce()
          return {
            failed: result.status === "failed" ? 1 : 0,
            outbox: { published: 0, retrying: 0 },
            processed: result.status === "processed" ? 1 : 0,
            retrying: result.status === "retrying" ? 1 : 0,
          }
        },
        workerId: `sweep-recovery-${randomUUID()}`,
      })
      expect(cycle).toMatchObject({
        batch: { processed: 1 },
        probe: { eligibleRefresh: true },
      })
      const job = await pool.query<{ status: string }>(
        `
          SELECT status
          FROM derived.refresh_jobs
          WHERE organization_id = $1 AND queue_key = 'dashboard'
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [organizationId]
      )
      expect(job.rows).toEqual([{ status: "complete" }])
    } finally {
      await worker.close()
    }
  })
})
