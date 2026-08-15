import {
  createTelemetryRuntime,
  serializedByteLength,
  withPerformanceOperation,
  type StructuredTelemetryEvent,
} from "@workspace/observability"
import { Pool, type PoolClient, type QueryResult } from "pg"
import { describe, expect, it, vi } from "vitest"

import {
  connectionTargetSummary,
  createBoundedPostgresPool,
  repositoryPool,
  summarizeManagedPostgresEnvironment,
  validateManagedPostgresUrl,
  withTransaction,
} from "./postgres-runtime"
import { instrumentPostgresPool } from "./postgres-telemetry"

const telemetryRuntime = createTelemetryRuntime({
  artifactCommit: "commit-db-boundary",
  environment: "test",
  now: () => "2026-08-08T12:00:00.000Z",
})

describe("managed PostgreSQL runtime contract", () => {
  it("reuses an injected pool without letting a repository close it", async () => {
    const shared = new Pool({
      connectionString: "postgres://local:local@localhost:5434/mrmpl",
      max: 2,
    })
    const end = vi.spyOn(shared, "end")

    const owned = repositoryPool({ pool: shared })

    expect(owned.pool).toBe(shared)
    await owned.close()
    expect(end).not.toHaveBeenCalled()
    await shared.end()
  })

  it("commits successful transactions and rolls back failures", async () => {
    const query = vi.fn().mockResolvedValue({})
    const release = vi.fn()
    const client = { query, release } as unknown as PoolClient
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool

    await expect(
      withTransaction(pool, async () => "committed")
    ).resolves.toBe("committed")
    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      "BEGIN",
      "COMMIT",
    ])
    expect(release).toHaveBeenCalledOnce()

    query.mockClear()
    release.mockClear()
    await expect(
      withTransaction(pool, async () => {
        throw new Error("failed")
      })
    ).rejects.toThrow("failed")
    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      "BEGIN",
      "ROLLBACK",
    ])
    expect(release).toHaveBeenCalledOnce()
  })

  it("creates a bounded pool with redacted metrics", async () => {
    const pool = createBoundedPostgresPool({
      applicationName: "mrm-web",
      connectionString: "postgres://local:local@localhost:5434/mrmpl",
      max: 3,
    })

    expect(pool.options.max).toBe(3)
    expect(pool.options.connectionTimeoutMillis).toBe(5_000)
    expect(pool.options.idleTimeoutMillis).toBe(10_000)
    expect(connectionTargetSummary(pool)).toEqual({
      idle: 0,
      total: 0,
      waiting: 0,
    })
    expect(JSON.stringify(connectionTargetSummary(pool))).not.toContain(
      "localhost"
    )
    await pool.end()
  })

  it("counts statements, rows, UTF-8 packet bytes, and waiters at the client boundary", async () => {
    const queryResult = {
      command: "SELECT",
      fields: [],
      oid: 0,
      rowCount: 1,
      rows: [{ value: "₹" }],
    } satisfies QueryResult<{ value: string }>
    const client = {
      query: vi.fn().mockResolvedValue(queryResult),
    } as unknown as PoolClient
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
      query: vi.fn(async function (this: Pool, ...args: unknown[]) {
        const connected = await this.connect()
        return (connected.query as (...values: unknown[]) => unknown)(...args)
      }),
      waitingCount: 3,
    } as unknown as Pool
    instrumentPostgresPool(pool)
    const events: StructuredTelemetryEvent[] = []

    const result = await withPerformanceOperation(
      {
        operation: "postgres.boundary",
        runtime: telemetryRuntime,
        sink: (event) => events.push(event),
        subsystem: "test",
      },
      async () =>
        pool.query<{ value: string }>("SELECT $1::text AS value", ["₹"])
    )

    expect(result).toBe(queryResult)
    expect(events).toEqual([
      expect.objectContaining({
        event: "performance.operation",
        poolWaiters: 3,
        postgresBytes: {
          request:
            Buffer.byteLength("SELECT $1::text AS value", "utf8") +
            serializedByteLength(["₹"]),
          response: serializedByteLength(queryResult.rows),
        },
        rows: 1,
        statements: 1,
      }),
    ])
    expect(JSON.stringify(events)).not.toContain("SELECT $1")
    expect(JSON.stringify(events)).not.toContain("₹")
  })

  it("counts direct client queries and rejected statements", async () => {
    const queryError = new Error("query failed")
    const client = {
      query: vi.fn().mockRejectedValue(queryError),
    } as unknown as PoolClient
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
      query: vi.fn(),
      waitingCount: 0,
    } as unknown as Pool
    instrumentPostgresPool(pool)
    const events: StructuredTelemetryEvent[] = []

    await expect(
      withPerformanceOperation(
        {
          operation: "postgres.direct.failure",
          runtime: telemetryRuntime,
          sink: (event) => events.push(event),
          subsystem: "test",
        },
        async () => {
          const acquired = await pool.connect()
          return acquired.query("SELECT failure")
        }
      )
    ).rejects.toBe(queryError)

    expect(events).toEqual([
      expect.objectContaining({
        outcome: "error",
        rows: 0,
        statements: 1,
      }),
    ])
  })

  it("records callback queries before preserving their callback result", async () => {
    const queryResult = {
      command: "SELECT",
      fields: [],
      oid: 0,
      rowCount: 1,
      rows: [{ value: "callback" }],
    } satisfies QueryResult<{ value: string }>
    const client = { query: vi.fn() } as unknown as PoolClient
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
      query: vi.fn(
        (
          _text: string,
          callback: (error: Error | undefined, result: unknown) => void
        ) => callback(undefined, queryResult)
      ),
      waitingCount: 0,
    } as unknown as Pool
    instrumentPostgresPool(pool)
    const events: StructuredTelemetryEvent[] = []

    const result = await withPerformanceOperation(
      {
        operation: "postgres.callback",
        runtime: telemetryRuntime,
        sink: (event) => events.push(event),
        subsystem: "test",
      },
      () =>
        new Promise((resolve, reject) => {
          pool.query("SELECT callback", (error, callbackResult) => {
            if (error) reject(error)
            else resolve(callbackResult)
          })
        })
    )

    expect(result).toBe(queryResult)
    expect(events).toEqual([
      expect.objectContaining({ rows: 1, statements: 1 }),
    ])
  })

  it("retains a transient saturated-pool waiter sample", async () => {
    const queryResult = {
      command: "SELECT",
      fields: [],
      oid: 0,
      rowCount: 0,
      rows: [],
    } satisfies QueryResult
    const client = { query: vi.fn() } as unknown as PoolClient
    let waitingCount = 0
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
      query: vi.fn(() => {
        waitingCount = 1
        return Promise.resolve().then(() => {
          waitingCount = 0
          return queryResult
        })
      }),
      get waitingCount() {
        return waitingCount
      },
    } as unknown as Pool
    instrumentPostgresPool(pool)
    const events: StructuredTelemetryEvent[] = []

    await withPerformanceOperation(
      {
        operation: "postgres.saturated",
        runtime: telemetryRuntime,
        sink: (event) => events.push(event),
        subsystem: "test",
      },
      () => pool.query("SELECT saturated")
    )

    expect(events).toEqual([
      expect.objectContaining({ poolWaiters: 1, statements: 1 }),
    ])
  })

  it("retains a transient waiter while acquiring a transaction client", async () => {
    const client = {
      query: vi.fn(),
      release: vi.fn(),
    } as unknown as PoolClient
    let waitingCount = 0
    const pool = {
      connect: vi.fn(() => {
        waitingCount = 1
        return Promise.resolve().then(() => {
          waitingCount = 0
          return client
        })
      }),
      query: vi.fn(),
      get waitingCount() {
        return waitingCount
      },
    } as unknown as Pool
    instrumentPostgresPool(pool)
    const events: StructuredTelemetryEvent[] = []

    await withPerformanceOperation(
      {
        operation: "postgres.transaction.acquire",
        runtime: telemetryRuntime,
        sink: (event) => events.push(event),
        subsystem: "test",
      },
      async () => {
        const acquired = await pool.connect()
        acquired.release()
      }
    )

    expect(events).toEqual([
      expect.objectContaining({ poolWaiters: 1, statements: 0 }),
    ])
  })

  it("uses native pg for long-lived managed runtimes", async () => {
    const pool = createBoundedPostgresPool({
      applicationName: "mrm-web",
      connectionString:
        "postgresql://mrmpl_staging_web:secret@example-pooler.neon.tech/neondb?sslmode=require",
      max: 2,
    })

    expect(pool).toBeInstanceOf(Pool)
    expect(pool.options.connectionTimeoutMillis).toBe(30_000)
    expect(pool.options.idleTimeoutMillis).toBe(300_000)
    await pool.end()
  })

  it("rejects local, plaintext, pooled migration, and role-mismatched targets", () => {
    const direct =
      "postgresql://mrmpl_staging_migration:secret@example.neon.tech/neondb?sslmode=require"

    expect(
      validateManagedPostgresUrl(direct, {
        direct: true,
        responsibility: "migration",
      }).endpointClass
    ).toBe("direct")

    expect(() =>
      validateManagedPostgresUrl(
        "postgres://mrmpl_staging_web:secret@localhost:5434/mrmpl",
        { responsibility: "web" }
      )
    ).toThrow(/local/i)
    expect(() =>
      validateManagedPostgresUrl(
        "postgres://mrmpl_staging_web:secret@example.neon.tech/neondb",
        { responsibility: "web" }
      )
    ).toThrow(/TLS/i)
    expect(() =>
      validateManagedPostgresUrl(
        "postgres://mrmpl_staging_web:secret@example.com/neondb?sslmode=require",
        { responsibility: "web" }
      )
    ).toThrow(/Neon/i)
    expect(() =>
      validateManagedPostgresUrl(
        "postgresql://mrmpl_staging_migration:secret@example-pooler.neon.tech/neondb?sslmode=require",
        { direct: true, responsibility: "migration" }
      )
    ).toThrow(/direct/i)
    expect(() =>
      validateManagedPostgresUrl(direct, { responsibility: "web" })
    ).toThrow(/web/i)
  })

  it("summarizes separately scoped managed identities without values", () => {
    const target = (responsibility: string, pooled = false) =>
      `postgresql://mrmpl_staging_${responsibility}:secret@example${pooled ? "-pooler" : ""}.neon.tech/neondb?sslmode=require`

    const summary = summarizeManagedPostgresEnvironment({
      MIGRATION_DATABASE_URL: target("migration"),
      REPORTING_DATABASE_URL: target("reporting", true),
      TEST_DATABASE_URL: target("test"),
      WEB_DATABASE_URL: target("web", true),
      WORKER_DATABASE_URL: target("worker"),
    })

    expect(summary).toEqual({
      migration: { endpointClass: "direct", present: true, tls: true },
      reporting: { endpointClass: "pooled", present: true, tls: true },
      test: { endpointClass: "direct", present: true, tls: true },
      web: { endpointClass: "pooled", present: true, tls: true },
      worker: { endpointClass: "direct", present: true, tls: true },
    })
    expect(JSON.stringify(summary)).not.toContain("secret")
  })
})
