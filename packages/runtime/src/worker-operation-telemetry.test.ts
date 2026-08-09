import {
  createTelemetryRuntime,
  type StructuredTelemetryEvent,
} from "@workspace/observability"
import { type Pool, type QueryResult } from "pg"
import { expect, test, vi } from "vitest"

import { createDurableRefreshWorker } from "./durable-refresh-worker"
import type { RedisAcceleration } from "./redis-acceleration"

test("emits a worker operation with database boundary metrics", async () => {
  const row = {
    failed_jobs: "0",
    last_error: null,
    last_version: "42",
    oldest_outbox_seconds: null,
    oldest_pending_seconds: null,
    outbox_last_error: null,
    pending_jobs: "0",
    pending_outbox: "0",
    retrying_outbox: "0",
    running_jobs: "0",
  }
  const result = {
    command: "SELECT",
    fields: [],
    oid: 0,
    rowCount: 1,
    rows: [row],
  } satisfies QueryResult<typeof row>
  const pool = {
    connect: vi.fn(),
    idleCount: 1,
    query: vi.fn().mockResolvedValue(result),
    totalCount: 1,
    waitingCount: 0,
  } as unknown as Pool
  const acceleration: RedisAcceleration = {
    close: vi.fn(),
    consumeRateLimit: vi.fn(),
    publishInvalidation: vi.fn(),
  }
  const events: StructuredTelemetryEvent[] = []
  const worker = createDurableRefreshWorker({
    postgresPool: pool,
    postgresUrl: "postgres://unused",
    redisAcceleration: acceleration,
    telemetryRuntime: createTelemetryRuntime({
      artifactCommit: "commit-worker-boundary",
      environment: "test",
      now: () => "2026-08-08T12:00:00.000Z",
    }),
    telemetrySink: (event) => events.push(event),
    workerId: "worker-telemetry-test",
  })

  await expect(worker.status()).resolves.toMatchObject({
    failedJobs: 0,
    lastVersion: 42,
    pendingJobs: 0,
  })
  expect(events).toEqual([
    expect.objectContaining({
      commandId: "worker-telemetry-test",
      event: "performance.operation",
      operation: "worker.status",
      rows: 1,
      statements: 1,
      subsystem: "worker",
    }),
  ])
  await worker.close()
})
