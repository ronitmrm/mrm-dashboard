import { afterEach, expect, test, vi } from "vitest"
import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"

afterEach(() => vi.useRealTimers())

test("uses cycle capacity for shortfalls and surpluses in setup and whole-job forecasts", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-22T05:00:00Z"))
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt: "2026-09-21T05:00:00Z" })
  const forecast = (good: number) => buildLegacyDashboardSnapshot({
    workbookName: "PostgreSQL", productionFloorCode: "cnc",
    productionEntries: [{ jobCard: "A", partCode: "PART", setupNo: "1", machine: "CNC-1", machineType: "CNC", operatorId: "OP", prodDate: "2026-09-21", outputQty: good, actualQty: good, rejectQty: 0, targetQty: 1_000 }],
    dataEntries: [
      entry("work_order", { jcNo: "A", partCode: "PART", optionNumber: "1", orderPcs: 10_000, rmInwardDate: "2026-09-21", rmInwardKg: 1 }),
      ...["1", "2"].flatMap(setupNo => [
        entry("route", { partNo: "PART", optionNumber: "1", setupNo, machineType: "CNC", machineFamily: "JT" }),
        entry("cycle", { partNo: "PART", optionNumber: "1", setupNo, cycleTime: setupNo === "1" ? 81 : 40.5 }),
      ]),
      entry("machine_master", { machineNo: "CNC-1", machineType: "CNC", machineFamily: "JT", status: "Active" }),
      entry("shop_floor_status", { jcNo: "A", partCode: "PART", optionNumber: "1", setupNo: "1", machine: "CNC-1", stage: "operator_started" }),
    ],
  }).productionControl
  const shortfall = forecast(500)
  const surplus = forecast(1_500)
  expect(shortfall.machinePlanDetailRows[0]).toMatchObject({ plannedProductionEndDate: "3-Oct-26", plannedProductionEndWorkingHours: 11.25 })
  expect(surplus.machinePlanDetailRows[0]).toMatchObject({ plannedProductionEndDate: "1-Oct-26", plannedProductionEndWorkingHours: 11.25 })
  const jobFinish = new Date(String(shortfall.productionDashboardRows[0]?.currentProbableDispatchDate)).getTime()
  expect(jobFinish).toBeGreaterThan(new Date("2026-10-03").getTime())
  expect(new Date(String(surplus.productionDashboardRows[0]?.currentProbableDispatchDate)).getTime()).toBeLessThan(jobFinish)
})
