export const requirementDetails = [
  ["partyType", "Internal / external"],
  ["scope", "Specific party / scope"],
  ["basis", "Requirement basis"],
  ["sourceReference", "Requirement source"],
  ["relevance", "QMS relevance"],
  ["relevanceReason", "Relevance decision reason"],
  ["department", "Responsible department"],
  ["ownerName", "Responsible staff"],
  ["identifiedOn", "Requirement identified on"],
  ["acceptanceCriteria", "Acceptance criteria / expected result"],
  ["monitoringMethod", "Monitoring method"],
  ["frequency", "Frequency / event trigger"],
  ["nextReviewOn", "Planned next review"],
  ["climateNotes", "Climate-related considerations"],
  ["relatedReference", "Related records"],
  ["inactiveReason", "Inactive reason"],
] as const
export function requirementTone(state: string) {
  if (state === "Monitoring current") return "positive"
  if (state === "Inactive") return "inactive"
  if (state === "Review overdue" || state === "Follow-up overdue")
    return "danger"
  if (state === "Draft") return "information"
  return "warning"
}
