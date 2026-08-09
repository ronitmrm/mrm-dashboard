import { describe, expect, it } from "vitest"

import {
  dashboardStateRequestUrl,
  refreshLockHasSettled,
} from "./dashboard-live-state"

describe("dashboard live state", () => {
  it("preserves the floor while sending the latest known version", () => {
    expect(
      dashboardStateRequestUrl("/api/dashboard-state?floor=cnc", {
        dashboard: { productionFloorCode: "cnc", readModelVersion: 42 },
      })
    ).toBe("/api/dashboard-state?floor=cnc&knownVersion=42")
  })

  it("does not reuse a version after switching floors", () => {
    expect(
      dashboardStateRequestUrl("/api/dashboard-state?floor=forging", {
        dashboard: { productionFloorCode: "cnc", readModelVersion: 42 },
      })
    ).toBe("/api/dashboard-state?floor=forging")
  })

  it("releases the refresh lock after the durable worker completes", () => {
    expect(
      refreshLockHasSettled(
        { baselineRequestedAtMs: 100, baselineCompletedAtMs: 100 },
        {
          status: "complete",
          isRefreshing: false,
          requestedAtMs: 200,
          completedAtMs: 300,
        }
      )
    ).toBe(true)
  })
})
