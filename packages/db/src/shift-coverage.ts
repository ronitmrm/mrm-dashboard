import type { ShiftCoverageKind, ShiftGapReview, ShiftInterval, ShiftSegment } from "./shift-idle-reasons"

export type RecordedShiftInterval = ShiftInterval & {
  kind: Exclude<ShiftCoverageKind, "gap" | "reviewed">
}

// Specific interruptions take precedence over scheduled breaks and session elapsed time.
const precedence = ["breakdown", "maintenance", "downtime", "break", "running", "unclosed"] as const

export function buildShiftCoverage(window: ShiftInterval, records: RecordedShiftInterval[], reviews: ShiftGapReview[] = []): ShiftSegment[] {
  const start = Date.parse(window.start)
  const end = Date.parse(window.end)
  const intervals = records.map((record) => ({
    kind: record.kind,
    start: Math.max(start, Date.parse(record.start)),
    end: Math.min(end, Date.parse(record.end)),
  })).filter((interval) => interval.start < interval.end)
  const points = [...new Set([start, end, ...intervals.flatMap((interval) => [interval.start, interval.end])])]
    .sort((left, right) => left - right)

  const segments: ShiftSegment[] = []
  for (const [index, from] of points.slice(0, -1).entries()) {
    const to = points[index + 1]!
    const kind = precedence.find((category) => intervals.some((interval) =>
      interval.kind === category && interval.start <= from && interval.end >= to)) ?? "gap"
    const previous = segments.at(-1)
    if (previous?.kind === kind) {
      previous.end = new Date(to).toISOString()
    } else {
      segments.push({ kind, start: new Date(from).toISOString(), end: new Date(to).toISOString() })
    }
  }
  return segments.map((segment) => {
    if (segment.kind !== "gap") return segment
    const review = reviews.find((review) => review.start === segment.start && review.end === segment.end)
    return review ? { ...segment, kind: "reviewed", review } : segment
  })
}
