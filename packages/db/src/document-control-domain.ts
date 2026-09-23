import type { BrandingType } from "./branding-domain"

export const documentTypes = [
  "sop-procedure",
  "policy-manual",
  "work-instruction",
  "form-format",
  "plan",
  "register-list",
  "checklist",
  "technical-document",
  "external-document",
  "other-controlled-document",
] as const
export type DocumentType = (typeof documentTypes)[number]

export const documentTypeLabels = {
  "sop-procedure": "SOP / Procedure",
  "policy-manual": "Policy / Manual",
  "work-instruction": "Work Instruction",
  "form-format": "Form / Format",
  plan: "Plan",
  "register-list": "Register / List",
  checklist: "Checklist",
  "technical-document": "Technical Document",
  "external-document": "External Document",
  "other-controlled-document": "Other Controlled Document",
} satisfies Record<DocumentType, string>

export const documentUseStatuses = ["in-use", "not-in-use"] as const
export type DocumentUseStatus = (typeof documentUseStatuses)[number]

export const dataFrequencyTypes = [
  "event-based",
  "scheduled-interval",
  "as-required",
  "not-applicable",
] as const
export type DataFrequencyType = (typeof dataFrequencyTypes)[number]

export const dataFrequencyLabels = {
  "event-based": "Per transaction / event",
  "scheduled-interval": "Scheduled interval",
  "as-required": "As required",
  "not-applicable": "Not applicable",
} satisfies Record<DataFrequencyType, string>

export const documentWorkflowStates = [
  "draft",
  "pending-approval",
  "approved",
  "released",
] as const
export type DocumentWorkflowState = (typeof documentWorkflowStates)[number]

export type RecordLocation = {
  kind: "mrm" | "other-system" | "physical"
  label: string
  href?: string
}

export type DocumentControlMetadata = {
  contentAccess: "all-signed-in" | "restricted"
  dataFrequencyDetail: string
  dataFrequencyIntervalDays: number | null
  dataFrequencyType: DataFrequencyType
  dataRetention: string
  documentType: DocumentType
  recordLocations: RecordLocation[]
  responsibleRole: string
  reviewCycleMonths: number | null
  useStatus: DocumentUseStatus
}

function enumValue<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  label: string
): Values[number] {
  const match = values.find((entry) => entry === value)
  if (!match) throw new Error(`${label} is invalid.`)
  return match
}

function boundedText(value: unknown, label: string, max: number) {
  const result = String(value ?? "").trim()
  if (result.length > max) throw new Error(`${label} is too long.`)
  return result
}

export function defaultDocumentType(type: BrandingType): DocumentType {
  if (type === "sop") return "sop-procedure"
  if (type === "policy") return "policy-manual"
  if (type === "work-instruction") return "work-instruction"
  return "other-controlled-document"
}

export function parseDocumentControlMetadata(
  value: unknown
): DocumentControlMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Document control details are invalid.")
  const input = value as Record<string, unknown>
  const reviewCycleValue = String(input.reviewCycleMonths ?? "").trim()
  const reviewCycleMonths = reviewCycleValue ? Number(reviewCycleValue) : null
  if (
    reviewCycleMonths !== null &&
    (!Number.isSafeInteger(reviewCycleMonths) || reviewCycleMonths <= 0)
  )
    throw new Error("Review cycle must be a positive number of months.")
  const intervalValue = String(input.dataFrequencyIntervalDays ?? "").trim()
  let dataFrequencyIntervalDays = intervalValue ? Number(intervalValue) : null
  if (
    dataFrequencyIntervalDays !== null &&
    (!Number.isSafeInteger(dataFrequencyIntervalDays) ||
      dataFrequencyIntervalDays <= 0)
  )
    throw new Error("Scheduled interval must be a positive number of days.")
  const dataFrequencyType = enumValue(
    input.dataFrequencyType,
    dataFrequencyTypes,
    "Data frequency"
  )
  if (dataFrequencyType === "scheduled-interval" && !dataFrequencyIntervalDays)
    throw new Error("Enter the scheduled interval in days.")
  if (dataFrequencyType !== "scheduled-interval")
    dataFrequencyIntervalDays = null
  if (
    !Array.isArray(input.recordLocations) ||
    input.recordLocations.length > 20
  )
    throw new Error("Record locations are invalid.")
  const recordLocations = input.recordLocations.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new Error("Record location is invalid.")
    const location = entry as Record<string, unknown>
    const kind = enumValue(
      location.kind,
      ["mrm", "other-system", "physical"] as const,
      "Record location type"
    )
    const label = boundedText(location.label, "Record location", 240)
    if (!label) throw new Error("Record location is required.")
    const href = boundedText(location.href, "Record link", 1000)
    if (href && !/^https?:\/\//i.test(href) && !href.startsWith("/"))
      throw new Error("Record link must be an approved web or MRM link.")
    return { kind, label, ...(href ? { href } : {}) }
  })
  return {
    contentAccess: enumValue(
      input.contentAccess,
      ["all-signed-in", "restricted"] as const,
      "Content access"
    ),
    dataFrequencyDetail: boundedText(
      input.dataFrequencyDetail,
      "Data frequency detail",
      240
    ),
    dataFrequencyIntervalDays,
    dataFrequencyType,
    dataRetention: boundedText(input.dataRetention, "Data retention", 240),
    documentType: enumValue(input.documentType, documentTypes, "Document type"),
    recordLocations,
    responsibleRole: boundedText(
      input.responsibleRole,
      "Responsible role",
      160
    ),
    reviewCycleMonths,
    useStatus: enumValue(input.useStatus, documentUseStatuses, "Use status"),
  }
}

export function documentRevisionLabel(revision: number) {
  return String(revision).padStart(2, "0")
}

export function documentNumber(sequence: number) {
  if (!Number.isSafeInteger(sequence) || sequence < 1)
    throw new Error("Document sequence is invalid.")
  return `MRM-QA-${String(sequence).padStart(3, "0")}`
}
