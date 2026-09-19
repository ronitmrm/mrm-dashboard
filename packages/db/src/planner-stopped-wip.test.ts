import { expect, test, vi } from "vitest"
import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"

test("replans stopped setup WIP above customer demand and refreshes the existing allocation", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-19T12:00:00Z"))
  const createdAt = "2026-09-19T06:00:00Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const input: Parameters<typeof buildLegacyDashboardSnapshot>[0] = {
    workbookName: "PostgreSQL",
    productionEntries: [
      { jobCard: "JC-WIP", partCode: "PART", setupNo: "1", machine: "CNC-02", machineType: "CNC", operatorId: "OP", prodDate: "2026-09-19", outputQty: 7313, actualQty: 7313, rejectQty: 0, targetQty: 6000 },
      { jobCard: "JC-WIP", partCode: "PART", setupNo: "2", machine: "CNC-01", machineType: "CNC", operatorId: "OP", prodDate: "2026-09-19", outputQty: 6085, actualQty: 6085, rejectQty: 0, targetQty: 6000 },
    ],
    planOverrides: [{ jobCardNumber: "JC-WIP", setupNumber: 2, fromMachineNumber: "CNC-01", toMachineNumber: "CNC-03", status: "Active", createdAt,
      interruptedSetups: [{ jobCardNumber: "JC-WIP", setupNumber: 2, machineNumber: "CNC-01", finishedQuantity: 6085 }],
      reason: "Planner stop", }],
    dataEntries: [
      entry("work_order", { jcNo: "JC-WIP", partCode: "PART", optionNumber: "1", orderPcs: 6000, rmInwardDate: "2026-09-18", rmInwardKg: 100 }),
      ...["1", "2"].flatMap((setupNo) => [
        entry("route", { partNo: "PART", optionNumber: "1", setupNo, machineType: "CNC", machineFamily: setupNo === "1" ? "UP" : "DOWN" }),
        entry("cycle", { partNo: "PART", optionNumber: "1", setupNo, cycleTime: 60 }),
        entry("tooling", { partNo: "PART", optionNumber: "1", setupNo }),
      ]),
      ...["CNC-01", "CNC-02", "CNC-03"].map((machineNo) => entry("machine_master", { machineNo, machineType: "CNC", machineFamily: machineNo === "CNC-02" ? "UP" : "DOWN", status: "Active" })),
      entry("shop_floor_status", { jcNo: "JC-WIP", partCode: "PART", optionNumber: "1", setupNo: "1", machine: "CNC-02", stage: "operator_started" }),
      entry("shop_floor_status", { jcNo: "JC-WIP", partCode: "PART", optionNumber: "1", setupNo: "2", machine: "CNC-01", stage: "planned" }),
    ],
  }
  try {
    const control = buildLegacyDashboardSnapshot(input).productionControl!
    if (!("machinePlanDetailRows" in control)) throw new Error("Missing plan")
    const downstream = control.machinePlanDetailRows.filter((row) => row.setupNo === "2")
    expect(downstream.reduce((sum, row) => sum + Number(row.pendingGoodQty), 0)).toBe(1228)
    expect(downstream.find((row) => row.machine === "CNC-01")).toMatchObject({ rawActualQty: 6085, runningStatus: "Planner stopped", shopFloorStage: "planned" })
    expect(downstream.find((row) => row.machine === "CNC-03")).toMatchObject({ pendingGoodQty: 1228 })
    expect(downstream[0]).toMatchObject({ customerOrderPcs: 6000, customerOrderRemainingQty: 0, physicalWipQty: 1228 })
    input.productionEntries.push(
      { ...input.productionEntries[0]!, outputQty: 200, actualQty: 200 },
      { ...input.productionEntries[1]!, machine: "CNC-03", outputQty: 120, actualQty: 100, rejectQty: 20 },
    )
    input.previousMachinePlanDetailRows = control.machinePlanDetailRows
    const refreshed = buildLegacyDashboardSnapshot(input).productionControl!
    if (!("machinePlanDetailRows" in refreshed)) throw new Error("Missing plan")
    const refreshedDownstream = refreshed.machinePlanDetailRows.filter((row) => row.setupNo === "2")
    expect(refreshedDownstream).toHaveLength(2)
    expect(refreshedDownstream.reduce((sum, row) => sum + Number(row.pendingGoodQty), 0)).toBe(1308)
    expect(refreshedDownstream.find((row) => row.machine === "CNC-01")).toMatchObject({ planOverrideRemainingQty: 1308 })
    expect(refreshed.workOrders[0]).toMatchObject({ orderPcs: 6000, finalSetupGoodPieces: 6185 })
  } finally {
    vi.useRealTimers()
  }
})
