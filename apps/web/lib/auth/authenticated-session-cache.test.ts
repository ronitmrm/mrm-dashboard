import { describe, expect, test, vi } from "vitest"

import { createAuthenticatedSessionCache } from "./authenticated-session-cache"

describe("authenticated session cache", () => {
  test("reuses a validated session across warm submodule navigation", async () => {
    let now = 1_000
    const load = vi.fn().mockResolvedValue({
      session: { id: "session-1" },
      user: { id: "user-1" },
    })
    const sessions = createAuthenticatedSessionCache({
      load,
      now: () => now,
      ttlMs: 60_000,
    })

    const first = await sessions.get("signed-cookie-digest")
    const repeated = await sessions.get("signed-cookie-digest")

    expect(repeated).toBe(first)
    expect(load).toHaveBeenCalledTimes(1)

    now += 60_001
    await sessions.get("signed-cookie-digest")
    expect(load).toHaveBeenCalledTimes(2)
  })

  test("does not share sessions between different signed cookies", async () => {
    const load = vi.fn(async (key: string) => ({ key }))
    const sessions = createAuthenticatedSessionCache({ load })

    await sessions.get("cookie-a")
    await sessions.get("cookie-b")

    expect(load).toHaveBeenCalledTimes(2)
  })
})
