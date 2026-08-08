import {
  createTelemetryRuntime,
  type StructuredTelemetryEvent,
} from "@workspace/observability"
import { expect, test } from "vitest"

import { withPostgresRepository } from "./postgres-repository-lifecycle"

test("waits for a PostgreSQL operation before closing its pool", async () => {
  const events: string[] = []
  let finishOperation!: () => void
  const pending = new Promise<void>((resolve) => {
    finishOperation = resolve
  })
  const repository = {
    async close() {
      events.push("close")
    },
  }

  const result = withPostgresRepository(repository, async () => {
    events.push("operation:start")
    await pending
    events.push("operation:done")
    return "saved"
  })

  await Promise.resolve()
  expect(events).toEqual(["operation:start"])
  finishOperation()
  await expect(result).resolves.toBe("saved")
  expect(events).toEqual(["operation:start", "operation:done", "close"])
})

test("emits a repository operation without changing its result", async () => {
  const events: StructuredTelemetryEvent[] = []
  const response = { status: "unchanged", version: 42 }
  const repository = { close: async () => undefined }

  await expect(
    withPostgresRepository(repository, async () => response, {
      operation: "dashboard.state",
      requestId: "request-http",
      runtime: createTelemetryRuntime({
        artifactCommit: "commit-http-boundary",
        environment: "test",
        now: () => "2026-08-08T12:00:00.000Z",
      }),
      sink: (event) => events.push(event),
      subsystem: "dashboard",
    })
  ).resolves.toBe(response)

  expect(events).toEqual([
    expect.objectContaining({
      event: "performance.operation",
      httpBytes: { request: 0, response: 0 },
      operation: "dashboard.state",
      requestId: "request-http",
      subsystem: "dashboard",
    }),
  ])
  expect(JSON.stringify(events)).not.toContain("production")
  expect(JSON.stringify(events)).not.toContain("unchanged")
})
