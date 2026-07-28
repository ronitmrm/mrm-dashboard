import { describe, expect, test, vi } from "vitest"

import { createAuthorizationGrantCache } from "./authorization-grant-cache"

describe("authorization grant cache", () => {
  test("shares one permission load across concurrent and repeated navigation", async () => {
    let now = 1_000
    const load = vi
      .fn()
      .mockResolvedValue(["pricing.products.read", "pricing.design.read"])
    const grants = createAuthorizationGrantCache({
      load,
      now: () => now,
      ttlMs: 60_000,
    })

    const [first, second] = await Promise.all([
      grants.get("user-1"),
      grants.get("user-1"),
    ])
    const repeated = await grants.get("user-1")

    expect([...first]).toEqual([
      "pricing.products.read",
      "pricing.design.read",
    ])
    expect(second).toBe(first)
    expect(repeated).toBe(first)
    expect(load).toHaveBeenCalledTimes(1)

    now += 60_001
    await grants.get("user-1")
    expect(load).toHaveBeenCalledTimes(2)
  })

  test("invalidates a changed user's cached permissions immediately", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(["pricing.products.read"])
      .mockResolvedValueOnce([])
    const grants = createAuthorizationGrantCache({ load })

    await expect(grants.get("user-1")).resolves.toEqual(
      new Set(["pricing.products.read"])
    )
    grants.invalidate("user-1")
    await expect(grants.get("user-1")).resolves.toEqual(new Set())
    expect(load).toHaveBeenCalledTimes(2)
  })
})
