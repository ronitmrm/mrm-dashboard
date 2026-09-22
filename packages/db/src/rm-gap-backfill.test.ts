import { expect, test, vi } from "vitest"

import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"

test("uses the India plant date for overdue planning when the server is still on the prior UTC date", () => {
  vi.useFakeTimers()
  vi.stubEnv("TZ", "UTC")
  vi.setSystemTime(new Date("2026-09-20T20:50:00Z"))

  const createdAt = "2026-09-20T20:00:00Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })

  try {
    const control = buildLegacyDashboardSnapshot({
      workbookName: "PostgreSQL",
      productionEntries: [],
      dataEntries: [
        entry("work_order", { jcNo: "IST-DATE", partCode: "IST-PART", optionNumber: "1", orderPcs: 100, rmInwardDate: "2026-09-18", rmInwardKg: 1 }),
        entry("route", { partNo: "IST-PART", optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "IST-FAMILY" }),
        entry("cycle", { partNo: "IST-PART", optionNumber: "1", setupNo: "1", cycleTime: 288 }),
        entry("machine_master", { machineNo: "CNC-IST", machineType: "CNC", machineFamily: "IST-FAMILY", status: "Active" }),
      ],
    }).productionControl!
    if (!("machinePlanDetailRows" in control)) throw new Error("Missing plan")

    expect(control.machinePlanDetailRows.find((row) => row.jcNo === "IST-DATE")).toMatchObject({
      setupPlannedDate: "21-Sept-26",
      plannedProductionStartDate: "21-Sept-26",
      plannedProductionEndDate: "21-Sept-26",
    })
  } finally {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  }
})

test("checks every compatible machine gap after raw material becomes ready", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-20T06:00:00Z"))

  const createdAt = "2026-09-20T05:00:00Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const dataEntries: Array<ReturnType<typeof entry>> = []
  const previousMachinePlanDetailRows: Record<string, unknown>[] = []

  dataEntries.push(entry("machine_master", { machineNo: "CNC-UP", machineType: "CNC", machineFamily: "UPSTREAM", status: "Active" }))

  for (let index = 1; index <= 5; index += 1) {
    const suffix = String(index).padStart(3, "0")
    const family = `FAMILY-${suffix}`
    const targetMachine = `CNC-${suffix}-A`
    const sourceMachine = `CNC-${suffix}-B`
    const future = { jcNo: `FUTURE-${suffix}`, partCode: `FUTURE-PART-${suffix}` }
    const jobs = [
      { jcNo: `BLOCK-${suffix}`, partCode: `BLOCK-PART-${suffix}`, orderPcs: 1, rmInwardDate: "2026-09-18", cycleTime: 288, machine: sourceMachine },
      ...Array.from({ length: 13 }, (_, readyIndex) => ({
        jcNo: `READY-${suffix}-${String(readyIndex + 1).padStart(3, "0")}`,
        partCode: `READY-PART-${suffix}-${String(readyIndex + 1).padStart(3, "0")}`,
        orderPcs: 100,
        rmInwardDate: "2026-09-20",
        cycleTime: 288,
        machine: sourceMachine,
      })),
    ]
    dataEntries.push(
      entry("work_order", { ...future, optionNumber: "1", orderPcs: 1_160, rmInwardDate: "2026-07-01", rmInwardKg: 1 }),
      entry("route", { partNo: future.partCode, optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "UPSTREAM" }),
      entry("cycle", { partNo: future.partCode, optionNumber: "1", setupNo: "1", cycleTime: 1_440 }),
      entry("route", { partNo: future.partCode, optionNumber: "1", setupNo: "2", machineType: "CNC", machineFamily: family }),
      entry("cycle", { partNo: future.partCode, optionNumber: "1", setupNo: "2", cycleTime: 720 }),
      ...jobs.flatMap(({ jcNo, partCode, orderPcs, rmInwardDate, cycleTime }) => [
        entry("work_order", { jcNo, partCode, optionNumber: "1", orderPcs, rmInwardDate, rmInwardKg: 1 }),
        entry("route", { partNo: partCode, optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: family }),
        entry("cycle", { partNo: partCode, optionNumber: "1", setupNo: "1", cycleTime }),
      ]),
      entry("machine_master", { machineNo: targetMachine, machineType: "CNC", machineFamily: family, status: "Active" }),
      entry("machine_master", { machineNo: sourceMachine, machineType: "CNC", machineFamily: family, status: "Active" }),
    )
    previousMachinePlanDetailRows.push(
      { ...future, optionNumber: "1", setupNo: "1", routeMachine: "UPSTREAM", machine: "CNC-UP" },
      { ...future, optionNumber: "1", setupNo: "2", routeMachine: family, machine: targetMachine },
      ...jobs.map(({ jcNo, partCode, machine }) => ({
        jcNo,
        partCode,
        optionNumber: "1",
        setupNo: "1",
        routeMachine: family,
        machine,
      })),
    )
  }

  try {
    const control = buildLegacyDashboardSnapshot({
      workbookName: "PostgreSQL",
      productionEntries: [],
      dataEntries,
      previousMachinePlanDetailRows,
    }).productionControl!
    if (!("machinePlanDetailRows" in control)) throw new Error("Missing plan")

    const readyMachines = (family: string) => [...new Set(control.machinePlanDetailRows
      .filter((row) => String(row.jcNo).startsWith(`READY-${family}-`))
      .map((row) => row.machine))].sort()
    expect(readyMachines("001")).toEqual(["CNC-001-A", "CNC-001-B"])
    expect(readyMachines("005")).toEqual(["CNC-005-A", "CNC-005-B"])
    expect(control.machinePlanDetailRows.find((row) => row.jcNo === "BLOCK-001")).toMatchObject({
      setupPlannedDate: "20-Sept-26",
      plannedProductionStartDate: "20-Sept-26",
      plannedProductionEndDate: "20-Sept-26",
    })
  } finally {
    vi.useRealTimers()
  }
}, 15_000)

