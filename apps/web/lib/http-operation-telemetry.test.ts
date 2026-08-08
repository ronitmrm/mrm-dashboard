import {
  createTelemetryRuntime,
  type StructuredTelemetryEvent,
} from "@workspace/observability"
import { expect, test } from "vitest"

import { withHttpPerformanceOperation } from "./http-operation-telemetry"

test("measures the actual HTTP bodies without changing the response", async () => {
  const events: StructuredTelemetryEvent[] = []
  const requestBody = JSON.stringify({ floor: "Production" })
  const responseBody = JSON.stringify({ status: "unchanged", version: 42 })
  const request = new Request("http://dashboard.local/api/dashboard-state", {
    body: requestBody,
    method: "POST",
  })
  const response = new Response(responseBody, {
    headers: { "content-type": "application/json" },
  })

  await expect(
    withHttpPerformanceOperation(
      {
        operation: "dashboard.http.post",
        request,
        runtime: createTelemetryRuntime({
          artifactCommit: "commit-http-boundary",
          environment: "test",
          now: () => "2026-08-08T12:00:00.000Z",
        }),
        sink: (event) => events.push(event),
        subsystem: "dashboard",
      },
      async () => response
    )
  ).resolves.toBe(response)

  expect(events).toEqual([
    expect.objectContaining({
      event: "performance.operation",
      httpBytes: {
        request: Buffer.byteLength(requestBody),
        response: Buffer.byteLength(responseBody),
      },
      operation: "dashboard.http.post",
      requestId: expect.any(String),
      subsystem: "dashboard",
    }),
  ])
})
