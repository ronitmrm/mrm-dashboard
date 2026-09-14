import { describe, expect, it, vi } from "vitest"

import { buildCanonicalDashboardReadModel, dashboardDataEntriesForFloor } from "./dashboard-read-model"
import { productionFloors } from "./production-floors"

describe("dashboard data-entry floor scope", () => {
  it("reads saved setup names into the owning unit's master table", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{
      source_id: "setup-1",
      source_payload: { setupName: "Facing" },
      changed_at: "2026-09-14T07:00:00Z",
      source_kind: "data_entry",
      source_group: "dataEntries",
      entry_type: "setup_name_master",
      production_floor_code: "cnc",
      available: 1,
    }] }).mockResolvedValue({ rows: [] })
    const { payload } = await buildCanonicalDashboardReadModel({ query }, { organizationId: "org-1" })
    expect(JSON.parse(query.mock.calls[0]![1][1])).toContainEqual({
      category: "setup_name_master", floor_code: "cnc", row_limit: 1000,
    })
    expect(payload.productionFloorSnapshots).toMatchObject({
      cnc: { productionControl: { setupNameMasterRows: [expect.objectContaining({
        _id: "setup-1", setupName: "Facing", productionFloorCode: "cnc",
      })] } },
    })
    expect(payload).not.toHaveProperty("productionFloorSnapshots.conventional.productionControl.setupNameMasterRows.0")
  })
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