test("keeps every downstream stage off machines until its preceding actual WIP is ready", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-20T06:00:00Z"))

  const createdAt = "2026-09-20T05:00:00Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const job = (jcNo: string, partCode: string, upstreamCycleTime: number) => [
    entry("work_order", { jcNo, partCode, optionNumber: "1", orderPcs: 100, rmInwardDate: "2026-09-20", rmInwardKg: 1 }),
    entry("route", { partNo: partCode, optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "UPSTREAM" }),
    entry("cycle", { partNo: partCode, optionNumber: "1", setupNo: "1", cycleTime: upstreamCycleTime }),
    entry("route", { partNo: partCode, optionNumber: "1", setupNo: "2", machineType: "CNC", machineFamily: "DOWNSTREAM" }),
    entry("cycle", { partNo: partCode, optionNumber: "1", setupNo: "2", cycleTime: 288 }),
    entry("route", { partNo: partCode, optionNumber: "1", setupNo: "3", machineType: "CNC", machineFamily: "DOWNSTREAM" }),
    entry("cycle", { partNo: partCode, optionNumber: "1", setupNo: "3", cycleTime: 288 }),
    entry("route", { partNo: partCode, optionNumber: "1", setupNo: "4", machineType: "CNC", machineFamily: "DOWNSTREAM" }),
    entry("cycle", { partNo: partCode, optionNumber: "1", setupNo: "4", cycleTime: 288 }),
  ]

  try {
    const input: Parameters<typeof buildLegacyDashboardSnapshot>[0] = {
      workbookName: "PostgreSQL",
      productionEntries: [],
      dataEntries: [
        ...job("FIRST-QUEUED", "SLOW-WIP", 1_440),
        ...job("SECOND-QUEUED", "READY-WIP", 288),
        entry("work_order", { jcNo: "OTHER-READY", partCode: "OTHER-PART", optionNumber: "1", orderPcs: 100, rmInwardDate: "2026-09-20", rmInwardKg: 1 }),
        entry("route", { partNo: "OTHER-PART", optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "DOWNSTREAM" }),
        entry("cycle", { partNo: "OTHER-PART", optionNumber: "1", setupNo: "1", cycleTime: 288 }),
        entry("machine_master", { machineNo: "CNC-UP-SLOW", machineType: "CNC", machineFamily: "UPSTREAM", status: "Active" }),
        entry("machine_master", { machineNo: "CNC-UP-FAST", machineType: "CNC", machineFamily: "UPSTREAM", status: "Active" }),
        entry("machine_master", { machineNo: "CNC-DOWN", machineType: "CNC", machineFamily: "DOWNSTREAM", status: "Active" }),
      ],
      previousMachinePlanDetailRows: [
        { jcNo: "FIRST-QUEUED", partCode: "SLOW-WIP", optionNumber: "1", setupNo: "1", routeMachine: "UPSTREAM", machine: "CNC-UP-SLOW" },
        { jcNo: "FIRST-QUEUED", partCode: "SLOW-WIP", optionNumber: "1", setupNo: "2", routeMachine: "DOWNSTREAM", machine: "CNC-DOWN" },
        { jcNo: "FIRST-QUEUED", partCode: "SLOW-WIP", optionNumber: "1", setupNo: "3", routeMachine: "DOWNSTREAM", machine: "CNC-DOWN" },
        { jcNo: "FIRST-QUEUED", partCode: "SLOW-WIP", optionNumber: "1", setupNo: "4", routeMachine: "DOWNSTREAM", machine: "CNC-DOWN" },
        { jcNo: "SECOND-QUEUED", partCode: "READY-WIP", optionNumber: "1", setupNo: "1", routeMachine: "UPSTREAM", machine: "CNC-UP-FAST" },
        { jcNo: "SECOND-QUEUED", partCode: "READY-WIP", optionNumber: "1", setupNo: "2", routeMachine: "DOWNSTREAM", machine: "CNC-DOWN" },
        { jcNo: "SECOND-QUEUED", partCode: "READY-WIP", optionNumber: "1", setupNo: "3", routeMachine: "DOWNSTREAM", machine: "CNC-DOWN" },
        { jcNo: "SECOND-QUEUED", partCode: "READY-WIP", optionNumber: "1", setupNo: "4", routeMachine: "DOWNSTREAM", machine: "CNC-DOWN" },
        { jcNo: "OTHER-READY", partCode: "OTHER-PART", optionNumber: "1", setupNo: "1", routeMachine: "DOWNSTREAM", machine: "CNC-DOWN" },
      ],
    }
    const control = buildLegacyDashboardSnapshot(input).productionControl!
    if (!("machinePlanDetailRows" in control)) throw new Error("Missing plan")

    const downstreamMachineRows = control.machinePlanDetailRows.filter((row) => row.machine === "CNC-DOWN")
    expect(downstreamMachineRows.map((row) => `${row.jcNo}:${row.setupNo}`)).toEqual(["OTHER-READY:1"])
    expect(control.productionDashboardRows.find((row) => row.jcNo === "SECOND-QUEUED")).toMatchObject({
      currentProbableDispatchDate: "23-Sept-26",
    })

    input.productionEntries.push({
      jobCard: "SECOND-QUEUED",
      partCode: "READY-WIP",
      setupNo: "1",
      machine: "CNC-UP-FAST",
      machineType: "CNC",
      operatorId: "OP-1",
      prodDate: "2026-09-20",
      outputQty: 100,
      actualQty: 100,
      rejectQty: 0,
      targetQty: 100,
    })
    const refreshed = buildLegacyDashboardSnapshot(input).productionControl!
    if (!("machinePlanDetailRows" in refreshed)) throw new Error("Missing refreshed plan")
    expect(refreshed.machinePlanDetailRows
      .filter((row) => row.jcNo === "SECOND-QUEUED")
      .map((row) => row.setupNo)
      .sort()).toEqual(["1", "2"])
  } finally {
    vi.useRealTimers()
  }
}, 15_000)

