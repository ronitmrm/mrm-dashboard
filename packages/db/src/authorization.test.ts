import type { Pool } from "pg"
import { describe, expect, test, vi } from "vitest"

import { createAuthorizationRepository } from "./authorization"

describe("authorization repository", () => {
  test("checks many capabilities with one PostgreSQL query", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ key: "operations.dashboard.read" }],
    })
    const repository = createAuthorizationRepository({
      pool: { query } as unknown as Pool,
    })

    await expect(
      repository.listGrantedCapabilities("user-1", [
        "operations.dashboard.read",
        "hr.recruitment.read",
      ])
    ).resolves.toEqual(["operations.dashboard.read"])
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]?.[1]).toEqual([
      "user-1",
      ["operations.dashboard.read", "hr.recruitment.read"],
    ])
  })

  test("does not query PostgreSQL for an empty capability list", async () => {
    const query = vi.fn()
    const repository = createAuthorizationRepository({
      pool: { query } as unknown as Pool,
    })

    await expect(
      repository.listGrantedCapabilities("user-1", [])
    ).resolves.toEqual([])
    expect(query).not.toHaveBeenCalled()
  })

  test("loads every granted capability with one PostgreSQL query", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { key: "pricing.products.read" },
        { key: "pricing.design.read" },
      ],
    })
    const repository = createAuthorizationRepository({
      pool: { query } as unknown as Pool,
    })

    await expect(
      repository.listAllGrantedCapabilities("user-1")
    ).resolves.toEqual(["pricing.products.read", "pricing.design.read"])
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]?.[1]).toEqual(["user-1"])
  })
})
