import { AsyncResource } from "node:async_hooks"

import {
  createTelemetryRuntime,
  type StructuredTelemetryEvent,
} from "@workspace/observability"
import { expect, test } from "vitest"

import {
  authorizationRequestTelemetryForCurrentScope,
  getOrCreateAuthorizationRequestTelemetry,
  withAuthorizationRequestTelemetry,
} from "./authorization-request-telemetry"

test("shares one authorization summary across parallel request branches", async () => {
  const events: StructuredTelemetryEvent[] = []
  const options = {
    requestId: "request-auth-scope",
    runtime: createTelemetryRuntime({
      artifactCommit: "commit-auth-scope",
      environment: "test",
      now: () => "2026-08-08T12:00:00.000Z",
    }),
    sink: (event: StructuredTelemetryEvent) => events.push(event),
  }

  await withAuthorizationRequestTelemetry(options, async () => {
    await Promise.all([
      Promise.resolve().then(() => {
        const first = authorizationRequestTelemetryForCurrentScope(options)
        first.telemetry.recordSessionRead()
        first.finish()
      }),
      Promise.resolve().then(() => {
        const second = authorizationRequestTelemetryForCurrentScope(options)
        second.telemetry.recordGrantRead()
        second.telemetry.setOutcome("allowed")
        second.finish()
      }),
    ])
  })

  expect(events).toEqual([
    expect.objectContaining({
      event: "authorization.request",
      grantReads: 1,
      outcome: "allowed",
      requestId: "request-auth-scope",
      sessionReads: 1,
    }),
  ])
})

test("keeps a scheduled route-handler summary across awaits", async () => {
  const events: StructuredTelemetryEvent[] = []
  const callbacks: Array<() => void> = []
  const options = {
    requestId: "request-route-handler",
    runtime: createTelemetryRuntime({
      artifactCommit: "commit-route-handler",
      environment: "test",
      now: () => "2026-08-08T12:00:00.000Z",
    }),
    sink: (event: StructuredTelemetryEvent) => events.push(event),
  }
  const resource = new AsyncResource("authorization-route-test")

  await new Promise<void>((resolve, reject) => {
    resource.runInAsyncScope(() => {
      void (async () => {
        try {
          const first = getOrCreateAuthorizationRequestTelemetry(
            options,
            (callback) => callbacks.push(callback)
          )
          first.telemetry.recordSessionRead()
          await Promise.resolve()
          const second = getOrCreateAuthorizationRequestTelemetry(
            options,
            (callback) => callbacks.push(callback)
          )
          second.telemetry.recordGrantRead()
          second.telemetry.setOutcome("allowed")
          expect(second.telemetry).toBe(first.telemetry)
          expect(callbacks).toHaveLength(1)
          callbacks[0]?.()
          resolve()
        } catch (error) {
          reject(error)
        } finally {
          resource.emitDestroy()
        }
      })()
    })
  })

  expect(events).toEqual([
    expect.objectContaining({
      event: "authorization.request",
      grantReads: 1,
      outcome: "allowed",
      requestId: "request-route-handler",
      sessionReads: 1,
    }),
  ])
})
