import { describe, expect, it } from "vitest"

import {
  hasProductionFloorAccess,
  productionFloorPageCapabilities,
  readableDashboardFloor,
} from "./production-floor-capabilities"

describe("production floor page capabilities", () => {
  it("keeps the same PPAC page independent for every production floor", () => {
    expect(
      productionFloorPageCapabilities.conventional.productionControlTab
    ).toBe("operations.floors.conventional.planner_actions.read")
    expect(
      productionFloorPageCapabilities["conventional-02"].productionControlTab
    ).toBe("operations.floors.conventional-02.planner_actions.read")
    expect(productionFloorPageCapabilities.cnc.productionControlTab).toBe(
      "operations.floors.cnc.planner_actions.read"
    )
    expect(productionFloorPageCapabilities.forging.productionControlTab).toBe(
      "operations.floors.forging.planner_actions.read"
    )
  })

  it("does not treat one floor grant as access to another floor", () => {
    const granted = new Set([
      productionFloorPageCapabilities.conventional.productionControlTab,
    ])

    expect(hasProductionFloorAccess(granted, "conventional")).toBe(true)
    expect(hasProductionFloorAccess(granted, "cnc")).toBe(false)
  })

  it("opens a company-wide dashboard on the Planner's readable floor", () => {
    const floorTabs = { cnc: ["productionControlTab"] } as const

    expect(readableDashboardFloor("conventional", floorTabs)).toBe("cnc")
    expect(readableDashboardFloor("cnc", floorTabs)).toBe("cnc")
  })
})
