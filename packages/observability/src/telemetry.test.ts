import { performance } from "node:perf_hooks"

import { describe, expect, it, vi } from "vitest"

import {
  assertRequiredTelemetry,
  authorizationRequestEvent,
  createAuthorizationRequestTelemetry,
  createTelemetryBenchmarkHarness,
  createTelemetryRuntime,
  recordHttpBytes,
  recordPostgresStatement,
  redisAccelerationEvent,
  serializedByteLength,
  setOperationCoverage,
  withPerformanceOperation,
  type StructuredTelemetryEvent,
} from "./index"

const runtime = createTelemetryRuntime({
  artifactCommit: "commit-abc123",
  environment: "test",
  now: () => "2026-08-08T12:00:00.000Z",
})

describe("structured telemetry contracts", () => {
  it("emits stable performance fields with exact statement and byte totals", async () => {
    const events: StructuredTelemetryEvent[] = []
    const result = await withPerformanceOperation(
      {
        operation: "dashboard.state",
        requestId: "request-1",
        runtime,
        sink: (event) => events.push(event),
        subsystem: "dashboard",
      },
      async () => {
        recordPostgresStatement({
          poolWaiters: 1,
          requestBytes: 13,
          responseBytes: 20,
          rows: 2,
        })
        recordPostgresStatement({
          poolWaiters: 4,
          requestBytes: 7,
          responseBytes: 5,
          rows: 3,
        })
        recordHttpBytes({ requestBytes: 11, responseBytes: 23 })
        setOperationCoverage({
          available: 51,
          limit: 50,
          returned: 50,
          truncated: true,
        })
        return { status: "unchanged" as const }
      }
    )

    expect(result).toEqual({ status: "unchanged" })
    expect(events).toEqual([
      {
        artifactCommit: "commit-abc123",
        commandId: null,
        coverage: {
          available: 51,
          limit: 50,
          returned: 50,
          truncated: true,
        },
        durationMs: expect.any(Number),
        environment: "test",
        event: "performance.operation",
        httpBytes: { request: 11, response: 23 },
        operation: "dashboard.state",
        outcome: "success",
        poolWaiters: 4,
        postgresBytes: { request: 20, response: 25 },
        requestId: "request-1",
        rows: 5,
        statements: 2,
        subsystem: "dashboard",
        timestamp: "2026-08-08T12:00:00.000Z",
      },
    ])
  })

  it("preserves business results and errors even when the telemetry sink fails", async () => {
    const sink = vi.fn(() => {
      throw new Error("log drain unavailable")
    })

    await expect(
      withPerformanceOperation(
        {
          operation: "commercial.read",
          runtime,
          sink,
          subsystem: "commercial",
        },
        async () => "same-result"
      )
    ).resolves.toBe("same-result")

    const businessError = new Error("canonical failure")
    await expect(
      withPerformanceOperation(
        {
          operation: "commercial.write",
          runtime,
          sink,
          subsystem: "commercial",
        },
        async () => {
          throw businessError
        }
      )
    ).rejects.toBe(businessError)
    expect(sink).toHaveBeenCalledTimes(2)
  })

  it("preserves business results when metric serialization or runtime fields fail", async () => {
    const events: StructuredTelemetryEvent[] = []
    const throwingValue = {
      toJSON() {
        throw new Error("cannot serialize")
      },
    }
    expect(serializedByteLength(throwingValue)).toBe(0)

    await expect(
      withPerformanceOperation(
        {
          operation: "telemetry.failure",
          runtime: createTelemetryRuntime({
            artifactCommit: "commit-failure",
            environment: "test",
            now: () => {
              throw new Error("clock unavailable")
            },
          }),
          sink: (event) => events.push(event),
          subsystem: "test",
        },
        async () => "same-result"
      )
    ).resolves.toBe("same-result")
    expect(events).toEqual([
      expect.objectContaining({
        artifactCommit: "unknown",
        environment: "unknown",
        event: "performance.operation",
      }),
    ])
  })

  it("attributes database metrics to nested and outer operation scopes", async () => {
    const events: StructuredTelemetryEvent[] = []
    await withPerformanceOperation(
      {
        operation: "outer.http",
        runtime,
        sink: (event) => events.push(event),
        subsystem: "test",
      },
      async () =>
        withPerformanceOperation(
          {
            operation: "inner.repository",
            runtime,
            sink: (event) => events.push(event),
            subsystem: "test",
          },
          async () => {
            recordPostgresStatement({
              poolWaiters: 2,
              requestBytes: 5,
              responseBytes: 7,
              rows: 1,
            })
          }
        )
    )

    expect(events).toEqual([
      expect.objectContaining({
        operation: "inner.repository",
        poolWaiters: 2,
        statements: 1,
      }),
      expect.objectContaining({
        operation: "outer.http",
        poolWaiters: 2,
        statements: 1,
      }),
    ])
  })

  it("emits authorization and Redis counters without identity or payload fields", () => {
    const authorization = authorizationRequestEvent(
      {
        durationMs: 12,
        grantReads: 1,
        outcome: "allowed",
        requestId: "request-2",
        sessionReads: 1,
      },
      runtime
    )
    const redis = redisAccelerationEvent(
      {
        commands: 7,
        outboxFailures: 1,
        providerErrors: {
          authentication: 0,
          connectivity: 2,
          constraint: 0,
          timeout: 1,
          unknown: 0,
        },
        rateLimitFallbacks: 3,
      },
      runtime
    )

    expect(authorization).toEqual({
      artifactCommit: "commit-abc123",
      durationMs: 12,
      environment: "test",
      event: "authorization.request",
      grantReads: 1,
      outcome: "allowed",
      requestId: "request-2",
      sessionReads: 1,
      subsystem: "authorization",
      timestamp: "2026-08-08T12:00:00.000Z",
    })
    expect(redis).toEqual({
      artifactCommit: "commit-abc123",
      commands: 7,
      environment: "test",
      event: "redis.acceleration",
      outboxFailures: 1,
      providerErrors: {
        authentication: 0,
        connectivity: 2,
        constraint: 0,
        timeout: 1,
        unknown: 0,
      },
      rateLimitFallbacks: 3,
      subsystem: "redis",
      timestamp: "2026-08-08T12:00:00.000Z",
    })
    expect(JSON.stringify([authorization, redis])).not.toMatch(
      /user|grantSet|capabilit|payload|secret|key|value/i
    )
  })

  it("emits one request-scoped authorization summary from logical reads", () => {
    const now = vi
      .spyOn(performance, "now")
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(15)
    const events: StructuredTelemetryEvent[] = []
    const telemetry = createAuthorizationRequestTelemetry({
      requestId: "request-auth",
      runtime,
      sink: (event) => events.push(event),
    })

    telemetry.recordSessionRead()
    telemetry.recordGrantRead()
    telemetry.setOutcome("allowed")
    telemetry.emit()
    telemetry.emit()

    expect(events).toEqual([
      expect.objectContaining({
        event: "authorization.request",
        durationMs: 5,
        grantReads: 1,
        outcome: "allowed",
        requestId: "request-auth",
        sessionReads: 1,
      }),
    ])
    now.mockRestore()
  })

  it("measures UTF-8 serialization and rejects missing benchmark telemetry", () => {
    expect(serializedByteLength({ message: "₹" })).toBe(
      Buffer.byteLength(JSON.stringify({ message: "₹" }), "utf8")
    )
    const circular: { amount: bigint; self?: unknown } = { amount: 42n }
    circular.self = circular
    expect(serializedByteLength(circular)).toBeGreaterThan(0)

    expect(() => assertRequiredTelemetry([])).toThrow(/authorization\.request/)
    const benchmark = createTelemetryBenchmarkHarness()
    expect(() => benchmark.assertComplete()).toThrow(/authorization\.request/)
    expect(() =>
      assertRequiredTelemetry([
        authorizationRequestEvent(
          {
            durationMs: 1,
            grantReads: 1,
            outcome: "allowed",
            requestId: "request-3",
            sessionReads: 1,
          },
          runtime
        ),
      ])
    ).toThrow(/performance\.operation/)

    const incompleteRuntime = createTelemetryRuntime({
      artifactCommit: "unknown",
      environment: "test",
      now: () => "2026-08-08T12:00:00.000Z",
    })
    expect(() =>
      assertRequiredTelemetry(
        [
          {
            artifactCommit: "unknown",
            commandId: null,
            coverage: null,
            durationMs: 1,
            environment: "test",
            event: "performance.operation",
            httpBytes: { request: 0, response: 0 },
            operation: "benchmark",
            outcome: "success",
            poolWaiters: 0,
            postgresBytes: { request: 0, response: 0 },
            requestId: "request-4",
            rows: 0,
            statements: 0,
            subsystem: "test",
            timestamp: incompleteRuntime.now(),
          },
        ],
        ["performance.operation"]
      )
    ).toThrow(/release fields/)

    expect(() =>
      assertRequiredTelemetry(
        [
          {
            ...authorizationRequestEvent(
              {
                durationMs: 1,
                grantReads: 1,
                outcome: "allowed",
                requestId: "request-malformed-auth",
                sessionReads: 1,
              },
              runtime
            ),
            grantReads: Number.NaN,
          },
        ],
        ["authorization.request"]
      )
    ).toThrow(/authorization\.request/)
    expect(() =>
      assertRequiredTelemetry(
        [
          {
            ...redisAccelerationEvent(
              {
                commands: 1,
                outboxFailures: 0,
                providerErrors: {
                  authentication: 0,
                  connectivity: 0,
                  constraint: 0,
                  timeout: 0,
                  unknown: 0,
                },
                rateLimitFallbacks: 0,
              },
              runtime
            ),
            commands: Number.NaN,
          },
        ],
        ["redis.acceleration"]
      )
    ).toThrow(/redis\.acceleration/)
  })
})
