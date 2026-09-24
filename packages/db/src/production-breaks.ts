export type ProductionBreak = { startTime: string; endTime: string }
export type TimeInterval = { startedAt: Date; endedAt: Date }

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const IST_OFFSET_MS = 330 * MINUTE_MS
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/

function minuteOfDay(value: string) {
  const match = timePattern.exec(value)
  if (!match) throw new Error("Break times must use 24-hour HH:mm format.")
  return Number(match[1]) * 60 + Number(match[2])
}

export function validateProductionBreaks(breaks: ProductionBreak[]) {
  const sorted = breaks.map((item) => ({
    startTime: item.startTime,
    endTime: item.endTime,
    start: minuteOfDay(item.startTime),
    end: minuteOfDay(item.endTime),
  })).sort((left, right) => left.start - right.start)
  for (const [index, item] of sorted.entries()) {
    if (item.end <= item.start) {
      throw new Error("A break must end after it starts on the same day.")
    }
    if (index && item.start < sorted[index - 1]!.end) {
      throw new Error("Break times cannot overlap.")
    }
  }
  return sorted.map(({ startTime, endTime }) => ({ startTime, endTime }))
}

function intersectionMilliseconds(left: TimeInterval, right: TimeInterval) {
  return Math.max(0, Math.min(left.endedAt.getTime(), right.endedAt.getTime()) -
    Math.max(left.startedAt.getTime(), right.startedAt.getTime()))
}

function mergedIntervals(intervals: TimeInterval[]) {
  const sorted = intervals.filter((item) => item.endedAt > item.startedAt)
    .sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime())
  const merged: TimeInterval[] = []
  for (const item of sorted) {
    const last = merged.at(-1)
    if (last && item.startedAt <= last.endedAt) {
      if (item.endedAt > last.endedAt) last.endedAt = item.endedAt
    } else {
      merged.push({ ...item })
    }
  }
  return merged
}

export function productionBreakMinutes(input: {
  breaks: ProductionBreak[]
  downtime: TimeInterval[]
  endedAt: Date
  startedAt: Date
}) {
  if (input.endedAt <= input.startedAt || !input.breaks.length) {
    return { breakMinutes: 0, additionalBreakMinutes: 0 }
  }
  const session = { startedAt: input.startedAt, endedAt: input.endedAt }
  const firstDay = Math.floor((input.startedAt.getTime() + IST_OFFSET_MS) / DAY_MS)
  const lastDay = Math.floor((input.endedAt.getTime() + IST_OFFSET_MS) / DAY_MS)
  const intervals: TimeInterval[] = []
  for (let day = firstDay; day <= lastDay; day += 1) {
    const midnight = day * DAY_MS - IST_OFFSET_MS
    for (const item of input.breaks) {
      const start = midnight + minuteOfDay(item.startTime) * MINUTE_MS
      const end = midnight + minuteOfDay(item.endTime) * MINUTE_MS
      if (start < input.endedAt.getTime() && end > input.startedAt.getTime()) {
        intervals.push({
          startedAt: new Date(Math.max(start, input.startedAt.getTime())),
          endedAt: new Date(Math.min(end, input.endedAt.getTime())),
        })
      }
    }
  }
  const downtime = mergedIntervals(input.downtime)
  const breakMs = intervals.reduce((total, item) => total +
    intersectionMilliseconds(item, session), 0)
  const overlapMs = intervals.reduce((total, item) => total +
    downtime.reduce((covered, event) => covered + intersectionMilliseconds(item, event), 0), 0)
  return {
    breakMinutes: Math.round(breakMs / MINUTE_MS),
    additionalBreakMinutes: Math.round((breakMs - overlapMs) / MINUTE_MS),
  }
}
