import { describe, expect, test } from "vitest"
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
    const plan = calculateProposal(
      { ...input, mode: "dates", lines: [proposed] },
      { ...context, existing: [line("existing", 2)] },
      [proposed]
    )
    expect(plan.blockers).toEqual(["existing: awaiting tentative RM date"])
    expect(plan.lines[0]?.selected).toBe(false)
    expect(plan.lines[0]?.completion).toBe("")
  })
})
