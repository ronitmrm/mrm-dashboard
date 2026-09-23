import { expect, test, vi } from "vitest"
import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"

test("department tooling capacity sequences shared resources and refreshes after allocation or release", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-21T06:00:00Z"))
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt: "2026-09-21T05:00:00Z" })
  const allocation = { assetCode: "F1", totalQuantity: 5, storeQuantity: 4, allocatedQuantity: 1 }
  const state = { jcNo: "A", partCode: "PART", optionNumber: "1", setupNo: "1", machine: "CNC-01", stage: "operator_started" }
  const input: Parameters<typeof buildLegacyDashboardSnapshot>[0] = {
    workbookName: "PostgreSQL", productionEntries: [],
    dataEntries: [
      entry("tooling_availability", allocation),
      entry("shop_floor_status", state),
      ...["A", "B"].map(jcNo => entry("work_order", { jcNo, partCode: "PART", optionNumber: "1", orderPcs: 10000, rmInwardDate: "2026-09-21", rmInwardKg: 100 })),
      entry("route", { partNo: "PART", optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "FAMILY" }),
      entry("cycle", { partNo: "PART", optionNumber: "1", setupNo: "1", cycleTime: 60 }),
      entry("tooling", { partNo: "PART", optionNumber: "1", setupNo: "1", fixture: "F1" }),
      ...["CNC-01", "CNC-02"].map(machineNo => entry("machine_master", { machineNo, machineType: "CNC", machineFamily: "FAMILY", status: "Active" })),
    ],
  }
  const plans = () => {
    const control = buildLegacyDashboardSnapshot(input).productionControl!
    if (!("machinePlanDetailRows" in control)) throw new Error("Missing plan")
    return control.machinePlanDetailRows
  }
  try {
    const rows = plans()
    const first = rows.find(row => row.jcNo === "A" && row.setupNo === "1")!
    const second = rows.find(row => row.jcNo === "B" && row.setupNo === "1")!
    expect(second.machine).toBe("CNC-01")
    expect(second.machineAssignment).toBe("Same-part machine continuity")
    expect(second.toolingPlanStatus).toContain("Waiting for tooling release")
    expect(second.toolingAvailability).toContain("5 usable total / 4 in Store / 1 allocated / 1 occupied / 0 free")
    const day = (value: unknown) => new Date(String(value)).getTime()
    expect(day(second.plannedProductionStartDate)).toBeGreaterThan(day(first.plannedProductionEndDate))
    const waiting = rows.filter(row => row.jcNo === "B")
    expect(waiting.every(row => row.shopFloorTaskReady === false)).toBe(true)
    allocation.allocatedQuantity = 2
    allocation.storeQuantity = 3
    expect(plans().find(row => row.jcNo === "B")?.machine).toBe("CNC-02")
    expect(plans().every(row => !String(row.toolingPlanStatus).includes("Waiting for tooling release"))).toBe(true)
    state.stage = "planned"
    allocation.allocatedQuantity = 1
    expect(plans().every(row => !String(row.toolingPlanStatus).includes("Waiting for tooling release"))).toBe(true)
    allocation.allocatedQuantity = 0
    expect(plans().every(row => row.plannedProductionStartDate === "" && row.shopFloorTaskReady === false)).toBe(true)
    // An old stop must not reset the later workflow or release its tooling twice.
    allocation.allocatedQuantity = 1
    state.stage = "operator_started"
    input.planOverrides = [{ jobCardNumber: "B", setupNumber: 1, fromMachineNumber: "CNC-02", toMachineNumber: "CNC-01",
      status: "Active", createdAt: "2026-09-20T05:00:00Z", interruptedSetups: [
        { jobCardNumber: "A", setupNumber: 1, machineNumber: "CNC-01", finishedQuantity: 0 },
      ] }]
    expect(plans().find(row => row.jcNo === "A" && row.setupNo === "1")).toMatchObject({
      shopFloorStage: "operator_started", runningStatus: "Running",
    })
    state.stage = "item_complete"
    expect(plans().find(row => row.jcNo === "A" && row.setupNo === "1")).toMatchObject({
      shopFloorStage: "item_complete", runningStatus: "Complete",
    })
  } finally { vi.useRealTimers() }
})
