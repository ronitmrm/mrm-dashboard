type PlanningRow = Record<string, unknown>

const text = (value: unknown) => String(value ?? "").trim()

function rowValue(row: PlanningRow, keys: string[]) {
  return keys.map((key) => text(row[key])).find(Boolean) ?? ""
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
