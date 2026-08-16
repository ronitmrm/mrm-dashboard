type PlanningRow = Record<string, unknown>

export type JobCardActionAssignment = {
  jobCard: string
  machine: string
  setupNo: string
}

const text = (value: unknown) => String(value ?? "").trim()
const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0

function rowValue(row: PlanningRow, keys: string[]) {
  return keys.map((key) => text(row[key])).find(Boolean) ?? ""
}

function assignmentRank(row: PlanningRow) {
  const status = text(row.runningStatus).toLowerCase()
  const stage = text(row.shopFloorStage).toLowerCase()
  if (stage === "item_complete" || status === "complete") return -1
  if (
    status === "running"
    || numeric(row.rawRows) > 0
    || numeric(row.rawOutputQty) > 0
    || numeric(row.rawActualQty) > 0
  ) return 3
  if (status === "setup complete") return 2
  if (stage) return 1
  return 0
}

function isCompletedSetup(row: PlanningRow) {
  return (
    text(row.shopFloorStage).toLowerCase() === "item_complete"
    || text(row.runningStatus).toLowerCase() === "complete"
  )
}

export function dispatchReadyJobCards(
  jobCards: PlanningRow[],
  plannedRows: PlanningRow[],
) {
  const plansByJobCard = new Map<string, PlanningRow[]>()

  for (const row of plannedRows) {
    const jobCard = rowValue(row, ["jcNo", "JobCardNo", "jobCard"])
    const setupNo = rowValue(row, ["setupNo", "setupNumber", "SETUP NO.", "SETUP NO"])
    if (!jobCard || !setupNo) continue
    const key = jobCard.toLocaleLowerCase("en-IN")
    plansByJobCard.set(key, [...(plansByJobCard.get(key) ?? []), row])
  }

  const ready = new Map<string, string>()
  for (const row of jobCards) {
    const jobCard = rowValue(row, ["jcNo", "JobCardNo", "jobCard"])
    const dispatchStatus = text(row.dispatchStatus).toLowerCase()
    const key = jobCard.toLocaleLowerCase("en-IN")
    const plans = plansByJobCard.get(key) ?? []
    if (
      !jobCard
      || ["shifted to dispatch", "dispatched", "dispatch approved"].includes(dispatchStatus)
      || !plans.length
      || !plans.every(isCompletedSetup)
    ) continue
    ready.set(key, jobCard)
  }

  return [...ready.values()].sort((left, right) =>
    left.localeCompare(right, "en-IN", { numeric: true })
  )
}

export function jobCardActionAssignments(rows: PlanningRow[]): JobCardActionAssignment[] {
  const assignments = new Map<string, { assignment: JobCardActionAssignment; index: number; rank: number }>()

  rows.forEach((row, index) => {
    const machine = rowValue(row, ["machine", "machineNo", "MACHINE NO", "M/C NO", "MACHINE NO."])
    const jobCard = rowValue(row, ["jcNo", "JobCardNo", "jobCard"])
    const setupNo = rowValue(row, ["setupNo", "setupNumber", "SETUP NO.", "SETUP NO"])
    const rank = assignmentRank(row)
    if (!machine || !jobCard || !setupNo || rank < 0) return

    const key = machine.toLowerCase()
    const current = assignments.get(key)
    if (current && (current.rank > rank || (current.rank === rank && current.index < index))) return
    assignments.set(key, { assignment: { jobCard, machine, setupNo }, index, rank })
  })

  return [...assignments.values()]
    .map(({ assignment }) => assignment)
    .sort((left, right) => left.machine.localeCompare(right.machine, undefined, { numeric: true }))
}
