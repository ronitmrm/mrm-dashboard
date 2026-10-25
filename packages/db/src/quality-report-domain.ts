export type QualityProduction = {
  date: string
  shift: string
  machine: string
  good: number
  rejected: number
}
export type QualityRequest = {
  id: string
  requestedAt: string
  approvedAt: string | null
  closedAt: string | null
  inspector: string | null
  shift: string
}
export type QualityRun = {
  id: string
  machine: string
  workOrder: string
  setup: string
  shift: string
  start: string
  end: string
  downtime: { start: string; end: string }[]
  breaks?: { startTime: string; endTime: string }[]
}
export type QualityCheck = {
  machine: string
  workOrder: string
  setup: string
  date: string
  hour: string
}
export type QualityDefect = {
  date: string
  shift: string
  defect: string
  pieces: number
}
export type QualityReportSource = {
  production: QualityProduction[]
  requests: QualityRequest[]
  runs: QualityRun[]
  checks: QualityCheck[]
  defects: QualityDefect[]
  inspectors: string[]
}
export type QualityBucket = {
  label: string
  good: number
  rejected: number
  approved: number
  pending: number
  minutes: number
  timed: number
  expected: number
  completed: number
}
export type QualityReportData = ReturnType<typeof buildQualityReport>

const hour = 3_600_000
const offset = 5.5 * hour
export function qualityDate(time: number | string) {
  return new Date(
    Number.isFinite(time)
      ? Number(time) + offset
      : Date.parse(String(time)) + offset
  )
    .toISOString()
    .slice(0, 10)
}
function bucket(label: string): QualityBucket {
  return {
    label,
    good: 0,
    rejected: 0,
    approved: 0,
    pending: 0,
    minutes: 0,
    timed: 0,
    expected: 0,
    completed: 0,
  }
}

/** Each complete hour of actual running time has its own check; downtime cannot create obligations. */
export function qualityHourlyCoverage(
  runs: QualityRun[],
  checks: QualityCheck[],
  from: string,
  to: string
) {
  const start = Date.parse(`${from}T00:00:00+05:30`)
  const end = Date.parse(`${to}T00:00:00+05:30`) + 24 * hour
  const segments = new Map<
    string,
    { start: number; end: number; run: QualityRun }[]
  >()
  for (const run of runs) {
    const breaks: { start: string; end: string }[] = []
    for (
      let day = Date.parse(`${qualityDate(run.start)}T00:00:00+05:30`);
      day < Date.parse(run.end);
      day += 24 * hour
    ) {
      for (const pause of run.breaks ?? []) {
        const date = qualityDate(day)
        breaks.push({
          start: `${date}T${pause.startTime}:00+05:30`,
          end: `${date}T${pause.endTime}:00+05:30`,
        })
      }
    }
    const pauses = [...run.downtime, ...breaks]
      .map((p) => ({ start: Date.parse(p.start), end: Date.parse(p.end) }))
      .sort((a, b) => a.start - b.start)
    let cursor = Math.max(start, Date.parse(run.start))
    const stop = Math.min(end, Date.parse(run.end))
    const add = (a: number, b: number) => {
      while (a < b) {
        const date = qualityDate(a)
        const nextDay = Date.parse(`${date}T00:00:00+05:30`) + 24 * hour
        const limit = Math.min(b, nextDay)
        const key = `${run.machine}|${date}`
        const list = segments.get(key) ?? []
        list.push({ start: a, end: limit, run })
        segments.set(key, list)
        a = limit
      }
    }
    for (const pause of pauses) {
      if (pause.end <= cursor || pause.start >= stop) continue
      add(cursor, Math.min(pause.start, stop))
      cursor = Math.max(cursor, pause.end)
    }
    add(cursor, stop)
  }
  const available = checks
    .map((check) => ({
      ...check,
      at: Date.parse(`${check.date}T${check.hour.slice(0, 5)}:00+05:30`),
    }))
    .sort((a, b) => a.at - b.at)
  const checkKey = (check: QualityCheck) =>
    `${check.machine}|${check.date}|${check.hour.slice(0, 5)}`
  const used = new Set<string>()
  const result: { date: string; shift: string; completed: boolean }[] = []
  for (const list of segments.values()) {
    list.sort((a, b) => a.start - b.start)
    let remaining = hour
    let priorEnd = 0
    let window: typeof list = []
    for (const segment of list) {
      let cursor = Math.max(segment.start, priorEnd)
      priorEnd = Math.max(priorEnd, segment.end)
      while (cursor < segment.end) {
        const stop = Math.min(segment.end, cursor + remaining)
        window.push({ ...segment, start: cursor, end: stop })
        remaining -= stop - cursor
        cursor = stop
        if (remaining > 0) continue
        const match = available.findIndex(
          (check) =>
            !used.has(checkKey(check)) &&
            window.some(
              (part) =>
                check.machine === part.run.machine &&
                check.workOrder === part.run.workOrder &&
                check.setup === part.run.setup &&
                check.at < part.end &&
                check.at + hour > part.start
            )
        )
        if (match >= 0) used.add(checkKey(available[match]!))
        result.push({
          date: qualityDate(stop - 1),
          shift: segment.run.shift || "Unspecified",
          completed: match >= 0,
        })
        window = []
        remaining = hour
      }
    }
  }
  return result
}

