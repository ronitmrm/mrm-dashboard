import { describe, expect, it } from "vitest"

import { dashboardDataEntriesForFloor } from "./dashboard-read-model"
import { productionFloors } from "./production-floors"

describe("dashboard data-entry floor scope", () => {
  it("shares universal checklists and maintenance schedules across all units without leaking unit masters", () => {
    const universal = ["setup_checklist_master", "maintenance_checklist_master", "maintenance_master"].map(
      (entryType) => ({ entryType, productionFloorCode: "conventional" })
    )
    for (const floor of productionFloors) {
      const unitRows = productionFloors.map(({ code }) => ({ entryType: "machine_master", productionFloorCode: code }))
      expect(dashboardDataEntriesForFloor([...universal, ...unitRows], floor.code)).toEqual([
        ...universal, ...unitRows.filter((row) => row.productionFloorCode === floor.code),
      ])
    }
  })
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
