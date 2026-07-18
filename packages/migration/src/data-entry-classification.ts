const CANONICAL_DATA_ENTRY_TYPES = new Set([
  "cycle",
  "dispatch",
  "downtime_reason_master",
  "employee",
  "first_piece_inspection_master",
  "first_piece_inspection_report",
  "hourly_quality_check",
  "machine_master",
  "machine_planning",
  "maintenance_checklist_master",
  "maintenance_master",
  "maintenance_schedule",
  "maintenance_task",
  "meeting_action",
  "planning_holiday",
  "production_card",
  "quality_inspection",
  "quality_parameter_master",
  "raw_material_plan",
  "rejection_classification",
  "rejection_reason_master",
  "rejection_remark_master",
  "rejection_type_master",
  "rm_inward",
  "route",
  "setup_checklist",
  "setup_checklist_master",
  "setup_checklist_session",
  "shop_floor_status",
  "software_raw",
  "tooling",
  "work_order",
])

const ARCHIVE_ONLY_DATA_ENTRY_TYPES = new Set(["_summary"])

export type ConvexDataEntryDisposition =
  | "archive_only"
  | "canonical"
  | "unknown"

export function convexDataEntryDisposition(
  entryType: string
): ConvexDataEntryDisposition {
  if (ARCHIVE_ONLY_DATA_ENTRY_TYPES.has(entryType)) {
    return "archive_only"
  }
  if (CANONICAL_DATA_ENTRY_TYPES.has(entryType)) {
    return "canonical"
  }
  return "unknown"
}