export function buildQualityReport(
  source: QualityReportSource,
  from: string,
  to: string,
  now = new Date().toISOString()
) {
  const daily = new Map<string, QualityBucket>()
  const shifts = new Map<string, QualityBucket>()
  const machines = new Map<string, QualityBucket>()
  const inspectors = new Map(
    source.inspectors.map((name) => [name, bucket(name)])
  )
  const get = (map: Map<string, QualityBucket>, key: string) => {
    if (!map.has(key)) map.set(key, bucket(key))
    return map.get(key)!
  }
  const inRange = (date: string) => date >= from && date <= to
  for (
    let date = Date.parse(`${from}T00:00:00Z`);
    date <= Date.parse(`${to}T00:00:00Z`);
    date += 24 * hour
  )
    get(daily, new Date(date).toISOString().slice(0, 10))
  for (const row of source.production) {
    if (!inRange(row.date)) continue
    for (const item of [
      get(daily, row.date),
      get(shifts, row.shift || "Unspecified"),
      get(machines, row.machine || "Unspecified"),
    ]) {
      item.good += row.good
      item.rejected += row.rejected
    }
  }
  let pendingBefore = 0
  let pendingNow = 0
  const nowAt = Date.parse(now)
  const cutoff = Math.min(nowAt, Date.parse(`${to}T23:59:59.999+05:30`))
  const rangeStart = Date.parse(`${from}T00:00:00+05:30`)
  const dailyCutoffs = [...daily]
    .filter(([date]) => date <= qualityDate(nowAt))
    .map(([date, item]) => ({
      item,
      cutoff: Math.min(nowAt, Date.parse(`${date}T23:59:59.999+05:30`)),
    }))
  for (const request of source.requests) {
    const requestedAt = Date.parse(request.requestedAt)
    const requestDate = qualityDate(requestedAt)
    const resolvedAt = Math.min(
      request.approvedAt ? Date.parse(request.approvedAt) : Infinity,
      request.closedAt ? Date.parse(request.closedAt) : Infinity
    )
    const approved =
      request.approvedAt && Date.parse(request.approvedAt) <= cutoff
        ? request.approvedAt
        : null
    if (requestDate < from && resolvedAt >= rangeStart) pendingBefore++
    if (requestedAt <= cutoff && resolvedAt > cutoff) {
      pendingNow++
      get(shifts, request.shift || "Unspecified").pending++
    }
    for (const day of dailyCutoffs) {
      if (requestedAt <= day.cutoff && resolvedAt > day.cutoff)
        day.item.pending++
    }
    if (!approved || !inRange(qualityDate(approved))) continue
    const elapsed = (Date.parse(approved) - requestedAt) / 60_000
    if (elapsed < 0) continue
    const inspector = get(inspectors, request.inspector || "Unspecified")
    for (const item of [
      get(daily, qualityDate(approved)),
      get(shifts, request.shift || "Unspecified"),
      inspector,
    ]) {
      item.approved++
      item.minutes += elapsed
      item.timed++
    }
  }
  for (const slot of qualityHourlyCoverage(
    source.runs,
    source.checks,
    from,
    to
  )) {
    for (const item of [get(daily, slot.date), get(shifts, slot.shift)]) {
      item.expected++
      if (slot.completed) item.completed++
    }
  }
  const defects = new Map<string, number>()
  const shiftDefects = new Map<string, Map<string, number>>()
  for (const row of source.defects) {
    if (!inRange(row.date)) continue
    const name = row.defect || "Unclassified"
    defects.set(name, (defects.get(name) ?? 0) + row.pieces)
    const values = shiftDefects.get(name) ?? new Map<string, number>()
    values.set(
      row.shift || "Unspecified",
      (values.get(row.shift || "Unspecified") ?? 0) + row.pieces
    )
    shiftDefects.set(name, values)
  }
  return {
    daily: [...daily.values()],
    shifts: [...shifts.values()].sort((a, b) => a.label.localeCompare(b.label)),
    machines: [...machines.values()],
    inspectors: [...inspectors.values()],
    pendingBefore,
    pendingNow,
    defects: [...defects]
      .map(([label, pieces]) => ({ label, pieces }))
      .sort((a, b) => b.pieces - a.pieces),
    shiftDefects: [...shiftDefects].map(([label, values]) => ({
      label,
      values: Object.fromEntries(values),
    })),
    approvals: [...inspectors.values()].reduce(
      (sum, item) => sum + item.approved,
      0
    ),
  }
}
