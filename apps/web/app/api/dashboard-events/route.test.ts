import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const eventMocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  listener: undefined as
    | ((invalidation: {
        organizationId: string
        topic: string
        version: number
      }) => void)
    | undefined,
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock("@workspace/runtime", () => ({
  subscribeRedisInvalidations: eventMocks.subscribe,
}))

vi.mock("@/lib/auth/auth", () => ({
  readAuthEnvironment: () => ({ redisUrl: "redis://localhost:6380" }),
}))

vi.mock("@/lib/postgres-dashboard-read-server", () => ({
  authorizePostgresDashboardEvents: eventMocks.authorize,
  DashboardReadError: class DashboardReadError extends Error {
    status = 500
  },
}))

import { GET } from "./route"

describe("dashboard events stream", () => {
  beforeEach(() => {
    eventMocks.authorize.mockReset()
    eventMocks.listener = undefined
    eventMocks.subscribe.mockReset()
    eventMocks.unsubscribe.mockReset()
    eventMocks.authorize.mockResolvedValue({ organizationId: "org-1" })
    eventMocks.subscribe.mockImplementation(
      async (
        _redisUrl: string,
        listener: NonNullable<typeof eventMocks.listener>
      ) => {
        eventMocks.listener = listener
        return eventMocks.unsubscribe
      }
    )
  })

  it("streams only authorized dashboard version hints and cleans up", async () => {
    const abort = new AbortController()
    const response = await GET(
      new NextRequest("http://localhost/api/dashboard-events", {
        signal: abort.signal,
      })
    )
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    expect(response.headers.get("content-type")).toBe("text/event-stream")
    expect(decoder.decode((await reader.read()).value)).toBe("retry: 3000\n\n")

    eventMocks.listener?.({
      organizationId: "another-org",
      topic: "dashboard.read_model.updated",
      version: 8,
    })
    eventMocks.listener?.({
      organizationId: "org-1",
      topic: "dashboard.read_model.updated",
      version: 9,
    })
    expect(decoder.decode((await reader.read()).value)).toBe(
      'event: dashboard-version\ndata: {"version":9}\n\n'
    )

    abort.abort()
    await vi.waitFor(() =>
      expect(eventMocks.unsubscribe).toHaveBeenCalledOnce()
    )
  })
})
