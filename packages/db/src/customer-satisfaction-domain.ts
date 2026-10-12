import { analysisDate } from "./iso-analysis-domain"
export class CustomerSatisfactionError extends Error {}
export const satisfactionTextFields = {
  title: "Report Title",
  customerScope: "Customer Group / Scope",
  method: "Collection / Monitoring Method",
  coverage: "Coverage, Sample & Limitations",
  findings: "Findings / Customer Feedback",
  result: "Result & Rating Scale",
  target: "Target / Acceptance Criteria",
  trend: "Trend / Comparison with Previous Period",
  conclusion: "Conclusion / Decisions",
} as const
export type SatisfactionFields = Record<
  keyof typeof satisfactionTextFields,
  string
> & {
  customerId: string | null
  ownerUserId: string | null
  periodFrom: string | null
  periodTo: string | null
  nextReviewOn: string | null
  followUpRequired: boolean
  analysisId: string | null
}
export function satisfactionText(value: unknown, required = false) {
  const text = typeof value === "string" ? value.trim() : ""
  if (text.length > 4000 || (required && !text))
    throw new CustomerSatisfactionError(
      "Enter required details within 4,000 characters."
    )
  return text
}
function uuid(value: unknown) {
  const id = satisfactionText(value)
  if (!id) return null
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
    throw new CustomerSatisfactionError(
      "Choose an available customer, owner or follow-up action."
    )
  return id
}
export function parseSatisfaction(input: unknown): SatisfactionFields {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new CustomerSatisfactionError("Report details are required.")
  const data = input as Record<string, unknown>
  const texts = Object.fromEntries(
    Object.keys(satisfactionTextFields).map((key) => [
      key,
      satisfactionText(data[key], key === "title"),
    ])
  ) as Record<keyof typeof satisfactionTextFields, string>
  const fields = {
    ...texts,
    customerId: uuid(data.customerId),
    ownerUserId: uuid(data.ownerUserId),
    periodFrom: analysisDate(data.periodFrom),
    periodTo: analysisDate(data.periodTo),
    nextReviewOn: analysisDate(data.nextReviewOn),
    followUpRequired:
      data.followUpRequired === true || data.followUpRequired === "yes",
    analysisId: uuid(data.analysisId),
  }
  if (
    fields.periodFrom &&
    fields.periodTo &&
    fields.periodFrom > fields.periodTo
  )
    throw new CustomerSatisfactionError(
      "Reporting period end must be on or after its start."
    )
  return fields
}
export function requireSatisfactionSubmission(
  fields: SatisfactionFields,
  hasReport: boolean
) {
  if (
    !fields.ownerUserId ||
    !(fields.customerId || fields.customerScope) ||
    !fields.periodFrom ||
    !fields.periodTo ||
    !fields.method ||
    !fields.coverage ||
    !fields.findings ||
    !fields.trend ||
    !fields.conclusion ||
    !fields.nextReviewOn ||
    !hasReport
  )
    throw new CustomerSatisfactionError(
      "Record customer/scope, period, responsible staff, method, coverage, findings, trend, conclusion, next review and upload the report before submission."
    )
  if (fields.followUpRequired && !fields.analysisId)
    throw new CustomerSatisfactionError(
      "Link the ISO follow-up action required by these findings."
    )
}
