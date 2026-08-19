import type { Pool } from "pg"
import { describe, expect, it, vi } from "vitest"

import { createUserDashboardRepository } from "./user-dashboard"

describe("user dashboard repository", () => {
  it("loads a user's saved card order", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ dashboard_widgets: ["store-stock", "production-dashboard"] }],
    })
    const repository = createUserDashboardRepository({
      pool: { query } as unknown as Pool,
    })

    await expect(repository.load("user-1")).resolves.toEqual([
      "store-stock",
      "production-dashboard",
    ])
  })

  it("saves an intentionally empty dashboard for the signed-in user", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] })
    const repository = createUserDashboardRepository({
      pool: { query } as unknown as Pool,
    })

    await repository.save("user-1", [])

    expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE identity.users"), [
      "user-1",
      [],
    ])
  })
})
