import { describe, expect, it } from "vitest"

import { dashboardDataEntriesForFloor } from "./dashboard-read-model"

describe("dashboard data-entry floor scope", () => {
  it("includes company-wide quality codes in every production floor", () => {
    const rows = [
      {
        entryType: "rejection_type_master",
        productionFloorCode: "conventional",
        payload: { code: "RT-001" },
      },
      {
        entryType: "quality_parameter_master",
        productionFloorCode: "conventional",
        payload: { parameterName: "Diameter" },
      },
      {
        entryType: "route",
        productionFloorCode: "cnc",
        payload: { partNo: "M4" },
      },
    ]

    expect(dashboardDataEntriesForFloor(rows, "cnc")).toEqual([
      rows[0],
      rows[2],
    ])
  })
})
