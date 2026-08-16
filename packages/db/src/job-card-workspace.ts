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
    completionPercent: percent(actualGoodPieces, orderedQuantity),
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
