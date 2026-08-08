import { AsyncLocalStorage } from "node:async_hooks"
import { performance } from "node:perf_hooks"

export type TelemetryRuntime = {
  artifactCommit: string
  environment: string
  now: () => string
}

export type TelemetrySink = (event: StructuredTelemetryEvent) => void

export type OperationCoverage = {
  available: number
  limit: number
  returned: number
  truncated: boolean
}

export type RuntimeErrorCategory =
  | "authentication"
  | "connectivity"
  | "constraint"
  | "timeout"
  | "unknown"

export type PerformanceOperationEvent = {
  artifactCommit: string
  commandId: string | null
  coverage: OperationCoverage | null
  durationMs: number
  environment: string
  event: "performance.operation"
  httpBytes: { request: number; response: number }
  operation: string
  outcome: "error" | "success"
  poolWaiters: number
  postgresBytes: { request: number; response: number }
  requestId: string | null
  rows: number
  statements: number
  subsystem: string
  timestamp: string
}

export type AuthorizationRequestEvent = {
  artifactCommit: string
  durationMs: number
  environment: string
  event: "authorization.request"
  grantReads: number
  outcome: "allowed" | "error" | "unauthenticated" | "unauthorized"
  requestId: string
  sessionReads: number
  subsystem: "authorization"
  timestamp: string
}

export type RedisAccelerationCounters = {
  commands: number
  outboxFailures: number
  providerErrors: Record<RuntimeErrorCategory, number>
  rateLimitFallbacks: number
}

export type RedisAccelerationEvent = RedisAccelerationCounters & {
  artifactCommit: string
  environment: string
  event: "redis.acceleration"
  subsystem: "redis"
  timestamp: string
}

export type WorkerListenerState =
  | "connecting"
  | "listening"
  | "reconciling"
  | "ready"
  | "retrying"
  | "stopped"

export type WorkerReconciliationResult = "error" | "not-run" | "success"

export type WorkerListenerEvent = {
  artifactCommit: string
  commandId: string
  disconnectCategory: RuntimeErrorCategory | null
  environment: string
  event: "worker.listener"
  reconciliationResult: WorkerReconciliationResult
  retryCount: number
  state: WorkerListenerState
  subsystem: "worker"
  timestamp: string
}

export type WorkerSweepEvent = {
  artifactCommit: string
  commandId: string
  cycleOutcome: "error" | "success"
  environment: string
  event: "worker.sweep"
  failedJobs: number
  lastReconciliationAt: string | null
  lastReconnectAt: string | null
  lastVersion: number | null
  listenerState: WorkerListenerState
  oldestOutboxSeconds: number | null
  oldestPendingSeconds: number | null
  pendingJobs: number
  pendingOutbox: number
  poolWaiters: number
  retryingOutbox: number
  runningJobs: number
  subsystem: "worker"
  sweepCount: number
  timestamp: string
}

export type StructuredTelemetryEvent =
  | AuthorizationRequestEvent
  | PerformanceOperationEvent
  | RedisAccelerationEvent
  | WorkerListenerEvent
  | WorkerSweepEvent

type OperationMetrics = {
  coverage: OperationCoverage | null
  httpRequestBytes: number
  httpResponseBytes: number
  poolWaiters: number
  postgresRequestBytes: number
  postgresResponseBytes: number
  rows: number
  statements: number
}

const operationStorage = new AsyncLocalStorage<readonly OperationMetrics[]>()

