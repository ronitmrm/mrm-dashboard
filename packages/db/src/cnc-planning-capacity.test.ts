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

test("planner can add an idle parallel machine without stopping current machines", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-21T05:00:00.000Z"))

  const createdAt = "2026-09-21T05:00:00.000Z"
  const dataEntries = [
    {
      entryType: "work_order",
      payload: {
        jcNo: "PARALLEL-CHECK",
        partCode: "PARALLEL-PART",
        optionNumber: "1",
        orderPcs: 50_000,
        rmInwardDate: "2026-09-21",
        rmInwardKg: 1,
      },
      createdAt,
    },
    {
      entryType: "route",
      payload: {
        partNo: "PARALLEL-PART",
        optionNumber: "1",
        setupNo: "1",
        machineType: "CNC",
        machineFamily: "PARALLEL-FAMILY",
      },
      createdAt,
    },
    {
      entryType: "cycle",
      payload: {
        partNo: "PARALLEL-PART",
        optionNumber: "1",
        setupNo: "1",
        cycleTime: 60,
      },
      createdAt,
    },
    {
      entryType: "tooling",
      payload: {
        partNo: "PARALLEL-PART",
        optionNumber: "1",
        setupNo: "1",
      },
      createdAt,
    },
    ...["CNC-01", "CNC-02", "CNC-05"].map((machineNo) => ({
      entryType: "machine_master",
      payload: {
        machineNo,
        machineType: "CNC",
        machineFamily: "PARALLEL-FAMILY",
        status: "Active",
      },
      createdAt,
    })),
  ]
  const productionEntries = [
    { machine: "CNC-01", actualQty: 20_000 },
    { machine: "CNC-02", actualQty: 1_000 },
  ].map(({ machine, actualQty }) => ({
    jobCard: "PARALLEL-CHECK",
    partCode: "PARALLEL-PART",
    setupNo: "1",
    machine,
    machineType: "CNC",
    operatorId: "OP",
    prodDate: "2026-09-21",
    outputQty: actualQty,
    actualQty,
    rejectQty: 0,
    targetQty: 25_000,
  }))
  const plan = (planOverrides: Record<string, unknown>[] = []) =>
    buildLegacyDashboardSnapshot({
      productionFloorCode: "cnc",
      workbookName: "PostgreSQL",
      productionEntries,
      dataEntries,
      planOverrides,
    }).productionControl.machinePlanDetailRows.filter(
      (row) => row.jcNo === "PARALLEL-CHECK" && row.setupNo === "1"
    )

  expect(plan().map((row) => row.machine).sort()).toEqual(["CNC-01", "CNC-02"])

  const replanned = plan([{
    assignmentMode: "add_parallel_machine",
    target: "PARALLEL-CHECK",
    setupNo: "1",
    toMachine: "CNC-05",
    reason: "Use idle capacity",
    status: "Active",
    createdAt,
  }])

  expect(replanned.map((row) => row.machine).sort()).toEqual([
    "CNC-01",
    "CNC-02",
    "CNC-05",
  ])
  expect(replanned).toEqual(expect.arrayContaining([
    expect.objectContaining({
      machine: "CNC-05",
      machineAssignment: "Planner-added parallel machine",
      parallelMachineCount: 3,
      plannerParallelMachineAdded: true,
    }),
  ]))
  expect(replanned.reduce((total, row) => total + Number(row.pendingGoodQty), 0))
    .toBe(29_001)
})
