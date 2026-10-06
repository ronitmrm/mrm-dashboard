type PlanningRow = Record<string, unknown>

const text = (value: unknown) => String(value ?? "").trim()

function rowValue(row: PlanningRow, keys: string[]) {
  return keys.map((key) => text(row[key])).find(Boolean) ?? ""
}

export function dispatchReadyJobCards(
  jobCards: PlanningRow[],
) {
  const ready = new Map<string, { jobCard: string; availablePieces: number; dispatchedPieces: number; finishedGoodPieces: number }>()
  for (const row of jobCards) {
    const jobCard = rowValue(row, ["jcNo", "JobCardNo", "jobCard"])
    const dispatchStatus = text(row.dispatchStatus).toLowerCase()
    const key = jobCard.toLocaleLowerCase("en-IN")
    const availablePieces = Number(row.dispatchAvailablePieces)
    if (
      !jobCard
      || ["shifted to dispatch", "dispatched", "dispatch approved"].includes(dispatchStatus)
      || !Number.isSafeInteger(availablePieces)
      || availablePieces <= 0
    ) continue
    ready.set(key, {
      jobCard,
      availablePieces,
      dispatchedPieces: Number(row.dispatchedPieces) || 0,
      finishedGoodPieces: Number(row.finalSetupGoodPieces) || 0,
    })
  }

  return [...ready.values()].sort((left, right) =>
    left.jobCard.localeCompare(right.jobCard, "en-IN", { numeric: true })
  )
}
