export type ProductionSessionRow = Record<string, unknown>

export type ProductionSessionMachineOption = {
  machineNumber: string
  plan: ProductionSessionRow
  session?: ProductionSessionRow
}

type ProductionSessionActionContext = {
  productionDate?: string
  shift?: string
}

const generalFloors = new Set([
  "conventional",
  "conventional-02",
  "forging",
])

function productionClock(instant: Date) {
  if (Number.isNaN(instant.getTime())) {
    throw new Error("Production time is invalid.")
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).formatToParts(instant)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minutes: (Number(value("hour")) % 24) * 60 + Number(value("minute")),
  }
}

function moveDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function productionSessionActionDefaults(
  productionFloorCode: string,
  instant: Date,
  context: ProductionSessionActionContext = {}
) {
  const floor = productionFloorCode.trim().toLowerCase()
  const clock = productionClock(instant)
  const contextualDate = /^\d{4}-\d{2}-\d{2}$/.test(context.productionDate ?? "")
    ? context.productionDate!
    : undefined

  if (floor === "cnc") {
    const activeShift = context.shift === "A" || context.shift === "B" || context.shift === "C"
      ? context.shift
      : clock.minutes >= 6 * 60 && clock.minutes < 14 * 60
        ? "A"
        : clock.minutes >= 14 * 60 && clock.minutes < 22 * 60
          ? "B"
          : "C"
    const productionDate = contextualDate ?? (
      activeShift === "C" && clock.minutes < 6 * 60
        ? moveDate(clock.date, -1)
        : clock.date
    )
    const times = {
      A: ["06:00", "14:00"],
      B: ["14:00", "22:00"],
      C: ["22:00", "06:00"],
    } as const
    const [startTime, endTime] = times[activeShift]
    return {
      endAt: `${activeShift === "C" ? moveDate(productionDate, 1) : productionDate}T${endTime}`,
      endReason: "shift_end" as const,
      startAt: `${productionDate}T${startTime}`,
    }
  }

  const productionDate = contextualDate ?? clock.date
  if (generalFloors.has(floor)) {
    return {
      endAt: `${productionDate}T20:00`,
      endReason: "shift_end" as const,
      startAt: `${productionDate}T08:30`,
    }
  }

  const localNow = new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
  return { endAt: localNow, endReason: "shift_end" as const, startAt: localNow }
}

function text(value: unknown) {
  return String(value ?? "").trim()
}

function first(row: ProductionSessionRow, keys: readonly string[]) {
  return keys.map((key) => text(row[key])).find(Boolean) ?? ""
}

function machineNumber(row: ProductionSessionRow) {
  return first(row, ["machineNumber", "machineNo", "machine", "machineCode"])
}

function jobCardNumber(row: ProductionSessionRow) {
  return first(row, ["jobCardNumber", "jobCard", "jcNo", "JC NO."])
}

function partCode(row: ProductionSessionRow) {
  return first(row, ["partCode", "partNo", "itemCode", "partUid"])
}

function optionNumber(row: ProductionSessionRow) {
  return first(row, ["optionNumber", "optionNo"])
}

function setupNumber(row: ProductionSessionRow) {
  return first(row, ["setupNumber", "setupNo", "operationSetupCode"])
}

function planIsRunning(row: ProductionSessionRow) {
  const stage = text(row.shopFloorStage).toLowerCase()
  const status = text(row.runningStatus).toLowerCase()
  return (
    stage !== "item_complete" &&
    (status === "running" ||
      ["quality_approval", "operator_started", "worker_start"].includes(stage))
  )
}

function currentPlan(rows: readonly ProductionSessionRow[]) {
  return (
    rows.find(planIsRunning) ??
    rows.find((row) => text(row.shopFloorStage).toLowerCase() !== "item_complete")
  )
}

export function productionSessionStartOptions({
  planRows,
  sessions,
}: {
  planRows: readonly ProductionSessionRow[]
  sessions: readonly ProductionSessionRow[]
}): ProductionSessionMachineOption[] {
  const plansByMachine = new Map<string, ProductionSessionRow[]>()
  for (const row of planRows) {
    const key = machineNumber(row).toLocaleLowerCase("en-IN")
    if (!key) continue
    plansByMachine.set(key, [...(plansByMachine.get(key) ?? []), row])
  }

  const openSessions = new Map<string, ProductionSessionRow>()
  for (const row of sessions) {
    if (text(row.status).toLowerCase() !== "open") continue
    const key = machineNumber(row).toLocaleLowerCase("en-IN")
    if (key) openSessions.set(key, row)
  }
  const options: ProductionSessionMachineOption[] = []
  const addedMachines = new Set<string>()

  for (const [key, rows] of plansByMachine) {
    const plan = currentPlan(rows)
    const session = openSessions.get(key)
    if (!plan || (!session && !planIsRunning(plan))) continue
    options.push({
      machineNumber: machineNumber(plan),
      plan,
      session,
    })
    addedMachines.add(key)
  }

  for (const [key, session] of openSessions) {
    if (addedMachines.has(key)) continue
    options.push({ machineNumber: machineNumber(session), plan: session, session })
  }

  return options.sort((left, right) =>
    left.machineNumber.localeCompare(right.machineNumber, "en-IN", {
      numeric: true,
    })
  )
}

export function productionSessionCarriedStartCount(
  plan: ProductionSessionRow,
  sessions: readonly ProductionSessionRow[]
) {
  const previous = sessions
    .filter(
      (session) =>
        text(session.status).toLowerCase() === "closed" &&
        machineNumber(session).toLowerCase() === machineNumber(plan).toLowerCase()
    )
    .sort((left, right) => text(right.endedAt).localeCompare(text(left.endedAt)))[0]

  if (
    !previous ||
    text(previous.measurementMethod).toLowerCase() !== "counter" ||
    !text(previous.endCount) ||
    jobCardNumber(previous).toLowerCase() !== jobCardNumber(plan).toLowerCase() ||
    partCode(previous).toLowerCase() !== partCode(plan).toLowerCase() ||
    optionNumber(previous).toLowerCase() !== optionNumber(plan).toLowerCase() ||
    setupNumber(previous).toLowerCase() !== setupNumber(plan).toLowerCase()
  ) {
    return undefined
  }

  return previous.endCount
}
