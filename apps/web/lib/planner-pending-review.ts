import { isActivePlannerDecision } from "@workspace/db/planning-rules"
import { istDateValue } from "./date-time"

type PlannerPendingRow = Record<string, unknown>

export function machineIssueNeedsReview(row: PlannerPendingRow, today: string) {
  const end = rowText(row, "unavailableTo") || rowText(row, "unavailableFrom")
  const date = /^\d{4}-\d{2}-\d{2}/.test(end) ? end.slice(0, 10) : istDateValue(end)
  return Boolean(date && date < today)
}

export function openMachineIssues(rows: readonly PlannerPendingRow[]) {
  return rows.filter((row) => !rowText(row, "availableOn") && isActivePlannerDecision(rowText(row, "status")))
}

const planActionLabels: Record<string, string> = {
  delay: "Delay plan",
  shift_all: "Shift all affected work",
  shift_required: "Shift required",
}

const planningMethodLabels: Record<string, string> = {
  review_then_plan: "Review before planning",
  system_recalculate: "System recalculation",
}

export function plannerPendingMachineIssueRows(rows: readonly PlannerPendingRow[]) {
  return rows.map((row) => {
    const interruptedCount = rowArray(row, "interruptedSetups").length
    const placementCount = rowArray(row, "queuePlacements").length

    return {
      Machine: rowText(row, "machineNo", "machine"),
      From: rowText(row, "unavailableFrom"),
      To: rowText(row, "unavailableTo") || rowText(row, "unavailableFrom"),
      Status: rowText(row, "status") || "Active",
      "Plan Action": codeLabel(rowText(row, "rescheduleAction"), planActionLabels),
      "Planning Method": codeLabel(rowText(row, "planningMode"), planningMethodLabels),
      "Affected Work": affectedWorkLabel(interruptedCount, placementCount),
      Reason: rowText(row, "reason"),
      "Logged On": rowText(row, "createdAt", "loggedOn"),
    }
  })
}

function affectedWorkLabel(interruptedCount: number, placementCount: number) {
  const details = [
    interruptedCount
      ? `${interruptedCount} interrupted setup${interruptedCount === 1 ? "" : "s"}`
      : "",
    placementCount
      ? `${placementCount} queue placement${placementCount === 1 ? "" : "s"}`
      : "",
  ].filter(Boolean)

  return details.join(" · ") || "No setup impact recorded"
}

function codeLabel(value: string, labels: Record<string, string>) {
  if (!value) return "Not specified"
  const key = value.trim().toLowerCase()
  return labels[key] ?? `${key.charAt(0).toUpperCase()}${key.slice(1).replaceAll("_", " ")}`
}

function rowArray(row: PlannerPendingRow, key: string) {
  const value = rowValue(row, key)
  return Array.isArray(value) ? value : []
}

function rowText(row: PlannerPendingRow, ...keys: string[]) {
  for (const key of keys) {
    const value = rowValue(row, key)
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return ""
}

function rowValue(row: PlannerPendingRow, key: string) {
  const direct = row[key]
  if (direct !== undefined && direct !== null && direct !== "") return direct
  const payload = row.payload
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as PlannerPendingRow)[key]
    : undefined
}
