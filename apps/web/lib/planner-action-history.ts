export type PlannerActionSourceRow = Record<string, unknown>

type PlannerActionHistoryRow = {
  Action: string
  Date: string
  "Job Card": string
  "Part Code": string
  Setups: string
  "Machine / Route": string
  Decision: string
  Reason: string
  Notes: string
}

const emptyValue = "—"

function text(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return ""
}

function record(value: unknown): PlannerActionSourceRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as PlannerActionSourceRow)
    : {}
}

function records(value: unknown) {
  return Array.isArray(value) ? value.map(record) : []
}

function uniqueText(values: unknown[]) {
  return Array.from(new Set(values.map(text).filter(Boolean)))
}

function historyRow(
  row: PlannerActionSourceRow,
  action: string,
  details: Omit<
    PlannerActionHistoryRow,
    "Action" | "Date" | "Reason" | "Notes"
  >
): PlannerActionHistoryRow {
  return {
    Action: action,
    Date: text(row.createdAt) || text(row.occurredAt) || text(row.loggedOn),
    ...details,
    Reason: text(row.reason) || emptyValue,
    Notes: text(row.remark) || emptyValue,
  }
}

function priorityHistoryRow(
  row: PlannerActionSourceRow
): PlannerActionHistoryRow {
  const setups = uniqueText(
    Array.isArray(row.confirmedSetupNumbers) ? row.confirmedSetupNumbers : []
  )
  const priority = text(row.priority)
  return historyRow(row, "Priority Change", {
    "Job Card":
      text(row.jobCardNumber) || text(row.jcNo) || text(row.target) || emptyValue,
    "Part Code": text(row.partCode) || emptyValue,
    Setups: setups.join(", ") || emptyValue,
    "Machine / Route": emptyValue,
    Decision: priority ? `${priority} priority` : emptyValue,
  })
}

function machineUnavailableHistoryRow(
  row: PlannerActionSourceRow
): PlannerActionHistoryRow {
  const interruptions = records(row.interruptedSetups)
  const placements = records(row.queuePlacements)
  const jobCards = uniqueText([
    row.jobCardNumber,
    row.jcNo,
    row.target,
    ...interruptions.map((entry) => entry.jobCardNumber),
    ...interruptions.map((entry) => entry.jcNo),
    ...placements.map((entry) => entry.targetJobCardNumber),
    ...placements.map((entry) => entry.targetJcNo),
  ])
  const partCodes = uniqueText([
    row.partCode,
    ...interruptions.map((entry) => entry.partCode),
    ...interruptions.map((entry) => entry.itemCode),
    ...placements.map((entry) => entry.targetPartCode),
  ])
  const setups = uniqueText([
    row.setupNumber,
    row.setupNo,
    ...interruptions.map((entry) => entry.setupNumber),
    ...interruptions.map((entry) => entry.setupNo),
    ...placements.map((entry) => entry.targetSetupNumber),
    ...placements.map((entry) => entry.targetSetupNo),
  ])
  const sourceMachines = uniqueText([
    row.machineNumber,
    row.machineNo,
    row.machine,
    ...interruptions.map((entry) => entry.machineNumber),
    ...interruptions.map((entry) => entry.machine),
    ...placements.map((entry) => entry.targetSourceMachineNumber),
    ...placements.map((entry) => entry.targetSourceMachine),
  ])
  const targetMachines = uniqueText([
    ...placements.map((entry) => entry.targetMachineNumber),
    ...placements.map((entry) => entry.targetMachine),
  ])
  const machinePath = [...sourceMachines, ...targetMachines].join(" → ")
  const unavailableFrom = text(row.unavailableFrom)
  const unavailableTo = text(row.unavailableTo)
  const unavailableWindow = [unavailableFrom, unavailableTo]
    .filter(Boolean)
    .join(" to ")
  return historyRow(row, "Machine Unavailable", {
    "Job Card": jobCards.join(", ") || emptyValue,
    "Part Code": partCodes.join(", ") || emptyValue,
    Setups: setups.join(", ") || emptyValue,
    "Machine / Route": machinePath || emptyValue,
    Decision: unavailableWindow
      ? `Unavailable ${unavailableWindow}`
      : "Unavailable",
  })
}

