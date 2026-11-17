import { expect, test } from "vitest"
import { buildShiftCoverage, type RecordedShiftInterval } from "./shift-coverage"
import { shiftIdleQueue, shiftReasonRanges, type ShiftIdleMachine } from "./shift-idle-reasons"

const at = (time: string) => `2026-11-16T${time}:00.000Z`
const interval = (start: string, end: string) => ({ start: at(start), end: at(end) })
const record = (kind: RecordedShiftInterval["kind"], start: string, end: string) => ({
  kind, ...interval(start, end),
})

test("credits recorded production, shared breakdown and break exactly once", () => {
  const window = interval("06:00", "14:00")
  const records = [
    record("running", "05:30", "11:00"),
    record("downtime", "11:00", "13:00"),
    record("breakdown", "11:00", "13:00"),
    record("break", "13:00", "13:30"),
  ]
  const review = { ...interval("13:30", "14:00"), reason: "operator_unavailable" as const, note: null, version: 1 }
  expect(buildShiftCoverage(window, records)).toEqual([
    record("running", "06:00", "11:00"),
    record("breakdown", "11:00", "13:00"),
    record("break", "13:00", "13:30"),
    { kind: "gap", ...interval("13:30", "14:00") },
  ])
  expect(buildShiftCoverage(window, records, [review]).at(-1)).toEqual({
    kind: "reviewed", ...interval("13:30", "14:00"), review,
  })
})

test("routes up to 30 unexplained minutes to Completed and sums gaps before applying the cutoff", () => {
  const machine: ShiftIdleMachine = {
    machineId: "1", machineNumber: "CNC-1", jobCard: null, item: null, setup: null, stage: null, untimedOutput: false,
    segments: buildShiftCoverage(interval("06:00", "14:00"), [record("running", "06:15", "13:45")]),
  }
  expect(shiftIdleQueue(machine)).toBe("unaccounted")
  expect(shiftReasonRanges(machine.segments)).toHaveLength(0)

  machine.segments = buildShiftCoverage(interval("06:00", "14:00"), [record("running", "06:15", "13:44")])
  expect(shiftIdleQueue(machine)).toBe("review")
  expect(shiftReasonRanges(machine.segments)).toHaveLength(2)

  const review = { ...interval("06:00", "06:15"), reason: "no_job_assigned" as const, note: null, version: 1 }
  machine.segments = buildShiftCoverage(interval("06:00", "14:00"), [record("running", "06:15", "13:44")], [review])
  expect(shiftIdleQueue(machine)).toBe("unaccounted")
  expect(shiftReasonRanges(machine.segments)).toEqual([{ ...interval("06:00", "06:15"), kind: "reviewed", review }])
})

test("subtracts interruptions from an open session and rechecks gaps after late production entries", () => {
  const window = interval("06:00", "14:00")
  const oldReview = { ...interval("06:00", "10:00"), reason: "no_job_assigned" as const, note: null, version: 1 }
  expect(buildShiftCoverage(window, [
    record("running", "08:00", "10:00"),
    record("unclosed", "10:00", "14:00"),
    record("downtime", "12:00", "14:15"),
  ], [oldReview])).toEqual([
    { kind: "gap", ...interval("06:00", "08:00") },
    record("running", "08:00", "10:00"),
    record("unclosed", "10:00", "12:00"),
    record("downtime", "12:00", "14:00"),
  ])
})
