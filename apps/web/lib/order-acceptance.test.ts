import { describe, expect, test, vi } from "vitest"
import { Pool } from "pg"
import { createOrderAcceptanceRepository } from "@workspace/db"
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
  test("ignores obsolete tooling only in forecasts and preserves published commitments", async () => {
    const pool = new Pool()
    const query = vi.spyOn(pool, "query").mockImplementation(async () => ({
      command: "SELECT", rowCount: 2, oid: 0, fields: [], rows: [
        { codes: ["NC014", "NC015"], latest_requirement: { fixture: "NC014" } },
        { codes: ["UNKNOWN"], latest_requirement: null },
      ],
    }))
    const route = { partNo: "NEW", optionNumber: "1", setupNo: "1", machineFamily: "JL" }
    const snapshot = { productionControl: {
      routeMasterRows: [route], cycleMasterRows: [{ ...route, totalTime: 3600 }],
      toolingMasterRows: [{ ...route, fixture: "NC015" }],
      machinePlanningRows: ["JL1", "JL2"].map(machine => ({ machine, machineFamily: "JL", status: "Active" })),
      toolingAvailabilityRows: [{ assetCode: "NC015", allocatedQuantity: 1, occupiedQuantity: 1 }],
      machinePlanDetailRows: [{
        jcNo: "RUNNING", partCode: "OLD", optionNumber: "1", setupNo: "1", machine: "JL1",
        plannedProductionStartDate: "2026-09-14", plannedProductionEndDate: "2026-09-16",
        requiredToolingCodes: ["NC014"], toolingAllocatedQuantities: { NC014: 1 },
        pendingGoodQty: 100, shopFloorStage: "operator_started", runningStatus: "Running",
      }],
    } }
    const original = structuredClone(snapshot)
    const proposed = { id: "new", part: "NEW", option: "1", quantity: 1, rmDate: "" }
    try {
      const occupancy = await createOrderAcceptanceRepository({ pool }).forecastToolingOccupancy("org", "cnc")
      expect(occupancy).toEqual([
        { assetCode: "NC014", occupiedQuantity: 1 }, { assetCode: "UNKNOWN", occupiedQuantity: 1 },
      ])
      const { context: forecast, resolve } = proposalContext(snapshot, input.startDate, occupancy)
      const plan = calculateProposal({ ...input, lines: [proposed] }, forecast, [resolve(proposed)])
      expect(plan.lines[0]).toMatchObject({ selected: true, machinePlan: [expect.objectContaining({ machine: "JL2" })] })
      expect(snapshot).toEqual(original)
      expect(proposalContext(snapshot).context.toolingAvailability?.[0]?.occupiedQuantity).toBe(1)
      expect(query.mock.calls.every(([sql]) => typeof sql === "string" && sql.trimStart().startsWith("SELECT"))).toBe(true)
    } finally { await pool.end() }
  })
  test("does not borrow tooling reserved for a fixed future commitment", () => {
    const product = {
      ...line("new", 16),
      operations: [
        { family: "JL", setup: "1", hours: 16, tooling: { fixture: "FX" } },
      ],
    }
    const workload: PlanningContext = {
      ...context,
      machines: [...context.machines, { id: "JL2", family: "JL" }],
      toolingAvailability: [
        { assetCode: "FX", allocatedQuantity: 1, occupiedQuantity: 0 },
      ],
      reservations: [
        { machine: "JL1", start: "2026-09-15", end: "2026-09-16" },
      ],
      reservedPlans: [
        {
          jcNo: "fixed",
          partCode: "fixed",
          optionNumber: "1",
          setupNo: "1",
          machine: "JL1",
          plannedProductionStartDate: "2026-09-15",
          plannedProductionEndDate: "2026-09-16",
          requiredToolingCodes: ["FX"],
          toolingAllocatedQuantities: { FX: 1 },
          pendingGoodQty: 100,
          shopFloorStage: "planned",
          runningStatus: "Planned",
        },
      ],
    }
    const original = structuredClone(workload)
    const plan = calculateProposal(
      { ...input, deadline: "2026-09-15", lines: [product] },
      workload,
      [product]
    )
    expect(plan.lines[0]?.selected).toBe(false)
    expect(plan.lines[0]?.reason).toContain("after deadline")
    expect(workload).toEqual(original)
  })
  test("reserves full production dates on machines like the actual planner", () => {
    const lines = [2, 3, 5, 6]
      .map((hours, index) => line(`JL-${index}`, hours))
      .concat(
        [1, 1, 1, 1, 1, 1, 6].map((hours, index) => ({
          ...line(`other-${index}`, hours),
          operations: [{ family: "other", setup: "1", hours }],
        }))
      )
    const plan = calculateProposal(
      { ...input, lines },
      {
        ...context,
        machines: [
          ...context.machines,
          { id: "JL2", family: "JL" },
          { id: "other", family: "other" },
        ],
      },
      lines
    )
    expect(plan.lines.filter((row) => row.selected)).toHaveLength(3)
    expect(
      plan.families.reduce((sum, family) => sum + family.proposed, 0)
    ).toBe(24)
  })
  test("fits M221 using actual automatic parallel machining and pooled WIP", () => {
    const product = {
      ...line("M221", 0),
      quantity: 38720,
      operations: [
        { family: "C2", setup: "1", hours: (38720 * 8) / 3600 },
        { family: "SSLB", setup: "2", hours: (38720 * 70) / 3600 },
        { family: "SSLB", setup: "3", hours: (38720 * 60) / 3600 },
      ],
    }
    const settings = {
      ...input,
      lines: [product],
      startDate: "2026-10-15",
      deadline: "2026-12-15",
      hoursPerDay: 23,
      efficiency: 85,
      setupHours: 2,
    }
    const machines = [
      { id: "C2", family: "C2" },
      { id: "SSLB1", family: "SSLB" },
      { id: "SSLB2", family: "SSLB" },
    ]
    const plan = calculateProposal(settings, { ...context, machines }, [
      product,
    ])
    expect(plan.lines[0]?.selected).toBe(true)
    expect(
      plan.lines[0]?.machinePlan?.filter((row) => row.setup === "2")
    ).toHaveLength(2)
    expect(
      plan.lines[0]?.machinePlan
        ?.filter((row) => row.setup === "2")
        .reduce((sum, row) => sum + row.quantity, 0)
    ).toBe(38720)
    expect(
      calculateProposal(
        settings,
        { ...context, machines: machines.slice(0, 2) },
        [product]
      ).lines[0]?.selected
    ).toBe(false)
  })
  test("delays proposed work until common RM availability while retaining existing work", () => {
    const lines = [line("new", 8)]
    const settings = { ...input, deadline: "2026-09-15", lines }
    const workload = { ...context, existing: [line("old", 8)] }
    const plan = calculateProposal(
      { ...settings, tentativeRmDate: "2026-09-15" },
      workload,
      lines
    )
    expect(plan.lines[0]).toMatchObject({
      selected: true,
      rmRequiredBy: "2026-09-15",
      completion: "2026-09-15",
    })
    expect(plan.families[0]?.committed).toBe(8)
    expect(
      calculateProposal(
        { ...settings, tentativeRmDate: "2026-09-15" },
        context,
        [line("new", 16)]
      ).lines[0]?.selected
    ).toBe(false)
    expect(
      calculateProposal(settings, context, [line("new", 16)]).lines[0]?.selected
    ).toBe(true)
  })
  test("rejects a tentative RM date after the machining deadline", () => {
    const lines = [line("new", 8)]
    expect(() =>
      calculateProposal(
        { ...input, lines, tentativeRmDate: "2026-09-15" },
        context,
        lines
      )
    ).toThrow("tentative RM date")
  })
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
      calculateProposal(
        { ...input, deadline: "2026-09-15", lines },
        workload,
        lines
      ).lines[0]?.selected
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
    const { context: calendar } = proposalContext({
      productionControl: {
        planningHolidayRows: [
          { date: "16-Oct-26", dayType: "Working Friday" },
          { date: "17-Oct-26", dayType: "Holiday" },
        ],
      },
    })
    const lines = [line("new", 8)]
    const friday = {
      ...input,
      lines,
      startDate: "2026-10-16",
      deadline: "2026-10-16",
    }
    expect(calculateProposal(friday, context, lines).lines[0]?.selected).toBe(
      false
    )
    expect(calendar.holidays).toEqual(["2026-10-17"])
    expect(
      calculateProposal(
        friday,
        {
          ...context,
          holidays: calendar.holidays,
          workingDates: calendar.workingDates,
        },
        lines
      ).lines[0]
    ).toMatchObject({ selected: true, completion: "2026-10-16" })
    const partial = proposalContext({
      productionFloorCode: "cnc",
      productionControl: {
        planningHolidayRows: [
          { date: "16-Oct-26", dayType: "Working Friday" },
          {
            date: "16-Oct-26",
            dayType: "Holiday",
            calendarScope: "cnc",
            shift: "A",
          },
        ],
      },
    }).context
    expect(
      calculateProposal(
        friday,
        {
          ...context,
          holidays: partial.holidays,
          workingDates: partial.workingDates,
          capacityFractions: partial.capacityFractions,
        },
        lines
      ).lines[0]?.selected
    ).toBe(false)
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
    const plan = calculateProposal(
      { ...input, deadline: "2026-09-15", lines },
      context,
      lines
    )
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
      { ...input, deadline: "2026-09-16", lines },
      { ...context, existing: [line("existing", 2)] },
      lines
    )
    expect(
      plan.lines.filter((row) => row.selected).map((row) => row.id)
    ).toEqual(["small-1", "small-2"])
    expect(plan.lines[1]?.completion).toBe("2026-09-15")
    expect(plan.lines[1]?.rmRequiredBy).toBe("2026-09-15")
    expect(plan.families[0]).toMatchObject({
      available: 24,
      committed: 8,
      proposed: 16,
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
