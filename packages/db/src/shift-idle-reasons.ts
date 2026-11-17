export const cncShifts = ["A", "B", "C"] as const
export type CncShift = (typeof cncShifts)[number]

export const shiftIdleReasons = [
  ["programmer_unavailable", "Programmer unavailable"],
  ["operator_unavailable", "Operator unavailable"],
  ["breakdown", "Machine breakdown"],
  ["raw_material_unavailable", "Raw material unavailable"],
  ["setup_incomplete", "Setup incomplete"],
  ["no_job_assigned", "No job assigned"],
  ["other", "Other"],
] as const

export type ShiftIdleReason = (typeof shiftIdleReasons)[number][0]

export const shiftCoverageKinds = [
  ["running", "Production"],
  ["breakdown", "Breakdown"],
  ["maintenance", "Maintenance"],
  ["downtime", "Downtime"],
  ["break", "Scheduled break"],
  ["unclosed", "Session needs closure"],
  ["reviewed", "Planner explained"],
  ["gap", "Needs a reason"],
] as const

export type ShiftCoverageKind = (typeof shiftCoverageKinds)[number][0]
export type ShiftInterval = { start: string; end: string }
export type ShiftGapReview = ShiftInterval & {
  reason: ShiftIdleReason
  note: string | null
  version: number
}
export type ShiftSegment = ShiftInterval & { kind: ShiftCoverageKind; review?: ShiftGapReview }

export function shiftReasonRanges(segments: ShiftSegment[]) {
  return segments.filter(({ kind }) => kind === "gap" || kind === "reviewed")
}

export function shiftReasonVersion(ranges: ShiftSegment[]) {
  return ranges.map(({ start, end, review }) => `${start}/${end}/${review?.version ?? 0}`).join("|")
}

export function isCncShift(value: unknown): value is CncShift {
  return cncShifts.some((shift) => shift === value)
}

export function isShiftIdleReason(value: unknown): value is ShiftIdleReason {
  return shiftIdleReasons.some(([reason]) => reason === value)
}

export type ShiftIdleMachine = {
  machineId: string
  machineNumber: string
  jobCard: string | null
  item: string | null
  setup: number | null
  stage: string | null
  untimedOutput: boolean
  segments: ShiftSegment[]
}

export type ShiftIdleReview = {
  productionDate: string
  shift: CncShift
  fleetSize: number
  machines: ShiftIdleMachine[]
  canEdit: boolean
}
