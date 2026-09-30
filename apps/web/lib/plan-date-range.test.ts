import { describe, expect, it } from "vitest"

import { planDateRange } from "./plan-date-range"

describe("planDateRange", () => {
  it("keeps a range across months", () => {
    expect(planDateRange("2026-09-15", "2026-10-07")).toEqual({
      from: "2026-09-15",
      to: "2026-10-07",
    })
  })

  it("rejects reversed dates", () => {
    const range = planDateRange("2026-10-07", "2026-09-15")
    expect(range.from <= range.to).toBe(true)
    expect(range).not.toEqual({ from: "2026-10-07", to: "2026-09-15" })
  })
})
