export type JobCardPlanRow = {
  plannedProductionEndDate?: string | null
  plannedProductionStartDate?: string | null
  setupNumber?: string | null
}

export type JobCardSessionRow = {
  downtimeMinutes?: number | null
  endedAt?: string | null
  goodPieces?: number | null
  rejectedPieces?: number | null
  runtimeMinutes?: number | null
  setupNumber?: string | null
  startedAt?: string | null
  totalPieces?: number | null
}

export type JobCardDowntimeRow = {
  durationMinutes?: number | null
  reasonCode?: string | null
  reasonName?: string | null
  setupNumber?: string | null
}

function finite(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0
}

function percent(value: number, total: number) {
  if (!(total > 0)) return 0
  return Math.round((value / total) * 10_000) / 100
}

function progressPercent(value: number, total: number) {
  return Math.min(percent(value, total), 100)
}

function dateOnly(value: string | null | undefined) {
  if (!value) return null
  const match = value.match(/^\d{4}-\d{2}-\d{2}/)
  if (!match) return null
  const parsed = new Date(`${match[0]}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

function isWorkingDay(value: Date, holidays: Set<string>) {
  return value.getUTCDay() !== 5 && !holidays.has(formatDateOnly(value))
}

function addWorkingDays(start: Date, days: number, holidays: Set<string>) {
  const result = new Date(start)
  let remaining = days
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1)
    if (isWorkingDay(result, holidays)) remaining -= 1
  }
  return result
}

function workingDaysBetween(start: Date, end: Date, holidays: Set<string>) {
  if (end <= start) return 0
  const cursor = new Date(start)
  let total = 0
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    if (cursor <= end && isWorkingDay(cursor, holidays)) total += 1
  }
  return total
}

function wholeWorkingDays(value: number | null | undefined, label: string) {
  if (value === null || value === undefined) return null
  if (!Number.isSafeInteger(value) || value < 1 || value > 365) {
    throw new Error(`${label} must be between 1 and 365 working days.`)
  }
  return value
}

export function normalizeDeliveryTargets(input: {
  jobCardOverrideWorkingDays?: number | null
  productDefaultWorkingDays?: number | null
}) {
  const productDefaultWorkingDays = wholeWorkingDays(
    input.productDefaultWorkingDays,
    "Product default"
  )
  const jobCardOverrideWorkingDays = wholeWorkingDays(
    input.jobCardOverrideWorkingDays,
    "Job Card override"
  )
  return {
    effectiveWorkingDays: jobCardOverrideWorkingDays ?? productDefaultWorkingDays,
    jobCardOverrideWorkingDays,
    productDefaultWorkingDays,
    source: jobCardOverrideWorkingDays !== null
      ? "job_card_override" as const
      : productDefaultWorkingDays !== null
        ? "product_master" as const
        : "not_set" as const,
  }
}

export function buildMaterialYield(input: {
  actualGoodPieces: number
  actualProducedPieces: number
  orderedQuantity: number
  piecesPerKg: number
  receivedKg: number
  rejectedPieces: number
  remainingKg: number
}) {
  const orderedQuantity = finite(input.orderedQuantity)
  const goodPieces = finite(input.actualGoodPieces)
  const totalProduced = finite(input.actualProducedPieces)
  const piecesPerKg = finite(input.piecesPerKg)
  if (!(piecesPerKg > 0)) {
    return {
      available: false,
      expectedPiecesFromMaterial: null,
      materialCapacityShortPieces: null,
      orderShortPieces: Math.max(orderedQuantity - goodPieces, 0),
      productionProgressPercent: progressPercent(goodPieces, orderedQuantity),
      remainingMaterialEquivalentPieces: null,
      rejectedPieces: finite(input.rejectedPieces),
      unexplainedLossPieces: null,
    }
  }
  const expectedPiecesFromMaterial = Math.max(
    Math.round(finite(input.receivedKg) * piecesPerKg),
    0
  )
  const remainingMaterialEquivalentPieces = Math.max(
    Math.round(finite(input.remainingKg) * piecesPerKg),
    0
  )
  return {
    available: true,
    expectedPiecesFromMaterial,
    materialCapacityShortPieces: Math.max(orderedQuantity - expectedPiecesFromMaterial, 0),
    orderShortPieces: Math.max(orderedQuantity - goodPieces, 0),
    productionProgressPercent: progressPercent(goodPieces, orderedQuantity),
    remainingMaterialEquivalentPieces,
    rejectedPieces: finite(input.rejectedPieces),
    unexplainedLossPieces: Math.max(
      expectedPiecesFromMaterial - remainingMaterialEquivalentPieces - totalProduced,
      0
    ),
  }
}

function elapsedMinutes(startValue: string | null | undefined, endValue: string | null | undefined) {
  if (!startValue || !endValue) return null
  const start = new Date(startValue)
  const end = new Date(endValue)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null
  return Math.round((end.getTime() - start.getTime()) / 60_000)
}

export function buildSetupTiming(input: {
  productionStartedAt?: string | null
  qualityApprovedAt?: string | null
  settingCompletedAt?: string | null
  settingStartedAt?: string | null
  targetSetupMinutes?: number | null
}) {
  const targetSetupMinutes = input.targetSetupMinutes == null
    ? null
    : finite(input.targetSetupMinutes)
  const machinistSetupMinutes = elapsedMinutes(
    input.settingStartedAt,
    input.settingCompletedAt
  )
  return {
    machinistSetupMinutes,
    machineStartWaitMinutes: elapsedMinutes(
      input.qualityApprovedAt,
      input.productionStartedAt
    ),
    qcWaitMinutes: elapsedMinutes(
      input.settingCompletedAt,
      input.qualityApprovedAt
    ),
    setupVarianceMinutes: machinistSetupMinutes === null || targetSetupMinutes === null
      ? null
      : machinistSetupMinutes - targetSetupMinutes,
    targetSetupMinutes,
  }
}

export function buildDeliveryPerformance(input: {
  actualOrProjectedDate?: string | null
  asOfDate: string
  holidayDates?: string[]
  rawMaterialCompleteDate?: string | null
  targetWorkingDays?: number | null
}) {
  const rawMaterialCompleteDate = dateOnly(input.rawMaterialCompleteDate)
  const targetWorkingDays = input.targetWorkingDays ?? null
  if (targetWorkingDays === null) {
    return { daysLate: null, rating: "-", status: "Target not set", targetDate: null }
  }
  if (!rawMaterialCompleteDate) {
    return {
      daysLate: null,
      rating: "-",
      status: "Waiting for full RM receipt",
      targetDate: null,
    }
  }
  const holidays = new Set(input.holidayDates ?? [])
  const targetDate = addWorkingDays(rawMaterialCompleteDate, targetWorkingDays, holidays)
  const comparisonDate = dateOnly(input.actualOrProjectedDate) ?? dateOnly(input.asOfDate)
  if (!comparisonDate || comparisonDate <= targetDate) {
    return {
      daysLate: 0,
      rating: "A",
      status: "On time",
      targetDate: formatDateOnly(targetDate),
    }
  }
  const daysLate = workingDaysBetween(targetDate, comparisonDate, holidays)
  const rating = daysLate <= 2 ? "B" : daysLate <= 5 ? "C" : "D"
  return {
    daysLate,
    rating,
    status: `${daysLate} working day${daysLate === 1 ? "" : "s"} late`,
    targetDate: formatDateOnly(targetDate),
  }
}

function firstDate(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort()[0] ?? null
}

function lastDate(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
}

export function buildJobCardAnalytics(input: {
  downtimeEvents: JobCardDowntimeRow[]
  orderedQuantity: number
  planRows: JobCardPlanRow[]
  sessions: JobCardSessionRow[]
}) {
  const orderedQuantity = finite(input.orderedQuantity)
  const actualProducedPieces = input.sessions.reduce(
    (total, row) => total + finite(row.totalPieces),
    0
  )
  const actualGoodPieces = input.sessions.reduce(
    (total, row) => total + finite(row.goodPieces),
    0
  )
  const rejectedPieces = input.sessions.reduce(
    (total, row) => total + finite(row.rejectedPieces),
    0
  )
  const downtimeMinutes = input.sessions.reduce(
    (total, row) => total + finite(row.downtimeMinutes),
    0
  )
  const runtimeMinutes = input.sessions.reduce(
    (total, row) => total + finite(row.runtimeMinutes),
    0
  )

  const reasonGroups = new Map<
    string,
    { code: string; minutes: number; name: string; occurrences: number }
  >()
  const setupGroups = new Map<
    string,
    { minutes: number; occurrences: number; setupNumber: string }
  >()
  for (const event of input.downtimeEvents) {
    const code = event.reasonCode?.trim() || "Uncoded"
    const reason = reasonGroups.get(code) ?? {
      code,
      minutes: 0,
      name: event.reasonName?.trim() || code,
      occurrences: 0,
    }
    reason.minutes += finite(event.durationMinutes)
    reason.occurrences += 1
    reasonGroups.set(code, reason)

    const setupNumber = event.setupNumber?.trim() || "Unassigned"
    const setup = setupGroups.get(setupNumber) ?? {
      minutes: 0,
      occurrences: 0,
      setupNumber,
    }
    setup.minutes += finite(event.durationMinutes)
    setup.occurrences += 1
    setupGroups.set(setupNumber, setup)
  }

  const setupNumbers = new Set(
    [
      ...input.planRows.map((row) => row.setupNumber?.trim()),
      ...input.sessions.map((row) => row.setupNumber?.trim()),
    ].filter((value): value is string => Boolean(value))
  )

  return {
    actualEndAt: lastDate(input.sessions.map((row) => row.endedAt)),
    actualGoodPieces,
    actualProducedPieces,
    actualStartAt: firstDate(input.sessions.map((row) => row.startedAt)),
    completionPercent: progressPercent(actualGoodPieces, orderedQuantity),
    downtimeByReason: [...reasonGroups.values()].sort(
      (left, right) => right.minutes - left.minutes || left.code.localeCompare(right.code)
    ),
    downtimeBySetup: [...setupGroups.values()].sort((left, right) =>
      left.setupNumber.localeCompare(right.setupNumber, undefined, { numeric: true })
    ),
    downtimeMinutes,
    orderedQuantity,
    plannedEndDate: lastDate(
      input.planRows.map((row) => row.plannedProductionEndDate)
    ),
    plannedStartDate: firstDate(
      input.planRows.map((row) => row.plannedProductionStartDate)
    ),
    rejectedPieces,
    rejectionPercent: percent(rejectedPieces, actualProducedPieces),
    runtimeMinutes,
    sessionCount: input.sessions.length,
    setupPerformance: [...setupNumbers]
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      .map((setupNumber) => {
        const actualGood = input.sessions
          .filter((row) => row.setupNumber?.trim() === setupNumber)
          .reduce((total, row) => total + finite(row.goodPieces), 0)
        return {
          actualGoodPieces: actualGood,
          completionPercent: percent(actualGood, orderedQuantity),
          setupNumber,
        }
      }),
  }
}
