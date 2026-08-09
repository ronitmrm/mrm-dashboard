import {
  createTelemetryRuntime,
  type StructuredTelemetryEvent,
} from "@workspace/observability"
import { beforeEach, describe, expect, it, vi } from "vitest"

const authorizationMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listAllGrantedCapabilities: vi.fn(),
  redirect: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`)
  }),
}))

vi.mock("@workspace/db", () => ({
  createAuthorizationRepository: () => ({
    listAllGrantedCapabilities: authorizationMocks.listAllGrantedCapabilities,
  }),
}))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers({ cookie: "session=test" })),
}))

vi.mock("next/navigation", () => ({
  redirect: authorizationMocks.redirect,
}))

vi.mock("next/server", () => ({
  after: vi.fn(),
}))

vi.mock("../postgres-runtime", () => ({
  getWebPostgresPool: () => ({ query: vi.fn() }),
}))

vi.mock("./auth", () => ({
  getAuth: () => ({
    api: { getSession: authorizationMocks.getSession },
  }),
}))

import { withAuthorizationRequestTelemetry } from "./authorization-request-telemetry"
import {
  listGrantedCapabilities,
  requireCapability,
} from "./require-capability"

const session = {
  session: { token: "session-token" },
  user: { email: "operator@mrmpl.test", id: "user-1", name: "Operator" },
}

function request<T>(requestId: string, execute: () => Promise<T>) {
  return withAuthorizationRequestTelemetry(
    {
      requestId,
      runtime: createTelemetryRuntime({
        artifactCommit: "commit-authorization-test",
        environment: "test",
        now: () => "2026-08-09T12:00:00.000Z",
      }),
    },
    execute
  )
}

describe("request-scoped authorization", () => {
  beforeEach(() => {
    authorizationMocks.getSession.mockReset()
    authorizationMocks.listAllGrantedCapabilities.mockReset()
    authorizationMocks.redirect.mockClear()
    authorizationMocks.getSession.mockResolvedValue(session)
    authorizationMocks.listAllGrantedCapabilities.mockResolvedValue([
      "operations.dashboard.read",
      "planning.plan.read",
    ])
  })

  it("deduplicates the session and complete grant set across public checks in one request", async () => {
    const events: StructuredTelemetryEvent[] = []

    await withAuthorizationRequestTelemetry(
      {
        requestId: "request-deduplication",
        runtime: createTelemetryRuntime({
          artifactCommit: "commit-authorization-test",
          environment: "test",
          now: () => "2026-08-09T12:00:00.000Z",
        }),
        sink: (event) => events.push(event),
      },
      async () => {
        await requireCapability("operations.dashboard.read", "/")
        await requireCapability("planning.plan.read", "/planning")
        await expect(
          listGrantedCapabilities("user-1", [
            "operations.dashboard.read",
            "planning.plan.read",
          ])
        ).resolves.toEqual(["operations.dashboard.read", "planning.plan.read"])
      }
    )

    expect(authorizationMocks.getSession).toHaveBeenCalledOnce()
    expect(authorizationMocks.listAllGrantedCapabilities).toHaveBeenCalledOnce()
    expect(events).toEqual([
      expect.objectContaining({
        event: "authorization.request",
        grantReads: 1,
        outcome: "allowed",
        sessionReads: 1,
      }),
    ])
  })

  it("rejects a capability removed before the next request", async () => {
    authorizationMocks.listAllGrantedCapabilities
      .mockResolvedValueOnce(["operations.dashboard.read"])
      .mockResolvedValueOnce([])

    await expect(
      request("request-before-grant-revocation", () =>
        requireCapability("operations.dashboard.read", "/")
      )
    ).resolves.toMatchObject({ user: { id: "user-1" } })

    await expect(
      request("request-after-grant-revocation", () =>
        requireCapability("operations.dashboard.read", "/")
      )
    ).rejects.toThrow("redirect:/unauthorized")

    expect(authorizationMocks.getSession).toHaveBeenCalledTimes(2)
    expect(authorizationMocks.listAllGrantedCapabilities).toHaveBeenCalledTimes(
      2
    )
  })

  it("rejects a session revoked before the next request", async () => {
    authorizationMocks.getSession
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(null)

    await expect(
      request("request-before-session-revocation", () =>
        requireCapability("operations.dashboard.read", "/")
      )
    ).resolves.toMatchObject({ user: { id: "user-1" } })

    await expect(
      request("request-after-session-revocation", () =>
        requireCapability("operations.dashboard.read", "/dashboard")
      )
    ).rejects.toThrow("redirect:/sign-in?next=%2Fdashboard")

    expect(authorizationMocks.getSession).toHaveBeenCalledTimes(2)
    expect(authorizationMocks.listAllGrantedCapabilities).toHaveBeenCalledOnce()
  })
})
