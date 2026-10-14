import { describe, expect, test } from "vitest"
import { proposalContext } from "./order-acceptance-context"
import {
  calculateProposal,
  type PlanningContext,
  type PlanningLine,
  type ProposalInput,
} from "./order-acceptance"

const input: ProposalInput = {
  reference: "TEST",
  revisionOf: "",
  startDate: "2026-09-14",
  deadline: "2026-09-14",
  hoursPerDay: 8,
  efficiency: 100,
  setupHours: 0,
  dispatchDays: 0,
  mode: "deadline",
  lines: [],
  existingRmDates: {},
}
const line = (id: string, hours: number): PlanningLine => ({
  id,
  part: id,
  option: "1",
  quantity: 100,
  rmDate: "",
  issue: "",
  operations: [{ family: "JL", setup: "1", hours }],
})
const context: PlanningContext = {
  version: 1,
  machines: [{ id: "JL1", family: "JL" }],
  holidays: [],
  weeklyHoliday: 5,
  existing: [],
  reservations: [],
  blockers: [],
}

describe("Proposed Order capacity review", () => {
  test("keeps old work beyond the deadline while selecting new work on other machines", () => {
    const hx = {
      ...line("old-hx", 16),
      operations: [{ family: "C3", setup: "1", hours: 16 }],
    }
    const lines = [{ ...hx, id: "new-hx" }, line("new-jl", 2)]
    const plan = calculateProposal(
      { ...input, lines },
      {
        ...context,
        machines: [...context.machines, { id: "HX-01", family: "C3" }],
        existing: [hx],
      },
      lines
    )
    expect(plan.blockers).toEqual([])
    expect(plan.lines.map((row) => row.selected)).toEqual([false, true])
    expect(plan.families.find((row) => row.family === "C3")).toMatchObject({
      committed: 8,
      proposed: 0,
    })
  })
  test("honours completed route changes and schedules remaining work awaiting replacement RM", () => {
    const route = {
      partNo: "part",
      optionNumber: "1",
      setupNo: "1",
      machineFamily: "JL",
    }
    const snapshot = {
      productionControl: {
        routeMasterRows: [route],
        cycleMasterRows: [{ ...route, totalTime: 3600 }],
        machinePlanningRows: [{ machine: "JL1", machineFamily: "JL" }],
        workOrders: [
          {
            jcNo: "changed",
            partCode: "part",
            optionNumber: "1",
            orderPcs: 2,
            rmStatus: "Received",
            finalSetupGoodPieces: 2,
            routeChangeRemainingSetups: [
              { setupNo: "1", plan: true, quantity: 0 },
            ],
          },
          {
            jcNo: "replacement",
            partCode: "part",
            optionNumber: "1",
            orderPcs: 4,
            rmStatus: "Rejected - wait for replacement",
            rmPlanningAction: "wait_for_replacement",
            rawRows: 1,
          },
        ],
        productionDashboardRows: [
          { jcNo: "changed", partCode: "part", actualFinishDate: "1-Sept-26" },
        ],
        productionOutputRows: [
          {
            jobCard: "replacement",
            partCode: "part",
            setupNo: "1",
            actualQty: 1,
          },
        ],
      },
    }
    const { context: workload } = proposalContext(snapshot)
    expect(workload.existing.map((row) => row.id)).toEqual(["replacement"])
    expect(workload.existing[0]).toMatchObject({
      rmDate: "",
      issue: "",
      operations: [{ hours: 3 }],
    })
    const lines = [line("new", 5)]
    expect(
      calculateProposal({ ...input, lines }, workload, lines).lines[0]?.selected
    ).toBe(true)
    expect(
      calculateProposal({ ...input, lines, mode: "dates" }, workload, lines)
        .blockers
    ).toEqual(["replacement: awaiting tentative RM date"])
    const unconfirmed = proposalContext({
      productionControl: {
        ...snapshot.productionControl,
        productionDashboardRows: [],
      },
    }).context
    expect(
      unconfirmed.existing.find((row) => row.id === "changed")?.issue
    ).toContain("no canonical machine schedule")
  })
  test("uses the shared calendar to open a Friday for machining", () => {
    const { context: calendar } = proposalContext({ productionControl: {
      planningHolidayRows: [
        { date: "16-Oct-26", dayType: "Working Friday" },
        { date: "17-Oct-26", dayType: "Holiday" },
      ],
    } })
    const lines = [line("new", 8)]
    const friday = { ...input, lines, startDate: "2026-10-16", deadline: "2026-10-16" }
    expect(calculateProposal(friday, context, lines).lines[0]?.selected).toBe(false)
    expect(calendar.holidays).toEqual(["2026-10-17"])
    expect(calculateProposal(friday, { ...context, holidays: calendar.holidays, workingDates: calendar.workingDates }, lines).lines[0]).toMatchObject({ selected: true, completion: "2026-10-16" })
    const partial = proposalContext({ productionFloorCode: "cnc", productionControl: {
      planningHolidayRows: [{ date: "16-Oct-26", dayType: "Working Friday" },
        { date: "16-Oct-26", dayType: "Holiday", calendarScope: "cnc", shift: "A" }],
    } }).context
    expect(calculateProposal(friday, { ...context, holidays: partial.holidays, workingDates: partial.workingDates, capacityFractions: partial.capacityFractions }, lines).lines[0]?.selected).toBe(false)
  })
  test("uses the full period for machining even when an older draft has finishing days", () => {
    const lines = [line("new", 8)]
    const savedInput = { ...input, lines, dispatchDays: 60 }
    const plan = calculateProposal(savedInput, context, lines)
    expect(plan.lines[0]).toMatchObject({
      selected: true,
      completion: "2026-09-14",
    })
  })
  test("keeps machines and schedules routes with equivalent family capitalization", () => {
    const routes = ["JL", "Jl"].map((machineFamily, index) => ({
      partNo: String(index),
      optionNumber: "1",
      setupNo: "1",
      machineFamily,
    }))
    const { context, resolve } = proposalContext({
      readModelVersion: 1,
      productionControl: {
        routeMasterRows: routes,
        cycleMasterRows: routes.map((route) => ({ ...route, totalTime: 3600 })),
        machinePlanningRows: [
          { machine: "CNC-1", machineFamily: "Jl", status: "Active" },
        ],
      },
    })
    const lines = routes.map((route) =>
      resolve({
        id: route.partNo,
        part: route.partNo,
        option: "1",
        quantity: 1,
        rmDate: "",
      })
    )
    expect(context.machines).toEqual([{ id: "CNC-1", family: "JL" }])
    const plan = calculateProposal({ ...input, lines }, context, lines)
    expect(plan.blockers).toEqual([])
    expect(plan.lines.map((line) => line.selected)).toEqual([true, true])
  })
  test("ignores Available constraints while retaining active outages", () => {
    const { context } = proposalContext({
      productionControl: {
        routeMasterRows: [{ machineFamily: "JL" }],
        machinePlanningRows: [{ machine: "CNC-1", machineFamily: "JL" }],
        machineConstraints: [
          {
            machineNumber: "CNC-1",
            status: "Available",
            unavailableFrom: "2026-09-01",
          },
          {
            machineNumber: "CNC-1",
            status: "Unavailable",
            unavailableFrom: "2026-09-14",
            unavailableTo: "2026-09-15",
          },
        ],
      },
    })
    expect(context.blockers).toEqual([])
    expect(context.reservations).toEqual([
      { machine: "CNC-1", start: "2026-09-14", end: "2026-09-15" },
    ])
  })
  test("protects existing work and selects more complete lines while ignoring tentative RM dates", () => {
    const lines = [line("large", 7), line("small-1", 3), line("small-2", 3)]
    const plan = calculateProposal(
      { ...input, lines },
      { ...context, existing: [line("existing", 2)] },
      lines
    )
    expect(
      plan.lines.filter((row) => row.selected).map((row) => row.id)
    ).toEqual(["small-1", "small-2"])
    expect(plan.lines[1]?.completion).toBe("2026-09-14")
    expect(plan.lines[1]?.rmRequiredBy).toBe("2026-09-14")
    expect(plan.families[0]).toMatchObject({
      available: 8,
      committed: 2,
      proposed: 6,
      utilisation: 1,
    })
  })
  test("unknown existing RM blocks dated promises instead of dropping existing workload", () => {
    const proposed = line("new", 2)
    proposed.rmDate = "2026-09-14"
    const missingMaster = {
      ...proposed,
      id: "missing",
      issue: "Missing product route",
    }
    const lines = [proposed, missingMaster]
    const plan = calculateProposal(
      { ...input, mode: "dates", lines },
      { ...context, existing: [line("existing", 2)] },
      lines
    )
    expect(plan.blockers).toEqual(["existing: awaiting tentative RM date"])
    expect(plan.lines[0]?.selected).toBe(false)
    expect(plan.lines[0]?.completion).toBe("")
    expect(plan.lines[1]).toMatchObject({
      selected: false,
      reason: "Missing product route",
    })
  })
})
