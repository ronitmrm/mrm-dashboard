import { expect, test, vi } from "vitest"

import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"

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

    const machineFor = (jobCard: string) => control.machinePlanDetailRows.find((row) => row.jcNo === jobCard)?.machine
    expect(machineFor("READY-001-001")).toBe("CNC-001-A")
    expect(machineFor("READY-005-013")).toBe("CNC-005-A")
    expect(control.machinePlanDetailRows.find((row) => row.jcNo === "BLOCK-001")).toMatchObject({
      setupPlannedDate: "20-Sept-26",
      plannedProductionStartDate: "20-Sept-26",
      plannedProductionEndDate: "20-Sept-26",
    })
  } finally {
    vi.useRealTimers()
  }
}, 15_000)

test("moves an unstarted queued setup ahead when its WIP is ready first", () => {
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
  ]

  try {
    const control = buildLegacyDashboardSnapshot({
      workbookName: "PostgreSQL",
      productionEntries: [],
      dataEntries: [
        ...job("FIRST-QUEUED", "SLOW-WIP", 1_440),
        ...job("SECOND-QUEUED", "READY-WIP", 288),
        entry("machine_master", { machineNo: "CNC-UP-SLOW", machineType: "CNC", machineFamily: "UPSTREAM", status: "Active" }),
        entry("machine_master", { machineNo: "CNC-UP-FAST", machineType: "CNC", machineFamily: "UPSTREAM", status: "Active" }),
        entry("machine_master", { machineNo: "CNC-DOWN", machineType: "CNC", machineFamily: "DOWNSTREAM", status: "Active" }),
      ],
      previousMachinePlanDetailRows: [
        { jcNo: "FIRST-QUEUED", partCode: "SLOW-WIP", optionNumber: "1", setupNo: "1", routeMachine: "UPSTREAM", machine: "CNC-UP-SLOW" },
        { jcNo: "FIRST-QUEUED", partCode: "SLOW-WIP", optionNumber: "1", setupNo: "2", routeMachine: "DOWNSTREAM", machine: "CNC-DOWN" },
        { jcNo: "SECOND-QUEUED", partCode: "READY-WIP", optionNumber: "1", setupNo: "1", routeMachine: "UPSTREAM", machine: "CNC-UP-FAST" },
        { jcNo: "SECOND-QUEUED", partCode: "READY-WIP", optionNumber: "1", setupNo: "2", routeMachine: "DOWNSTREAM", machine: "CNC-DOWN" },
      ],
    }).productionControl!
    if (!("machinePlanDetailRows" in control)) throw new Error("Missing plan")

    const setupTwo = control.machinePlanDetailRows.filter((row) => row.machine === "CNC-DOWN" && row.setupNo === "2")
    const firstQueued = setupTwo.find((row) => row.jcNo === "FIRST-QUEUED")!
    const secondQueued = setupTwo.find((row) => row.jcNo === "SECOND-QUEUED")!
    const dateOrdinal = (value: unknown) => {
      const [day, month, year] = String(value).split("-")
      const monthIndex = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"].indexOf(month ?? "")
      return Number(year) * 400 + monthIndex * 32 + Number(day)
    }
    expect(dateOrdinal(secondQueued.setupPlannedDate)).toBeLessThan(dateOrdinal(firstQueued.setupPlannedDate))
    expect(setupTwo.every((row) => row.runningStatus === "Planned")).toBe(true)
  } finally {
    vi.useRealTimers()
  }
}, 15_000)
