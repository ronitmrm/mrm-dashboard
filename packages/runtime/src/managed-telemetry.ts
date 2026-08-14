import {
  emitStructuredTelemetry,
  redisAccelerationEvent,
  retainedJsonTelemetrySink,
  telemetryRuntimeFromEnvironment,
  type RuntimeErrorCategory,
  type TelemetryRuntime,
  type TelemetrySink,
} from "@workspace/observability"

export type { RuntimeErrorCategory } from "@workspace/observability"

function errorDescriptor(error: unknown, depth = 0): string {
  if (error === null || error === undefined || error === "" || depth > 2) {
    return ""
  }
  if (typeof error !== "object") return String(error)

  const record = error as {
    code?: unknown
    errors?: unknown
    message?: unknown
    name?: unknown
  }
  const nested = Array.isArray(record.errors)
    ? record.errors.map((item) => errorDescriptor(item, depth + 1)).join(" ")
    : ""
  return [record.name, record.message, record.code, nested]
    .filter((value) => typeof value === "string")
    .join(" ")
}

const counters = {
  redisCommands: 0,
  redisOutboxFailures: 0,
  redisProviderErrors: {
    authentication: 0,
    connectivity: 0,
    constraint: 0,
    timeout: 0,
    unknown: 0,
  } satisfies Record<RuntimeErrorCategory, number>,
  redisRateLimitFallbacks: 0,
}

let telemetryRuntime = telemetryRuntimeFromEnvironment()
let telemetrySink: TelemetrySink = retainedJsonTelemetrySink

export function configureManagedRuntimeTelemetry({
  runtime,
  sink,
}: {
  runtime?: TelemetryRuntime
  sink?: TelemetrySink
}) {
  telemetryRuntime = runtime ?? telemetryRuntimeFromEnvironment()
  telemetrySink = sink ?? retainedJsonTelemetrySink
}

function emitRedisAccelerationTelemetry() {
  emitStructuredTelemetry(
    redisAccelerationEvent(
      {
        commands: counters.redisCommands,
        outboxFailures: counters.redisOutboxFailures,
        providerErrors: { ...counters.redisProviderErrors },
        rateLimitFallbacks: counters.redisRateLimitFallbacks,
      },
      telemetryRuntime
    ),
    telemetrySink
  )
}

export function runtimeErrorCategory(
  error: unknown
): RuntimeErrorCategory | null {
  if (error === null || error === undefined || error === "") return null
  const message = errorDescriptor(error).toLowerCase()
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("etimedout")
  ) {
    return "timeout"
  }
  if (
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("socket")
  ) {
    return "connectivity"
  }
  if (
    message.includes("authentication") ||
    message.includes("password") ||
    message.includes("unauthorized")
  ) {
    return "authentication"
  }
  if (
    message.includes("constraint") ||
    message.includes("duplicate key") ||
    message.includes("foreign key")
  ) {
    return "constraint"
  }
  return "unknown"
}

export function recordRedisCommand() {
  counters.redisCommands += 1
  emitRedisAccelerationTelemetry()
}

export function recordRedisOutboxFailure() {
  counters.redisOutboxFailures += 1
  emitRedisAccelerationTelemetry()
}

export function recordRedisRateLimitFallback() {
  counters.redisRateLimitFallbacks += 1
  emitRedisAccelerationTelemetry()
}

export function recordRedisProviderError(error: unknown) {
  const category = runtimeErrorCategory(error) ?? "unknown"
  counters.redisProviderErrors[category] += 1
  emitRedisAccelerationTelemetry()
}

export function managedRuntimeTelemetrySnapshot() {
  return {
    redis: {
      commands: counters.redisCommands,
      outboxFailures: counters.redisOutboxFailures,
      providerErrors: { ...counters.redisProviderErrors },
      rateLimitFallbacks: counters.redisRateLimitFallbacks,
    },
  }
}

export function resetManagedRuntimeTelemetry() {
  counters.redisCommands = 0
  counters.redisOutboxFailures = 0
  counters.redisProviderErrors.authentication = 0
  counters.redisProviderErrors.connectivity = 0
  counters.redisProviderErrors.constraint = 0
  counters.redisProviderErrors.timeout = 0
  counters.redisProviderErrors.unknown = 0
  counters.redisRateLimitFallbacks = 0
}
