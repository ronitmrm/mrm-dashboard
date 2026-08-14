import { beforeEach, describe, expect, it, vi } from "vitest"

const redisMock = vi.hoisted(() => {
  const clients: Array<{
    close: ReturnType<typeof vi.fn>
    connect: ReturnType<typeof vi.fn>
    emit: (payload: string) => void
    subscribe: ReturnType<typeof vi.fn>
    unsubscribe: ReturnType<typeof vi.fn>
  }> = []
  return { clients }
})

vi.mock("redis", () => ({
  createClient: () => {
    let callback: ((payload: string) => void) | undefined
    const client = {
      close: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      emit: (payload: string) => callback?.(payload),
      on: vi.fn(),
      subscribe: vi
        .fn()
        .mockImplementation(
          async (_channel: string, next: (payload: string) => void) => {
            callback = next
          }
        ),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    }
    redisMock.clients.push(client)
    return client
  },
}))

import { subscribeRedisInvalidations } from "./redis-invalidation-subscriber"

describe("shared Redis invalidation subscriber", () => {
  beforeEach(() => {
    redisMock.clients.length = 0
  })

  it("shares one Redis connection and closes it after the last listener", async () => {
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = await subscribeRedisInvalidations(
      "redis://localhost:6380",
      first
    )
    const unsubscribeSecond = await subscribeRedisInvalidations(
      "redis://localhost:6380",
      second
    )

    expect(redisMock.clients).toHaveLength(1)
    redisMock.clients[0]!.emit(
      JSON.stringify({ organizationId: "org-1", topic: "dashboard.updated" })
    )
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)

    await unsubscribeFirst()
    expect(redisMock.clients[0]!.close).not.toHaveBeenCalled()
    await unsubscribeSecond()
    expect(redisMock.clients[0]!.unsubscribe).toHaveBeenCalledWith(
      "mrm:invalidations"
    )
    expect(redisMock.clients[0]!.close).toHaveBeenCalledTimes(1)
  })
})
