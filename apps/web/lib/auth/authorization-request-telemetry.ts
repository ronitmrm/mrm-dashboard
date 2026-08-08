import { AsyncLocalStorage } from "node:async_hooks"

import {
  createAuthorizationRequestTelemetry,
  type TelemetryRuntime,
  type TelemetrySink,
} from "@workspace/observability"

type AuthorizationTelemetry = ReturnType<
  typeof createAuthorizationRequestTelemetry
>

type AuthorizationScope = {
  managed: boolean
  scheduled: boolean
  telemetry?: AuthorizationTelemetry
} & Parameters<typeof createTelemetry>[0]

export type AuthorizationTelemetryHandle = {
  finish: () => void
  telemetry: AuthorizationTelemetry
}

const authorizationStorage = new AsyncLocalStorage<AuthorizationScope>()

function createTelemetry({
  requestId,
  runtime,
  sink,
}: {
  requestId: string
  runtime?: TelemetryRuntime
  sink?: TelemetrySink
}) {
  return createAuthorizationRequestTelemetry({ requestId, runtime, sink })
}

function telemetryFor(scope: AuthorizationScope) {
  scope.telemetry ??= createTelemetry(scope)
  return scope.telemetry
}

function handleFor(scope: AuthorizationScope): AuthorizationTelemetryHandle {
  return {
    finish() {
      if (!scope.managed && !scope.scheduled) scope.telemetry?.emit()
    },
    telemetry: telemetryFor(scope),
  }
}

export async function withAuthorizationRequestTelemetry<Result>(
  options: {
    requestId: string
    runtime?: TelemetryRuntime
    sink?: TelemetrySink
  },
  execute: () => Promise<Result>
) {
  if (authorizationStorage.getStore()) return execute()
  const scope: AuthorizationScope = {
    ...options,
    managed: true,
    scheduled: false,
  }
  return authorizationStorage.run(scope, async () => {
    try {
      return await execute()
    } finally {
      scope.telemetry?.emit()
    }
  })
}

export function authorizationRequestTelemetryForCurrentScope(options: {
  requestId: string
  runtime?: TelemetryRuntime
  sink?: TelemetrySink
}) {
  const scope = authorizationStorage.getStore()
  if (scope) return handleFor(scope)
  return handleFor({ ...options, managed: false, scheduled: false })
}

export function getOrCreateAuthorizationRequestTelemetry(
  options: {
    requestId: string
    runtime?: TelemetryRuntime
    sink?: TelemetrySink
  },
  registerAfter: (callback: () => void) => void
) {
  const existing = authorizationStorage.getStore()
  if (existing) return handleFor(existing)
  const scope: AuthorizationScope = {
    ...options,
    managed: false,
    scheduled: false,
  }
  authorizationStorage.enterWith(scope)
  try {
    registerAfter(() => scope.telemetry?.emit())
    scope.scheduled = true
  } catch {
    // Direct tests and non-Next callers finish at their public boundary.
  }
  return handleFor(scope)
}
