import { describe, expect, it } from "vitest"

import { isPastOrTodayIstDate } from "./date-time"

describe("consumable use date", () => {
  it("accepts today and a past day", () => {
    expect(isPastOrTodayIstDate("2026-10-04", "2026-10-04")).toBe(true)
    expect(isPastOrTodayIstDate("2026-10-03", "2026-10-04")).toBe(true)
  })

  it("rejects future and invalid days", () => {
    expect(isPastOrTodayIstDate("2026-10-05", "2026-10-04")).toBe(false)
    expect(isPastOrTodayIstDate("2026-02-30", "2026-10-04")).toBe(false)
  })
})