function machineSwitchHistoryRow(
  row: PlannerActionSourceRow
): PlannerActionHistoryRow {
  const interruptions = records(row.interruptedSetups)
  const placements = records(row.queuePlacements)
  const jobCards = uniqueText([
    row.jobCardNumber,
    row.jcNo,
    row.target,
    ...interruptions.map((entry) => entry.jobCardNumber),
    ...interruptions.map((entry) => entry.jcNo),
    ...placements.map((entry) => entry.targetJobCardNumber),
    ...placements.map((entry) => entry.targetJcNo),
  ])
  const partCodes = uniqueText([
    row.partCode,
    row.itemCode,
    ...placements.map((entry) => entry.targetPartCode),
  ])
  const setups = uniqueText([
    row.setupNumber,
    row.setupNo,
    ...interruptions.map((entry) => entry.setupNumber),
    ...interruptions.map((entry) => entry.setupNo),
    ...placements.map((entry) => entry.targetSetupNumber),
    ...placements.map((entry) => entry.targetSetupNo),
  ])
  const sourceMachine =
    text(row.fromMachineNumber) || text(row.fromMachine) || emptyValue
  const targetMachine =
    text(row.toMachineNumber) || text(row.toMachine) || emptyValue
  return historyRow(row, "Move Setup", {
    "Job Card": jobCards.join(", ") || emptyValue,
    "Part Code": partCodes.join(", ") || emptyValue,
    Setups: setups.join(", ") || emptyValue,
    "Machine / Route": `${sourceMachine} → ${targetMachine}`,
    Decision: "Setup moved",
  })
}

function routeChangeHistoryRow(
  row: PlannerActionSourceRow
): PlannerActionHistoryRow {
  const remainingSetups = records(row.remainingSetups)
  const setupNumbers = uniqueText(
    remainingSetups.flatMap((entry) => [entry.setupNumber, entry.setupNo])
  )
  const plannedSetups = uniqueText(
    remainingSetups
      .filter(
        (entry) =>
          entry.plan === true || text(entry.disposition).toLowerCase() === "plan"
      )
      .flatMap((entry) => [entry.setupNumber, entry.setupNo])
  )
  const skippedSetups = uniqueText(
    remainingSetups
      .filter(
        (entry) =>
          entry.plan === false ||
          text(entry.disposition).toLowerCase() === "skip"
      )
      .flatMap((entry) => [entry.setupNumber, entry.setupNo])
  )
  const decisions = [
    plannedSetups.length ? `Plan ${plannedSetups.join(", ")}` : "",
    skippedSetups.length ? `Skip ${skippedSetups.join(", ")}` : "",
  ].filter(Boolean)
  const routeCode =
    text(row.newRouteCode) ||
    text(row.newOption) ||
    text(row.toRouteCode) ||
    text(row.routeCode)
  return historyRow(row, "Route Change", {
    "Job Card":
      text(row.jobCardNumber) || text(row.jcNo) || text(row.target) || emptyValue,
    "Part Code": text(row.partCode) || emptyValue,
    Setups: setupNumbers.join(", ") || emptyValue,
    "Machine / Route": routeCode ? `Route ${routeCode}` : emptyValue,
    Decision: decisions.join("; ") || "Route changed",
  })
}

export function plannerActionHistoryRows(
  rows: readonly PlannerActionSourceRow[]
): PlannerActionHistoryRow[] {
  return rows.map((row) => {
    const actionType = text(row.actionType)
    if (actionType === "Priority") return priorityHistoryRow(row)
    if (actionType === "Machine Unavailable") {
      return machineUnavailableHistoryRow(row)
    }
    if (actionType === "Machine Switch") return machineSwitchHistoryRow(row)
    if (actionType === "Route Change") return routeChangeHistoryRow(row)
    return historyRow(row, actionType || "Planner Action", {
      "Job Card": text(row.jobCardNumber) || text(row.jcNo) || emptyValue,
      "Part Code": text(row.partCode) || emptyValue,
      Setups: text(row.setupNumber) || text(row.setupNo) || emptyValue,
      "Machine / Route": emptyValue,
      Decision: emptyValue,
    })
  })
}