function nonNegative(value: number, field: string) {
  void field
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function nullableNonNegative(value: number | null, field: string) {
  return value === null ? null : nonNegative(value, field)
}

function runtimeFields(runtime: TelemetryRuntime) {
  try {
    return {
      artifactCommit: runtime.artifactCommit || "unknown",
      environment: runtime.environment || "unknown",
      timestamp: runtime.now() || new Date().toISOString(),
    }
  } catch {
    return {
      artifactCommit: "unknown",
      environment: "unknown",
      timestamp: new Date().toISOString(),
    }
  }
}

function safeEmit(sink: TelemetrySink, event: StructuredTelemetryEvent) {
  try {
    sink(event)
  } catch {
    // Observability must not alter the canonical business result.
  }
}

export function createTelemetryRuntime({
  artifactCommit,
  environment,
  now = () => new Date().toISOString(),
}: {
  artifactCommit: string
  environment: string
  now?: () => string
}): TelemetryRuntime {
  return { artifactCommit, environment, now }
}

export function telemetryRuntimeFromEnvironment(
  environment: Record<string, string | undefined> = process.env
) {
  return createTelemetryRuntime({
    artifactCommit:
      environment.VERCEL_GIT_COMMIT_SHA ??
      environment.GIT_COMMIT_SHA ??
      "unknown",
    environment: environment.VERCEL_ENV ?? environment.NODE_ENV ?? "unknown",
  })
}

export const retainedJsonTelemetrySink: TelemetrySink = (event) => {
  console.info(JSON.stringify(event))
}

export async function withPerformanceOperation<Result>(
  {
    commandId = null,
    operation,
    requestId = null,
    runtime = telemetryRuntimeFromEnvironment(),
    sink = retainedJsonTelemetrySink,
    subsystem,
  }: {
    commandId?: string | null
    operation: string
    requestId?: string | null
    runtime?: TelemetryRuntime
    sink?: TelemetrySink
    subsystem: string
  },
  execute: () => Promise<Result>
): Promise<Result> {
  const metrics: OperationMetrics = {
    coverage: null,
    httpRequestBytes: 0,
    httpResponseBytes: 0,
    poolWaiters: 0,
    postgresRequestBytes: 0,
    postgresResponseBytes: 0,
    rows: 0,
    statements: 0,
  }
  const startedAt = performance.now()
  const parentMetrics = operationStorage.getStore() ?? []
  let outcome: PerformanceOperationEvent["outcome"] = "success"

  try {
    return await operationStorage.run([...parentMetrics, metrics], execute)
  } catch (error) {
    outcome = "error"
    throw error
  } finally {
    safeEmit(sink, {
      ...runtimeFields(runtime),
      commandId,
      coverage: metrics.coverage,
      durationMs: Math.max(0, performance.now() - startedAt),
      event: "performance.operation",
      httpBytes: {
        request: metrics.httpRequestBytes,
        response: metrics.httpResponseBytes,
      },
      operation,
      outcome,
      poolWaiters: metrics.poolWaiters,
      postgresBytes: {
        request: metrics.postgresRequestBytes,
        response: metrics.postgresResponseBytes,
      },
      requestId,
      rows: metrics.rows,
      statements: metrics.statements,
      subsystem,
    })
  }
}

export function recordPostgresStatement({
  poolWaiters,
  requestBytes,
  responseBytes,
  rows,
}: {
  poolWaiters: number
  requestBytes: number
  responseBytes: number
  rows: number
}) {
  const operationMetrics = operationStorage.getStore()
  if (!operationMetrics) return

  for (const metrics of operationMetrics) {
    metrics.statements += 1
    metrics.rows += nonNegative(rows, "rows")
    metrics.postgresRequestBytes += nonNegative(
      requestBytes,
      "PostgreSQL request bytes"
    )
    metrics.postgresResponseBytes += nonNegative(
      responseBytes,
      "PostgreSQL response bytes"
    )
    metrics.poolWaiters = Math.max(
      metrics.poolWaiters,
      nonNegative(poolWaiters, "pool waiters")
    )
  }
}

export function recordPostgresPoolWaiters(poolWaiters: number) {
  const operationMetrics = operationStorage.getStore()
  if (!operationMetrics) return
  for (const metrics of operationMetrics) {
    metrics.poolWaiters = Math.max(
      metrics.poolWaiters,
      nonNegative(poolWaiters, "pool waiters")
    )
  }
}

export function recordHttpBytes({
  requestBytes,
  responseBytes,
}: {
  requestBytes: number
  responseBytes: number
}) {
  const operationMetrics = operationStorage.getStore()
  if (!operationMetrics) return
  for (const metrics of operationMetrics) {
    metrics.httpRequestBytes += nonNegative(requestBytes, "HTTP request bytes")
    metrics.httpResponseBytes += nonNegative(
      responseBytes,
      "HTTP response bytes"
    )
  }
}

export function setOperationCoverage(coverage: OperationCoverage) {
  const operationMetrics = operationStorage.getStore()
  if (!operationMetrics) return
  for (const metrics of operationMetrics) {
    metrics.coverage = {
      available: nonNegative(coverage.available, "coverage available"),
      limit: nonNegative(coverage.limit, "coverage limit"),
      returned: nonNegative(coverage.returned, "coverage returned"),
      truncated: coverage.truncated,
    }
  }
}

export function serializedByteLength(value: unknown) {
  try {
    const seen = new WeakSet<object>()
    const serialized = JSON.stringify(value, (_key, nestedValue: unknown) => {
      if (typeof nestedValue === "bigint") return nestedValue.toString()
      if (nestedValue && typeof nestedValue === "object") {
        if (seen.has(nestedValue)) return "[Circular]"
        seen.add(nestedValue)
      }
      return nestedValue
    })
    return serialized === undefined ? 0 : Buffer.byteLength(serialized, "utf8")
  } catch {
    return 0
  }
}

export function authorizationRequestEvent(
  input: Omit<
    AuthorizationRequestEvent,
    "artifactCommit" | "environment" | "event" | "subsystem" | "timestamp"
  >,
  runtime: TelemetryRuntime = telemetryRuntimeFromEnvironment()
): AuthorizationRequestEvent {
  return {
    ...runtimeFields(runtime),
    durationMs: nonNegative(input.durationMs, "authorization duration"),
    event: "authorization.request",
    grantReads: nonNegative(input.grantReads, "grant reads"),
    outcome: input.outcome,
    requestId: input.requestId,
    sessionReads: nonNegative(input.sessionReads, "session reads"),
    subsystem: "authorization",
  }
}

export function createAuthorizationRequestTelemetry({
  requestId,
  runtime = telemetryRuntimeFromEnvironment(),
  sink = retainedJsonTelemetrySink,
}: {
  requestId: string
  runtime?: TelemetryRuntime
  sink?: TelemetrySink
}) {
  let activeStartedAt: number | null = null
  let durationMs = 0
  let emitted = false
  let grantReads = 0
  let outcome: AuthorizationRequestEvent["outcome"] = "error"
  let sessionReads = 0

  const beginRead = () => {
    if (activeStartedAt === null) activeStartedAt = performance.now()
  }
  const finishRead = () => {
    if (activeStartedAt === null) return
    durationMs += Math.max(0, performance.now() - activeStartedAt)
    activeStartedAt = null
  }

  return {
    emit() {
      if (emitted) return
      emitted = true
      finishRead()
      safeEmit(
        sink,
        authorizationRequestEvent(
          {
            durationMs,
            grantReads,
            outcome,
            requestId,
            sessionReads,
          },
          runtime
        )
      )
    },
    recordGrantRead() {
      beginRead()
      grantReads += 1
    },
    recordSessionRead() {
      beginRead()
      sessionReads += 1
    },
    setOutcome(nextOutcome: AuthorizationRequestEvent["outcome"]) {
      outcome = nextOutcome
      finishRead()
    },
  }
}

export function redisAccelerationEvent(
  counters: RedisAccelerationCounters,
  runtime: TelemetryRuntime = telemetryRuntimeFromEnvironment()
): RedisAccelerationEvent {
  return {
    ...runtimeFields(runtime),
    commands: nonNegative(counters.commands, "Redis commands"),
    event: "redis.acceleration",
    outboxFailures: nonNegative(
      counters.outboxFailures,
      "Redis outbox failures"
    ),
    providerErrors: Object.fromEntries(
      Object.entries(counters.providerErrors).map(([category, count]) => [
        category,
        nonNegative(count, `Redis ${category} errors`),
      ])
    ) as Record<RuntimeErrorCategory, number>,
    rateLimitFallbacks: nonNegative(
      counters.rateLimitFallbacks,
      "Redis rate-limit fallbacks"
    ),
    subsystem: "redis",
  }
}

export function workerListenerEvent(
  input: Omit<
    WorkerListenerEvent,
    "artifactCommit" | "environment" | "event" | "subsystem" | "timestamp"
  >,
  runtime: TelemetryRuntime = telemetryRuntimeFromEnvironment()
): WorkerListenerEvent {
  return {
    ...runtimeFields(runtime),
    commandId: input.commandId,
    disconnectCategory: input.disconnectCategory,
    event: "worker.listener",
    reconciliationResult: input.reconciliationResult,
    retryCount: nonNegative(input.retryCount, "listener retry count"),
    state: input.state,
    subsystem: "worker",
  }
}

export function workerSweepEvent(
  input: Omit<
    WorkerSweepEvent,
    "artifactCommit" | "environment" | "event" | "subsystem" | "timestamp"
  >,
  runtime: TelemetryRuntime = telemetryRuntimeFromEnvironment()
): WorkerSweepEvent {
  return {
    ...runtimeFields(runtime),
    commandId: input.commandId,
    cycleOutcome: input.cycleOutcome,
    event: "worker.sweep",
    failedJobs: nonNegative(input.failedJobs, "failed refresh jobs"),
    lastReconciliationAt: input.lastReconciliationAt,
    lastReconnectAt: input.lastReconnectAt,
    lastVersion: nullableNonNegative(input.lastVersion, "last version"),
    listenerState: input.listenerState,
    oldestOutboxSeconds: nullableNonNegative(
      input.oldestOutboxSeconds,
      "oldest outbox seconds"
    ),
    oldestPendingSeconds: nullableNonNegative(
      input.oldestPendingSeconds,
      "oldest pending seconds"
    ),
    pendingJobs: nonNegative(input.pendingJobs, "pending refresh jobs"),
    pendingOutbox: nonNegative(input.pendingOutbox, "pending outbox"),
    poolWaiters: nonNegative(input.poolWaiters, "worker pool waiters"),
    retryingOutbox: nonNegative(input.retryingOutbox, "retrying outbox"),
    runningJobs: nonNegative(input.runningJobs, "running refresh jobs"),
    subsystem: "worker",
    sweepCount: nonNegative(input.sweepCount, "sweep count"),
  }
}

export function emitStructuredTelemetry(
  event: StructuredTelemetryEvent,
  sink: TelemetrySink = retainedJsonTelemetrySink
) {
  safeEmit(sink, event)
}

export function assertRequiredTelemetry(
  events: readonly StructuredTelemetryEvent[],
  requiredEvents: readonly StructuredTelemetryEvent["event"][] = [
    "authorization.request",
    "performance.operation",
    "redis.acceleration",
  ]
) {
  const validCounter = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0

  for (const requiredEvent of requiredEvents) {
    if (!events.some(({ event }) => event === requiredEvent)) {
      throw new Error(`Benchmark telemetry is missing ${requiredEvent}`)
    }
  }

  for (const event of events) {
    if (
      !event.artifactCommit ||
      event.artifactCommit === "unknown" ||
      !event.environment ||
      event.environment === "unknown" ||
      !event.timestamp
    ) {
      throw new Error(`${event.event} is missing retained release fields`)
    }
    if (!event.subsystem) {
      throw new Error(`${event.event} is missing its subsystem`)
    }
    if (event.event === "performance.operation") {
      const requiredMetrics = [
        event.durationMs,
        event.httpBytes.request,
        event.httpBytes.response,
        event.poolWaiters,
        event.postgresBytes.request,
        event.postgresBytes.response,
        event.rows,
        event.statements,
      ]
      if (
        !event.operation ||
        (!event.requestId && !event.commandId) ||
        !["error", "success"].includes(event.outcome) ||
        requiredMetrics.some((value) => !validCounter(value))
      ) {
        throw new Error("performance.operation is missing numeric metrics")
      }
    }
    if (event.event === "authorization.request") {
      if (
        !event.requestId ||
        !["allowed", "error", "unauthenticated", "unauthorized"].includes(
          event.outcome
        ) ||
        !validCounter(event.durationMs) ||
        !validCounter(event.grantReads) ||
        !validCounter(event.sessionReads) ||
        event.grantReads + event.sessionReads === 0
      ) {
        throw new Error("authorization.request is missing required metrics")
      }
    }
    if (event.event === "redis.acceleration") {
      const providerErrorCounts = [
        event.providerErrors?.authentication,
        event.providerErrors?.connectivity,
        event.providerErrors?.constraint,
        event.providerErrors?.timeout,
        event.providerErrors?.unknown,
      ]
      if (
        !validCounter(event.commands) ||
        !validCounter(event.outboxFailures) ||
        !validCounter(event.rateLimitFallbacks) ||
        providerErrorCounts.some((value) => !validCounter(value))
      ) {
        throw new Error("redis.acceleration is missing required metrics")
      }
    }
    if (event.event === "worker.listener") {
      const categories: Array<RuntimeErrorCategory | null> = [
        null,
        "authentication",
        "connectivity",
        "constraint",
        "timeout",
        "unknown",
      ]
      if (
        !event.commandId ||
        ![
          "connecting",
          "listening",
          "reconciling",
          "ready",
          "retrying",
          "stopped",
        ].includes(event.state) ||
        !["error", "not-run", "success"].includes(event.reconciliationResult) ||
        !categories.includes(event.disconnectCategory) ||
        !validCounter(event.retryCount)
      ) {
        throw new Error("worker.listener is missing required fields")
      }
    }
    if (event.event === "worker.sweep") {
      const counters = [
        event.failedJobs,
        event.pendingJobs,
        event.pendingOutbox,
        event.poolWaiters,
        event.retryingOutbox,
        event.runningJobs,
        event.sweepCount,
      ]
      const nullableCounters = [
        event.lastVersion,
        event.oldestOutboxSeconds,
        event.oldestPendingSeconds,
      ]
      if (
        !event.commandId ||
        !["error", "success"].includes(event.cycleOutcome) ||
        ![
          "connecting",
          "listening",
          "reconciling",
          "ready",
          "retrying",
          "stopped",
        ].includes(event.listenerState) ||
        counters.some((value) => !validCounter(value)) ||
        event.sweepCount < 1 ||
        nullableCounters.some(
          (value) => value !== null && !validCounter(value)
        ) ||
        (event.lastReconnectAt !== null && !event.lastReconnectAt) ||
        (event.lastReconciliationAt !== null && !event.lastReconciliationAt)
      ) {
        throw new Error("worker.sweep is missing required fields")
      }
    }
  }
}

export function createTelemetryBenchmarkHarness(
  requiredEvents: readonly StructuredTelemetryEvent["event"][] = [
    "authorization.request",
    "performance.operation",
    "redis.acceleration",
  ]
) {
  const events: StructuredTelemetryEvent[] = []
  return {
    assertComplete() {
      assertRequiredTelemetry(events, requiredEvents)
      return [...events]
    },
    sink(event: StructuredTelemetryEvent) {
      events.push(event)
    },
  }
}