test("releases both downstream machines only after pooled actual WIP covers their combined buffer", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-20T06:00:00Z"))

  const createdAt = "2026-09-20T05:00:00Z"
  const jcNo = "TWO-MACHINE-WIP"
  const partCode = "TWO-MACHINE-PART"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const input: Parameters<typeof buildLegacyDashboardSnapshot>[0] = {
    workbookName: "PostgreSQL",
    productionEntries: [],
    dataEntries: [
      entry("work_order", { jcNo, partCode, optionNumber: "1", orderPcs: 6_000, rmInwardDate: "2026-09-20", rmInwardKg: 1 }),
      entry("route", { partNo: partCode, optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "UPSTREAM" }),
      entry("cycle", { partNo: partCode, optionNumber: "1", setupNo: "1", cycleTime: 288 }),
      entry("route", { partNo: partCode, optionNumber: "1", setupNo: "2", machineType: "CNC", machineFamily: "DOWNSTREAM" }),
      entry("cycle", { partNo: partCode, optionNumber: "1", setupNo: "2", cycleTime: 288 }),
      entry("machine_master", { machineNo: "CNC-UPSTREAM", machineType: "CNC", machineFamily: "UPSTREAM", status: "Active" }),
      entry("machine_master", { machineNo: "CNC-DOWNSTREAM-01", machineType: "CNC", machineFamily: "DOWNSTREAM", status: "Active" }),
      entry("machine_master", { machineNo: "CNC-DOWNSTREAM-02", machineType: "CNC", machineFamily: "DOWNSTREAM", status: "Active" }),
    ],
  }
  const downstreamMachines = (actualQty: number) => {
    const control = buildLegacyDashboardSnapshot({
      ...input,
      productionEntries: [{
        jobCard: jcNo,
        partCode,
        setupNo: "1",
        machine: "CNC-UPSTREAM",
        machineType: "CNC",
        operatorId: "OP-1",
        prodDate: "2026-09-20",
        outputQty: actualQty,
        actualQty,
        rejectQty: 0,
        targetQty: 6_000,
      }],
    }).productionControl!
    if (!("machinePlanDetailRows" in control)) throw new Error("Missing plan")
    return control.machinePlanDetailRows
      .filter((row) => row.jcNo === jcNo && String(row.setupNo) === "2")
      .map((row) => String(row.machine))
      .sort()
  }

  try {
    expect(downstreamMachines(399)).toEqual([])
    expect(downstreamMachines(400)).toEqual([
      "CNC-DOWNSTREAM-01",
      "CNC-DOWNSTREAM-02",
    ])
  } finally {
    vi.useRealTimers()
  }
}, 15_000)

