import { afterEach, expect, test, vi } from "vitest"
import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"

afterEach(() => vi.useRealTimers())

function inputFor(good: number) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-21T06:00:00Z"))
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt: "2026-09-20T06:00:00Z" })
  return {
    workbookName: "PostgreSQL", productionFloorCode: "cnc" as const,
    productionEntries: [{ jobCard: "A", partCode: "M5551", setupNo: "1", machine: "CNC-1", machineType: "CNC", operatorId: "OP", prodDate: "2026-09-20", outputQty: good, actualQty: good, rejectQty: 0, targetQty: 10_000 }],
    dataEntries: [
      entry("work_order", { jcNo: "A", partCode: "M5551", optionNumber: "1", orderPcs: 10_000, rmInwardDate: "2026-09-20", rmInwardKg: 1 }),
      ...["1", "2"].flatMap(setupNo => [
        entry("route", { partNo: "M5551", optionNumber: "1", setupNo, machineType: "CNC", machineFamily: "JT" }),
        entry("cycle", { partNo: "M5551", optionNumber: "1", setupNo, cycleTime: setupNo === "1" ? 60 : 120 }),
      ]),
      entry("shop_floor_status", { jcNo: "A", partCode: "M5551", optionNumber: "1", setupNo: "1", machine: "CNC-1", stage: good === 10_000 ? "item_complete" : "operator_started", completedAt: "2026-09-20T06:00:00Z" }),
      ...["CNC-1", "CNC-2"].map(machineNo => entry("machine_master", { machineNo, machineType: "CNC", machineFamily: "JT", status: "Active" })),
    ],
    previousMachinePlanDetailRows: [{ jcNo: "A", partCode: "M5551", optionNumber: "1", setupNo: "2", routeMachine: "JT", machine: "CNC-2" }],
  }
}

test("returns a sequential compatible setup to its preceding machine without a shared tool", () => {
  const input = inputFor(10_000)
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt: "2026-09-19T06:00:00Z" })
  input.dataEntries.push(
    entry("work_order", { jcNo: "B", partCode: "OTHER", optionNumber: "1", orderPcs: 3_000, rmInwardDate: "2026-09-19", rmInwardKg: 1 }),
    entry("route", { partNo: "OTHER", optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "JT" }),
    entry("cycle", { partNo: "OTHER", optionNumber: "1", setupNo: "1", cycleTime: 60 }),
  )
  input.previousMachinePlanDetailRows.push({ jcNo: "B", partCode: "OTHER", optionNumber: "1", setupNo: "1", routeMachine: "JT", machine: "CNC-1" })
  const rows = buildLegacyDashboardSnapshot(input).productionControl.machinePlanDetailRows
  expect(rows.find(row => row.setupNo === "2")).toMatchObject({
    machine: "CNC-1", machineAssignment: "Same-part machine continuity", physicalWipQty: 10_000,
  })
  expect(rows.find(row => row.jcNo === "B")?.machine).toBe("CNC-2")
  const repeated = buildLegacyDashboardSnapshot({ ...input, previousMachinePlanDetailRows: rows }).productionControl.machinePlanDetailRows
  expect(repeated.find(row => row.setupNo === "2")?.machine).toBe("CNC-1")
})

test("keeps a WIP-ready second setup on another machine when overlap finishes earlier", () => {
  const rows = buildLegacyDashboardSnapshot(inputFor(3_000)).productionControl.machinePlanDetailRows
  const first = rows.find(row => row.setupNo === "1")!
  const second = rows.find(row => row.setupNo === "2")!
  expect(first).toMatchObject({ machine: "CNC-1", runningStatus: "Running" })
  expect(second.machine).toBe("CNC-2")
  expect(new Date(String(second.plannedProductionStartDate)).getTime()).toBeLessThan(new Date(String(first.plannedProductionEndDate)).getTime())
})

test("keeps matching work next when completing a setup releases the next route step", () => {
  const input = inputFor(10_000)
  vi.setSystemTime(new Date("2026-09-24T06:00:00Z"))
  input.productionEntries[0] = { ...input.productionEntries[0]!, prodDate: "2026-09-24", outputQty: 1_064, actualQty: 1_064 }
  for (const row of input.dataEntries) {
    if (row.entryType === "work_order") row.payload.orderPcs = 1_064
    if (row.entryType === "cycle") row.payload.cycleTime = row.payload.setupNo === "1" ? 70 : 55
    if (row.entryType === "shop_floor_status") row.payload.completedAt = "2026-09-24T01:40:00Z"
  }
  input.previousMachinePlanDetailRows[0]!.machine = "CNC-1"
  input.dataEntries = input.dataEntries.filter(row => row.entryType !== "machine_master" || row.payload.machineNo === "CNC-1")
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt: "2026-09-20T06:00:00Z" })
  input.dataEntries.push(
    entry("work_order", { jcNo: "B", partCode: "M5551", optionNumber: "1", orderPcs: 1_100, rmInwardDate: "2026-09-20", rmInwardKg: 1 }),
    entry("tooling_availability", { assetCode: "F1", totalQuantity: 1, storeQuantity: 0, allocatedQuantity: 1 }),
    ...["1", "2"].map(setupNo => entry("tooling", { partNo: "M5551", optionNumber: "1", setupNo, fixture: "F1" })),
  )
  input.previousMachinePlanDetailRows.push({ jcNo: "B", partCode: "M5551", optionNumber: "1", setupNo: "1", routeMachine: "JT", machine: "CNC-1" })
  const rows = buildLegacyDashboardSnapshot(input).productionControl.machinePlanDetailRows
  const next = rows.filter(row => row.machine === "CNC-1" && row.runningStatus === "Planned")
    .sort((a, b) => new Date(String(a.plannedProductionStartDate)).getTime() - new Date(String(b.plannedProductionStartDate)).getTime())[0]
  expect(next).toMatchObject({ jcNo: "B", setupNo: "1", plannedProductionStartDate: "24-Sept-26", shopFloorTaskReady: true })
  const repeated = buildLegacyDashboardSnapshot({ ...input, previousMachinePlanDetailRows: rows }).productionControl.machinePlanDetailRows
  expect(repeated.find(row => row.jcNo === "B" && row.setupNo === "1"))
    .toMatchObject({ machine: "CNC-1", plannedProductionStartDate: "24-Sept-26", shopFloorTaskReady: true })
})
