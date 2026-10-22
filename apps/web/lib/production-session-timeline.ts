import { formatIstDateTime } from "./date-time"

export const productionSessionEndReasons = [
  { label: "Shift Ends", value: "shift_end" },
  { label: "Shift Change", value: "shift_change" },
  { label: "Operator Change", value: "operator_change" },
  { label: "Item Complete", value: "item_complete" },
  { label: "Job / Setup Change", value: "job_change" },
  { label: "Manual Stop", value: "manual_stop" },
  { label: "Awaiting material — release machine", value: "awaiting_material" },
] as const

export function sessionTimelineDetail(row: Record<string, unknown>) {
  const value = (field: string) => String(row[field] ?? "").trim()
  if (value("eventType") === "session_closed" && value("reasonCode")) {
    const reason = value("reasonCode")
    const label = productionSessionEndReasons.find((item) => item.value === reason)?.label
      ?? reason.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    return `End reason: ${label}`
  }
  const detail = value("reasonName") || value("eventDetails") || "-"
  if (value("eventType") === "downtime") {
    return `${detail} · ${value("endedAt") ? `End: ${formatIstDateTime(value("endedAt"))} IST` : "Ongoing"}`
  }
  return detail
}
