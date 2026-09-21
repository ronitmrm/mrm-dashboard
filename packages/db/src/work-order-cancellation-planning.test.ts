import { afterEach, expect, test, vi } from "vitest"

import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"

afterEach(() => {
  vi.useRealTimers()
})

test("keeps cancelled work orders in the register and removes them from active planning", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-21T05:00:00.000Z"))

  const createdAt = "2026-09-21T05:00:00.000Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({
    entryType,
    payload,
    createdAt,
  })
  const workOrder = (
    jcNo: string,
    status: "Open" | "Cancelled",
    cancellationReason?: string
  ) => entry("work_order", {
    jcNo,
    partCode: "CANCEL-PART",
    optionNumber: "1",
    orderKg: 100,
    orderPcs: 9_900,
    status,
    cancellationReason,
    cancelledAt: status === "Cancelled" ? createdAt : undefined,
  })

  const control = buildLegacyDashboardSnapshot({
    productionFloorCode: "cnc",
    workbookName: "PostgreSQL",
    productionEntries: [],
    dataEntries: [
      workOrder("ACTIVE-JC", "Open"),
      workOrder("CANCELLED-JC", "Cancelled", "Customer cancelled line"),
      entry("rm_inward", {
        jcNo: "ACTIVE-JC",
        partCode: "CANCEL-PART",
        rmInwardDate: "2026-09-21",
        rmInwardKg: 100,
      }),
      entry("rm_inward", {
        jcNo: "CANCELLED-JC",
        partCode: "CANCEL-PART",
        rmInwardDate: "2026-09-21",
        rmInwardKg: 100,
      }),
      entry("route", {
        partNo: "CANCEL-PART",
        optionNumber: "1",
        setupNo: "1",
        machineType: "CNC",
        machineFamily: "CANCEL-FAMILY",
      }),
      entry("cycle", {
        partNo: "CANCEL-PART",
        optionNumber: "1",
        setupNo: "1",
        cycleTime: 180,
      }),
      entry("tooling", {
        partNo: "CANCEL-PART",
        optionNumber: "1",
        setupNo: "1",
      }),
      entry("machine_master", {
        machineNo: "CNC-CANCEL-1",
        machineType: "CNC",
        machineFamily: "CANCEL-FAMILY",
        status: "Active",
      }),
    ],
  }).productionControl

  if (!("workOrderRegisterRows" in control)) throw new Error("Missing register")

  expect(control.workOrderRegisterRows).toEqual(expect.arrayContaining([
    expect.objectContaining({
      jcNo: "CANCELLED-JC",
      status: "Cancelled",
      cancellationReason: "Customer cancelled line",
    }),
  ]))
  expect(control.workOrders.map((row) => row.jcNo)).toEqual(["ACTIVE-JC"])
  expect(control.machinePlanDetailRows.some(
    (row) => row.jcNo === "CANCELLED-JC"
  )).toBe(false)
  expect(control.productionDashboardRows.some(
    (row) => row.jcNo === "CANCELLED-JC"
  )).toBe(false)
  expect(control.summary).toMatchObject({
    workOrders: 1,
    cancelledWorkOrders: 1,
  })
})
