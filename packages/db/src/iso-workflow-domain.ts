export const isoModules = {
  pest: { label: "PEST Analysis", href: "/iso-document/analysis/pest" },
  swot: { label: "SWOT Analysis", href: "/iso-document/analysis/swot" },
  risk: { label: "Risk-Based Thinking", href: "/iso-document/analysis/risk" },
  "management-review": {
    label: "Management Review Meetings",
    href: "/iso-document/management-review",
  },
  "interested-parties": {
    label: "Interested Parties Requirements",
    href: "/iso-document/interested-parties",
  },
  sipoc: { label: "SIPOC Process Maps", href: "/iso-document/sipoc" },
  "customer-satisfaction": {
    label: "Customer Satisfaction Reports",
    href: "/iso-document/customer-satisfaction",
  },
  "measuring-instruments": {
    label: "Measuring Instrument Register",
    href: "/iso-document/measuring-instruments",
  },
  maintenance: {
    label: "Maintenance",
    href: "/iso-document/machine-maintenance-plan",
  },
  calibration: {
    label: "Calibration Plan",
    href: "/iso-document/calibration-plan",
  },
  rejections: { label: "Rejection Register", href: "/iso-document/rejections" },
} as const
export type IsoModule = keyof typeof isoModules
export type IsoTaskKind =
  | "analysis"
  | "analysis-review"
  | "meeting"
  | "meeting-action"
  | "interested-party"
  | "sipoc"
  | "satisfaction"
  | "document"
  | "document-review"
  | "record-check"
  | "action"
  | "maintenance"
  | "asset-maintenance"
  | "calibration"
export type IsoTaskStatus =
  | "Open"
  | "In Progress"
  | "Awaiting QA"
  | "Awaiting Department Approval"
  | "Review due"
  | "Closed"
export class IsoWorkflowError extends Error {}
export function isoToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}
export function isoText(value: unknown, required = false, max = 4000) {
  const text = typeof value === "string" ? value.trim() : ""
  if (text.length > max || (required && !text))
    throw new IsoWorkflowError(
      `Enter required details within ${max} characters.`
    )
  return text
}
export function isoDate(value: unknown) {
  const date = isoText(value, false, 10)
  if (!date) return null
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new IsoWorkflowError("Choose a valid target date.")
  return date
}
export function isoId(value: unknown) {
  const id = isoText(value, false, 100)
  if (!id) return null
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new IsoWorkflowError("Select a valid record or staff account.")
  return id
}
export function defaultIsoWorkflow(task: string) {
  return `1. Department HOD: assign the responsible person and target date.\n2. Responsible person: ${task}\n3. Responsible person: record the result and supporting evidence; submit for QA.\n4. QA: verify the evidence and expected result; close or return with remarks.\n5. Document owner: arrange the next review when required.`
}
