export const analysisCategories = {
  PEST: ["Political", "Economic", "Social", "Technological"],
  SWOT: ["Strength", "Weakness", "Opportunity", "Threat"],
} as const

export type AnalysisKind = keyof typeof analysisCategories
export type AnalysisCategory = (typeof analysisCategories)[AnalysisKind][number]
export type AnalysisStatus = "Open" | "In Progress" | "Completed" | "Closed"
export type AnalysisOperation =
  | "progress"
  | "complete"
  | "verify"
  | "return"
  | "reopen"
  | "review"
export class AnalysisError extends Error {}

export type AnalysisFields = {
  kind: AnalysisKind
  analysisYear: number
  category: AnalysisCategory
  description: string
  actionPlan: string
  department: string
  ownerUserId: string | null
  identifiedOn: string | null
  dueOn: string | null
  reviewedOn: string | null
  nextReviewOn: string | null
}
export type AnalysisSource = {
  fileName: string
  sha256: string
  sheet: string
  row: number
  documentNumber: string
  columns: Record<string, string>
}

export function isAnalysisKind(value: unknown): value is AnalysisKind {
  return value === "PEST" || value === "SWOT"
}
function text(value: unknown, label: string, required = false) {
  const result = typeof value === "string" ? value.trim() : ""
  if ((required && !result) || result.length > 4000)
    throw new AnalysisError(
      `${label} is required and must be within 4,000 characters.`
    )
  return result
}
export function analysisDate(value: unknown): string | null {
  if (value === "" || value === null || value === undefined) return null
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new AnalysisError("Enter a valid calendar date.")
  return value
}
export function parseAnalysisFields(input: unknown): AnalysisFields {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AnalysisError("Analysis details are required.")
  const data = input as Record<string, unknown>
  if (!isAnalysisKind(data.kind))
    throw new AnalysisError("Choose PEST or SWOT.")
  const categories: readonly string[] = analysisCategories[data.kind]
  if (typeof data.category !== "string" || !categories.includes(data.category))
    throw new AnalysisError("Choose a category for this analysis type.")
  const analysisYear = Number(data.analysisYear)
  if (
    !Number.isInteger(analysisYear) ||
    analysisYear < 2000 ||
    analysisYear > 2100
  )
    throw new AnalysisError("Enter an analysis year from 2000 to 2100.")
  const ownerUserId = text(data.ownerUserId, "Responsible staff") || null
  if (
    ownerUserId &&
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ownerUserId)
  )
    throw new AnalysisError("Choose a responsible staff account.")
  return {
    kind: data.kind,
    analysisYear,
    category: data.category as AnalysisCategory,
    description: text(data.description, "Issue / insight", true),
    actionPlan: text(data.actionPlan, "Action plan", true),
    department: text(data.department, "Responsible department"),
    ownerUserId,
    identifiedOn: analysisDate(data.identifiedOn),
    dueOn: analysisDate(data.dueOn),
    reviewedOn: analysisDate(data.reviewedOn),
    nextReviewOn: analysisDate(data.nextReviewOn),
  }
}
export function nextAnalysisStatus(
  status: AnalysisStatus,
  operation: AnalysisOperation
): AnalysisStatus {
  if (operation === "review") return status
  if (
    operation === "progress" &&
    (status === "Open" || status === "In Progress")
  )
    return "In Progress"
  if (operation === "complete" && status !== "Closed") return "Completed"
  if (operation === "verify" && status === "Completed") return "Closed"
  if (operation === "return" && status === "Completed") return "In Progress"
  if (operation === "reopen" && status === "Closed") return "In Progress"
  throw new AnalysisError(
    "This action is unavailable for the current status. Refresh the record."
  )
}
export function analysisReference(kind: AnalysisKind, number: number) {
  return `${kind}-${String(number).padStart(5, "0")}`
}
export function analysisToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
}
export function nextMonthlyReview(date: string) {
  const value = new Date(`${date}T00:00:00Z`)
  const day = value.getUTCDate()
  value.setUTCDate(1)
  value.setUTCMonth(value.getUTCMonth() + 1)
  const lastDay = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)
  ).getUTCDate()
  value.setUTCDate(Math.min(day, lastDay))
  return value.toISOString().slice(0, 10)
}
