import { randomUUID } from "node:crypto"

import { migrateDatabase } from "@workspace/db"
import {
  createTelemetryRuntime,
  type StructuredTelemetryEvent,
} from "@workspace/observability"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { createDurableRefreshWorker } from "./durable-refresh-worker"
import { createWorkerRuntimeMonitor } from "./worker-runtime-monitor"
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
}, 30_000)

afterAll(async () => {
  await pool.end()
})

describe("durable refresh safety sweep", () => {
  it("uses exactly four PostgreSQL statements for two healthy idle sweeps", async () => {
    const events: StructuredTelemetryEvent[] = []
    let nowMs = 0
    const telemetryRuntime = createTelemetryRuntime({
      artifactCommit: "commit-sweep-integration",
      environment: "test",
      now: () => "2026-08-08T12:00:00.000Z",
    })
    const worker = createDurableRefreshWorker({
      organizationId,
      postgresPool: pool,
      postgresUrl: connectionString,
      redisUrl: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6380",
      telemetryRuntime,
      telemetrySink: (event) => events.push(event),
      workerId: `sweep-idle-${randomUUID()}`,
    })
    const monitor = createWorkerRuntimeMonitor({
      nowMs: () => nowMs,
      runtime: telemetryRuntime,
      sink: (event) => events.push(event),
      workerId: "sweep-integration",
    })
    monitor.recordListenerTransition({
      disconnectCategory: null,
      reconciliationResult: "success",
      retryCount: 0,
      state: "ready",
    })
    const query = vi.spyOn(pool, "query")
    query.mockClear()
    try {
      const expected = {
        eligibleRefresh: false,
        publishableOutbox: false,
        snapshot: {
          failedJobs: 0,
          lastVersion: null,
          oldestOutboxSeconds: null,
          oldestPendingSeconds: null,
          pendingJobs: 0,
          pendingOutbox: 0,
          poolWaiters: 0,
          retryingOutbox: 0,
          runningJobs: 0,
        },
      }
      const first = await worker.probeWork()
      expect(first).toEqual(expected)
      nowMs = 30_000
      monitor.recordSweep({
        cycleOutcome: "success",
        snapshot: first.snapshot,
      })
      const second = await worker.probeWork()
      expect(second).toEqual(expected)
      nowMs = 60_000
      monitor.recordSweep({
        cycleOutcome: "success",
        snapshot: second.snapshot,
      })
      expect(query).toHaveBeenCalledTimes(4)
      expect(
        events
          .filter((event) => event.event === "performance.operation")
          .map((event) => event.poolWaiters)
      ).toEqual([0, 0])
      expect(events.filter(({ event }) => event === "worker.sweep")).toEqual([
        expect.objectContaining({
          cycleOutcome: "success",
          event: "worker.sweep",
          listenerState: "ready",
          pendingJobs: 0,
          pendingOutbox: 0,
          poolWaiters: 0,
          sweepCount: 2,
        }),
      ])
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
