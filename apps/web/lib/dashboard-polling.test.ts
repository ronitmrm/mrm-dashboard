import { describe, expect, it } from "vitest"

import { nextDashboardPollDelay } from "./dashboard-polling"

describe("dashboard polling", () => {
  it("pauses polling while the dashboard browser tab is hidden", () => {
    expect(nextDashboardPollDelay(5_000, "hidden")).toBeNull()
  })

  it("uses the configured delay while the dashboard is visible", () => {
    expect(nextDashboardPollDelay(15_000, "visible")).toBe(15_000)
  })
})
