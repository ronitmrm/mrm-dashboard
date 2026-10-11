import { analysisDate, analysisToday } from "./iso-analysis-domain"

export const partyTypes = ["Not assessed", "Internal", "External"] as const
export const requirementRelevance = [
  "Not assessed",
  "Relevant",
  "Not relevant",
] as const
export const requirementBases = [
  "Not assessed",
  "Need / expectation",
  "Customer requirement",
  "Contractual requirement",
  "Legal / regulatory requirement",
  "Other",
] as const
export const requirementLifecycles = ["Draft", "Active", "Inactive"] as const
export const monitoringOutcomes = ["Met", "Partly met", "Not met"] as const
export class InterestedPartiesError extends Error {}
export const monitoringToday = analysisToday
export function requirementReference(number: number) {
  return `IPR-${String(number).padStart(4, "0")}`
}
export type RequirementFields = {
  partyGroup: string
  partyType: (typeof partyTypes)[number]
  scope: string
  requirement: string
  basis: (typeof requirementBases)[number]
  sourceReference: string
  relevance: (typeof requirementRelevance)[number]
  relevanceReason: string
  department: string
  ownerUserId: string | null
  acceptanceCriteria: string
  monitoringMethod: string
  frequency: string
  nextReviewOn: string | null
  identifiedOn: string | null
  climateNotes: string
  relatedReference: string
  lifecycle: (typeof requirementLifecycles)[number]
  inactiveReason: string
}
export type MonitoringFields = {
  observedOn: string
  observations: string
  evidence: string
  outcome: (typeof monitoringOutcomes)[number]
  followUp: string
  followUpDueOn: string | null
  relatedReference: string
}
export type RequirementSource = {
  fileName: string
  fileHash: string
  sheet: string
  row: number
  formCode: string
  cells: Record<string, string>
}
export function monitoringText(
  value: unknown,
  label: string,
  required = false
) {
  const text = typeof value === "string" ? value.trim() : ""
  if (text.length > 4000 || (required && !text))
    throw new InterestedPartiesError(
      `Enter ${label.toLowerCase()} within 4,000 characters.`
    )
  return text
}
export function monitoringDate(value: unknown) {
  try {
    return analysisDate(value)
  } catch {
    throw new InterestedPartiesError("Enter a valid calendar date.")
  }
}
function data(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InterestedPartiesError("Check the form values.")
  return value as Record<string, unknown>
}
function choice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  label: string
): T[number] {
  const found = choices.find((item) => item === value)
  if (!found) throw new InterestedPartiesError(`Choose ${label.toLowerCase()}.`)
  return found
}
export function parseRequirementFields(input: unknown): RequirementFields {
  const fields = data(input)
  const ownerUserId =
    monitoringText(fields.ownerUserId, "Responsible staff") || null
  if (
    ownerUserId &&
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ownerUserId)
  )
    throw new InterestedPartiesError("Choose a responsible staff account.")
  const result: RequirementFields = {
    partyGroup: monitoringText(
      fields.partyGroup,
      "Interested party / group",
      true
    ),
    partyType: choice(fields.partyType, partyTypes, "Party type"),
    scope: monitoringText(fields.scope, "Specific party / scope"),
    requirement: monitoringText(
      fields.requirement,
      "Requirement / expectation",
      true
    ),
    basis: choice(fields.basis, requirementBases, "Requirement basis"),
    sourceReference: monitoringText(
      fields.sourceReference,
      "Requirement source"
    ),
    relevance: choice(fields.relevance, requirementRelevance, "QMS relevance"),
    relevanceReason: monitoringText(fields.relevanceReason, "Relevance reason"),
    department: monitoringText(fields.department, "Responsible department"),
    ownerUserId,
    acceptanceCriteria: monitoringText(
      fields.acceptanceCriteria,
      "Acceptance criteria"
    ),
    monitoringMethod: monitoringText(
      fields.monitoringMethod,
      "Monitoring method"
    ),
    frequency: monitoringText(fields.frequency, "Frequency / event trigger"),
    nextReviewOn: monitoringDate(fields.nextReviewOn),
    identifiedOn: monitoringDate(fields.identifiedOn),
    climateNotes: monitoringText(
      fields.climateNotes,
      "Climate-related considerations"
    ),
    relatedReference: monitoringText(
      fields.relatedReference,
      "Related records"
    ),
    lifecycle: choice(fields.lifecycle, requirementLifecycles, "Record state"),
    inactiveReason: monitoringText(fields.inactiveReason, "Inactive reason"),
  }
  if (result.relevance !== "Not assessed" && !result.relevanceReason)
    throw new InterestedPartiesError("Explain the relevance decision.")
  if (result.lifecycle === "Inactive" && !result.inactiveReason)
    throw new InterestedPartiesError("Record why this requirement is inactive.")
  if (
    result.lifecycle === "Active" &&
    (result.relevance !== "Relevant" ||
      result.partyType === "Not assessed" ||
      result.basis === "Not assessed" ||
      !result.relevanceReason ||
      !result.ownerUserId ||
      !result.department ||
      !result.acceptanceCriteria ||
      !result.monitoringMethod ||
      !result.frequency ||
      !result.nextReviewOn)
  )
    throw new InterestedPartiesError(
      "Before activation, record relevance, party type, basis, responsible staff/department, acceptance criteria, monitoring method, frequency and planned review date."
    )
  return result
}
export function parseMonitoringFields(input: unknown): MonitoringFields {
  const fields = data(input),
    observedOn = monitoringDate(fields.observedOn)
  if (!observedOn || observedOn > monitoringToday())
    throw new InterestedPartiesError(
      "Record the actual monitoring date, today or earlier."
    )
  const result: MonitoringFields = {
    observedOn,
    observations: monitoringText(
      fields.observations,
      "Monitoring observations / result",
      true
    ),
    evidence: monitoringText(
      fields.evidence,
      "Evidence reference / location",
      true
    ),
    outcome: choice(fields.outcome, monitoringOutcomes, "Monitoring result"),
    followUp: monitoringText(fields.followUp, "Follow-up action"),
    followUpDueOn: monitoringDate(fields.followUpDueOn),
    relatedReference: monitoringText(
      fields.relatedReference,
      "Related action / record reference"
    ),
  }
  if (result.outcome !== "Met" && (!result.followUp || !result.followUpDueOn))
    throw new InterestedPartiesError(
      "Record a follow-up action and target date for the unmet requirement."
    )
  if (result.followUpDueOn && result.followUpDueOn < observedOn)
    throw new InterestedPartiesError(
      "Follow-up target cannot precede the monitoring date."
    )
  return result
}
export function requirementAttention(
  record: {
    lifecycle: RequirementFields["lifecycle"]
    planRevision: number
    pendingReviewId: string | null
    latestReviewStatus: string | null
    verifiedOutcome: MonitoringFields["outcome"] | null
    verifiedPlanRevision: number | null
    nextReviewOn: string | null
    followUpDueOn?: string | null
  },
  today = monitoringToday()
) {
  if (record.lifecycle !== "Active") return record.lifecycle
  if (record.pendingReviewId) return "Awaiting QA"
  if (record.latestReviewStatus === "Returned") return "Monitoring returned"
  if (record.verifiedOutcome && record.verifiedOutcome !== "Met")
    return record.followUpDueOn && record.followUpDueOn < today
      ? "Follow-up overdue"
      : "Follow-up required"
  if (record.verifiedPlanRevision !== record.planRevision)
    return "Needs monitoring"
  if (record.nextReviewOn && record.nextReviewOn < today)
    return "Review overdue"
  if (record.nextReviewOn === today) return "Review due"
  return "Monitoring current"
}
