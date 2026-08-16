export type ProductionSessionRow = Record<string, unknown>

export type ProductionSessionMachineOption = {
  machineNumber: string
  plan: ProductionSessionRow
  session?: ProductionSessionRow
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
