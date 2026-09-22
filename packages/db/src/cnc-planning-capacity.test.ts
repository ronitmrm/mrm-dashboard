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

test("planner-added first-position parallel work is ready today ahead of older unstarted work", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-22T12:30:00Z"))
  const createdAt = "2026-09-22T12:09:00Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const dataEntries = [
    ...[
      { jcNo: "P2132", partCode: "R131", orderPcs: 6750, rmInwardDate: "2026-09-21", cycleTime: 87 },
      { jcNo: "P2275", partCode: "M2123B", orderPcs: 1100, rmInwardDate: "2026-09-01", cycleTime: 87 },
    ].flatMap(({ cycleTime, ...job }) => [
      entry("work_order", { ...job, optionNumber: "1", rmInwardKg: 1 }),
      entry("route", { partNo: job.partCode, optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "T42" }),
      entry("cycle", { partNo: job.partCode, optionNumber: "1", setupNo: "1", cycleTime }),
    ]),
    ...["CNC-39", "CNC-40"].map(machineNo => entry("machine_master", { machineNo, machineType: "CNC", machineFamily: "T42", status: "Active" })),
    entry("shop_floor_status", { jcNo: "P2132", partCode: "R131", optionNumber: "1", setupNo: "1", machine: "CNC-40", stage: "operator_started", completedAt: "2026-09-21T13:24:00Z" }),
  ]
  const rows = buildLegacyDashboardSnapshot({
    productionFloorCode: "cnc", workbookName: "PostgreSQL", productionEntries: [], dataEntries,
    previousMachinePlanDetailRows: [
      { jcNo: "P2132", partCode: "R131", optionNumber: "1", setupNo: "1", machine: "CNC-40", routeMachine: "T42" },
      { jcNo: "P2275", partCode: "M2123B", optionNumber: "1", setupNo: "1", machine: "CNC-39", routeMachine: "T42" },
    ],
    planOverrides: [{
      target: "P2132", setupNo: "1", toMachine: "CNC-39", assignmentMode: "add_parallel_machine", createdAt,
      queuePlacements: [{ targetJobCardNumber: "P2132", targetPartCode: "R131", targetSetupNumber: 1, targetSourceMachineNumber: "CNC-40", targetMachineNumber: "CNC-39" }],
    }],
  }).productionControl.machinePlanDetailRows
  const added = rows.find(row => row.jcNo === "P2132" && row.machine === "CNC-39")
  expect(added).toMatchObject({ plannedProductionStartDate: "22-Sept-26", shopFloorTaskReady: true })
  expect(rows.find(row => row.jcNo === "P2132" && row.machine === "CNC-40"))
    .toMatchObject({ runningStatus: "Running", shopFloorStage: "operator_started" })
  expect(rows.find(row => row.jcNo === "P2275")?.plannedProductionStartDate).toBe("27-Sept-26")
})

test("revised cycle time forecasts only the remaining quantity after recorded production", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-07T05:00:00.000Z"))

  const entry = (entryType: string, payload: Record<string, unknown>, createdAt = "2026-09-07T05:00:00.000Z") => ({
    entryType,
    payload,
    createdAt,
  })
  const dataEntries = [
    entry("work_order", {
      jcNo: "CYCLE-REVISION-CHECK",
      partCode: "CYCLE-REVISION-PART",
      optionNumber: "1",
      orderPcs: 10_000,
      rmInwardDate: "2026-09-01",
      rmInwardKg: 1,
    }, "2026-09-01T05:00:00.000Z"),
    ...[
      { setupNo: "1", machineFamily: "REVISION-UPSTREAM", cycleTime: 20 },
      { setupNo: "2", machineFamily: "REVISION-DOWNSTREAM", cycleTime: 40 },
    ].flatMap(({ setupNo, machineFamily, cycleTime }) => [
      entry("route", {
        partNo: "CYCLE-REVISION-PART",
        optionNumber: "1",
        setupNo,
        machineType: "CNC",
        machineFamily,
      }, "2026-09-01T05:00:00.000Z"),
      entry("cycle", {
        partNo: "CYCLE-REVISION-PART",
        optionNumber: "1",
        setupNo,
        cycleTime,
        ...(setupNo === "1" ? { cycleRevisionEffectiveAt: "2026-09-07T05:00:00.000Z" } : {}),
      }, "2026-09-01T05:00:00.000Z"),
      entry("tooling", {
        partNo: "CYCLE-REVISION-PART",
        optionNumber: "1",
        setupNo,
      }, "2026-09-01T05:00:00.000Z"),
      entry("machine_master", {
        machineNo: `REVISION-${setupNo}`,
        machineType: "CNC",
        machineFamily,
        status: "Active",
      }, "2026-09-01T05:00:00.000Z"),
    ]),
  ]
  const productionEntries = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-05", "2026-09-06"].map((prodDate) => ({
    jobCard: "CYCLE-REVISION-CHECK",
    partCode: "CYCLE-REVISION-PART",
    setupNo: "1",
    machine: "REVISION-1",
    machineType: "CNC",
    operatorId: "OP",
    prodDate,
    outputQty: 1_000,
    actualQty: 1_000,
    rejectQty: 0,
    targetQty: 10_000,
  }))

  const plan = buildLegacyDashboardSnapshot({
    productionFloorCode: "cnc",
    workbookName: "PostgreSQL",
    productionEntries,
    dataEntries,
  }).productionControl.machinePlanDetailRows.filter(
    (row) => row.jcNo === "CYCLE-REVISION-CHECK"
  )

  expect(plan).toEqual(expect.arrayContaining([
    expect.objectContaining({
      setupNo: "1",
      rawActualQty: 5_000,
      pendingGoodQty: 5_000,
      plannedProductionEndDate: "8-Sept-26",
    }),
    expect.objectContaining({
      setupNo: "2",
      plannedProductionStartDate: "8-Sept-26",
    }),
  ]))
})
