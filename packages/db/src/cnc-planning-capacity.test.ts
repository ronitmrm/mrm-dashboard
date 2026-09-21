import { afterEach, expect, test, vi } from "vitest"

import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"

afterEach(() => {
  vi.useRealTimers()
})

test("uses 22.5 productive hours per day only for CNC-01 cycle-based planning", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-21T05:00:00.000Z"))

  const createdAt = "2026-09-21T05:00:00.000Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({
    entryType,
    payload,
    createdAt,
  })
  const planFor = (productionFloorCode: "cnc" | "conventional") => {
    const input = {
      productionFloorCode,
      workbookName: "PostgreSQL",
      productionEntries: [],
      dataEntries: [
        entry("work_order", {
          jcNo: "CAPACITY-CHECK",
          partCode: "CAPACITY-PART",
          optionNumber: "1",
          orderPcs: 200,
          rmInwardDate: "2026-09-21",
          rmInwardKg: 1,
        }),
        entry("route", {
          partNo: "CAPACITY-PART",
          optionNumber: "1",
          setupNo: "1",
          machineType: "CNC",
          machineFamily: "CAPACITY-FAMILY",
        }),
        entry("cycle", {
          partNo: "CAPACITY-PART",
          optionNumber: "1",
          setupNo: "1",
          cycleTime: 288,
        }),
        entry("tooling", {
          partNo: "CAPACITY-PART",
          optionNumber: "1",
          setupNo: "1",
        }),
        entry("machine_master", {
          machineNo: "CAPACITY-01",
          machineType: "CNC",
          machineFamily: "CAPACITY-FAMILY",
          status: "Active",
        }),
      ],
    }
    const control = buildLegacyDashboardSnapshot(input).productionControl
    if (!("machinePlanDetailRows" in control)) throw new Error("Missing plan")
    return control.machinePlanDetailRows.find(
      (row) => row.jcNo === "CAPACITY-CHECK"
    )
  }

  expect(planFor("cnc")).toMatchObject({
    plannedProductionStartDate: "21-Sept-26",
    plannedProductionEndDate: "21-Sept-26",
    planningAssumption: expect.stringContaining("22.5 hrs/day"),
  })
  expect(planFor("conventional")).toMatchObject({
    plannedProductionStartDate: "21-Sept-26",
    plannedProductionEndDate: "22-Sept-26",
    planningAssumption: expect.stringContaining("8 hrs/day"),
  })
})