test("does not backfill an idle machine during its Shift All unavailable window", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-22T06:00:00Z"))

  const createdAt = "2026-09-22T05:00:00Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const job = (jcNo: string, partCode: string, orderPcs: number, rmInwardDate: string, cycleTime: number) => [
    entry("work_order", { jcNo, partCode, optionNumber: "1", orderPcs, rmInwardDate, rmInwardKg: 1 }),
    entry("route", { partNo: partCode, optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "T25" }),
    entry("cycle", { partNo: partCode, optionNumber: "1", setupNo: "1", cycleTime }),
  ]

  try {
    const control = buildLegacyDashboardSnapshot({
      productionFloorCode: "cnc",
      workbookName: "PostgreSQL",
      productionEntries: [],
      dataEntries: [
        ...job("BLOCKER", "BLOCKER-PART", 100, "2026-09-22", 8_100),
        ...job("BACKFILL", "BACKFILL-PART", 20, "2026-09-22", 8_100),
        ...job("AFTER-OUTAGE", "AFTER-OUTAGE-PART", 10, "2026-10-24", 8_100),
        entry("machine_master", { machineNo: "CNC-11", machineType: "CNC", machineFamily: "T25", status: "Active" }),
        entry("machine_master", { machineNo: "CNC-12", machineType: "CNC", machineFamily: "T25", status: "Active" }),
      ],
      machineConstraints: [{
        machineNo: "CNC-11",
        unavailableFrom: "2026-09-22",
        unavailableTo: "2026-10-22",
        rescheduleAction: "shift_all",
        status: "Active",
        createdAt,
      }],
      previousMachinePlanDetailRows: [
        { jcNo: "BLOCKER", partCode: "BLOCKER-PART", optionNumber: "1", setupNo: "1", routeMachine: "T25", machine: "CNC-12" },
        { jcNo: "BACKFILL", partCode: "BACKFILL-PART", optionNumber: "1", setupNo: "1", routeMachine: "T25", machine: "CNC-12" },
        { jcNo: "AFTER-OUTAGE", partCode: "AFTER-OUTAGE-PART", optionNumber: "1", setupNo: "1", routeMachine: "T25", machine: "CNC-11" },
      ],
    }).productionControl
    if (!("machinePlanDetailRows" in control)) throw new Error("Missing plan")

    expect(control.machinePlanDetailRows.filter((row) => row.machine === "CNC-11")).toEqual([
      expect.objectContaining({
        jcNo: "AFTER-OUTAGE",
        plannedProductionStartDate: "24-Oct-26",
      }),
    ])
  } finally {
    vi.useRealTimers()
  }
})
