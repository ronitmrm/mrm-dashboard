import { expect, test } from "vitest"
import { simulateUrgentDelivery } from "./urgent-delivery"
import {
  buildLegacyDashboardSnapshot,
  buildProductionPlanningControl,
  type LegacyDashboardInput,
} from "./legacy-dashboard-analysis"

const now = Date.parse("2026-11-04T05:00:00Z")
const entry = (entryType: string, payload: Record<string, unknown>) => ({
  entryType,
  payload,
  createdAt: "2026-11-01T05:00:00Z",
})
const source = (machineCount = 3): LegacyDashboardInput => ({
  productionFloorCode: "cnc",
  workbookName: "test",
  productionEntries: [],
  dataEntries: [
    entry("work_order", {
      jcNo: "URGENT-JC",
      partCode: "PART",
      optionNumber: "1",
      orderPcs: 10_000,
      rmInwardDate: "2026-11-01",
      rmInwardKg: 100,
    }),
    entry("route", {
      partNo: "PART",
      optionNumber: "1",
      setupNo: "1",
      machineType: "CNC",
      machineFamily: "FAMILY",
    }),
    entry("cycle", {
      partNo: "PART",
      optionNumber: "1",
      setupNo: "1",
      cycleTime: 60,
    }),
    entry("tooling", { partNo: "PART", optionNumber: "1", setupNo: "1" }),
    ...Array.from({ length: machineCount }, (_, i) =>
      entry("machine_master", {
        machineNo: `CNC-${i + 1}`,
        machineType: "CNC",
        machineFamily: "FAMILY",
        status: "Active",
      })
    ),
  ],
})

test("planning-only calculation preserves the published production schedule and current finish", () => {
  const input = source()
  const canonical = buildLegacyDashboardSnapshot(input, {
    calculationTime: now,
  }).productionControl
  const planning = buildProductionPlanningControl(input, now)
  expect(planning.machinePlanDetailRows).toEqual(
    canonical.machinePlanDetailRows
  )
  expect(planning.productionDashboardRows).toEqual(
    canonical.productionDashboardRows
  )
})

test("simulates multiple parallel machines without changing source facts and binds approval to workload", () => {
  const input = source(),
    before = JSON.stringify(input)
  const plan = simulateUrgentDelivery(
    input,
    { jobCardNumber: "URGENT-JC", preferredDate: "2026-11-07" },
    now
  )
  expect(plan.blockers).toEqual([])
  expect(plan.currentFinish).toBeTruthy()
  expect(plan.proposedFinish < plan.currentFinish).toBe(true)
  expect(plan.meetsDate).toBe(true)
  expect(
    plan.actions.filter(
      (action) => action.assignmentMode === "add_parallel_machine"
    )
  ).toHaveLength(2)
  expect(new Set(plan.machines.map((row) => row.machine)).size).toBe(3)
  expect(JSON.stringify(input)).toBe(before)
  expect(
    simulateUrgentDelivery(
      input,
      { jobCardNumber: "URGENT-JC", preferredDate: "2026-11-07" },
      now + 1000
    ).fingerprint
  ).toBe(plan.fingerprint)
  input.updatedAt = "2026-11-04T06:00:00Z"
  expect(
    simulateUrgentDelivery(
      input,
      { jobCardNumber: "URGENT-JC", preferredDate: "2026-11-07" },
      now
    ).fingerprint
  ).not.toBe(plan.fingerprint)
})

test("keeps recorded production, reports an unattained date and blocks missing material", () => {
  const input = source(1)
  input.productionEntries = [
    {
      jobCard: "URGENT-JC",
      partCode: "PART",
      setupNo: "1",
      machine: "CNC-1",
      machineType: "CNC",
      operatorId: "OP",
      prodDate: "2026-11-03",
      outputQty: 1000,
      actualQty: 1000,
      rejectQty: 0,
      targetQty: 1000,
    },
  ]
  const plan = simulateUrgentDelivery(
    input,
    { jobCardNumber: "URGENT-JC", preferredDate: "2026-11-04" },
    now
  )
  expect(plan.meetsDate).toBe(false)
  expect(plan.remainingQuantity).toBe(9000)
  expect(plan.machines[0]?.remaining).toBe(9000)
  expect(plan.actions).toEqual([])
  const waiting = source()
  waiting.dataEntries![0] = entry("work_order", {
    jcNo: "URGENT-JC",
    partCode: "PART",
    optionNumber: "1",
    orderPcs: 10_000,
  })
  expect(
    simulateUrgentDelivery(
      waiting,
      { jobCardNumber: "URGENT-JC", preferredDate: "2026-11-07" },
      now
    ).blockers.join(" ")
  ).toContain("Raw material")
})

test("does not make changes when the current plan already meets the preferred date", () => {
  const plan = simulateUrgentDelivery(
    source(),
    { jobCardNumber: "URGENT-JC", preferredDate: "2026-12-30" },
    now
  )
  expect(plan.meetsDate).toBe(true)
  expect(plan.actions).toEqual([])
  expect(plan.priorityChange).toBe(false)
})

test("respects tooling allocations when evaluating parallel machines", () => {
  const input = source()
  input.dataEntries = input.dataEntries!.filter(
    (row) => row.entryType !== "tooling"
  )
  input.dataEntries.push(
    entry("tooling", {
      partNo: "PART",
      optionNumber: "1",
      setupNo: "1",
      fixture: "FIX-1",
    }),
    entry("tooling_availability", {
      assetCode: "FIX-1",
      allocatedQuantity: 1,
      totalQuantity: 1,
      occupiedQuantity: 0,
    })
  )
  const plan = simulateUrgentDelivery(
    input,
    { jobCardNumber: "URGENT-JC", preferredDate: "2026-11-07" },
    now
  )
  expect(
    plan.actions.filter(
      (action) => action.assignmentMode === "add_parallel_machine"
    )
  ).toEqual([])
  expect(plan.meetsDate).toBe(false)
})

test("shows revised finish dates for jobs displaced by the proposed queue change", () => {
  const input = source(1)
  input.dataEntries!.push(
    entry("work_order", {
      jcNo: "EARLIER-JC",
      partCode: "PART",
      optionNumber: "1",
      orderPcs: 5000,
      deliveryDate: "2026-11-04",
      rmInwardDate: "2026-10-01",
      rmInwardKg: 100,
    })
  )
  const plan = simulateUrgentDelivery(
    input,
    { jobCardNumber: "URGENT-JC", preferredDate: "2026-11-04" },
    now
  )
  expect(plan.priorityChange).toBe(true)
  expect(plan.impacts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ jobCardNumber: "EARLIER-JC" }),
    ])
  )
  const impact = plan.impacts.find((row) => row.jobCardNumber === "EARLIER-JC")!
  expect(impact.proposedFinish > impact.currentFinish).toBe(true)
})
