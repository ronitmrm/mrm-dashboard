import { expect, test } from "vitest"
import { buildShiftCoverage, type RecordedShiftInterval } from "./shift-coverage"

const at = (time: string) => `2026-11-16T${time}:00.000Z`
const interval = (start: string, end: string) => ({ start: at(start), end: at(end) })
const record = (kind: RecordedShiftInterval["kind"], start: string, end: string) => ({
  kind, ...interval(start, end),
})

test("credits recorded production, shared breakdown and break exactly once and leaves only 30 minutes to explain", () => {
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
