type DashboardRecord = Record<string, unknown>

function record(value: unknown): DashboardRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as DashboardRecord)
    : {}
}

function rows(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (row): row is DashboardRecord =>
          typeof row === "object" && row !== null && !Array.isArray(row)
      )
    : []
}

export function maintenanceChecklistRowsForSchedule(
  dataEntry: unknown,
  productionControl: unknown
) {
  const entry = record(dataEntry)
  const control = record(productionControl)
  return [
    ...rows(control.maintenanceChecklistMasterRows),
    ...rows(entry.maintenanceChecklistMasterRows),
    ...rows(entry.rows),
    ...rows(entry.templates),
  ].filter(
    (row) =>
      row.entryType === "maintenance_checklist_master" ||
      (typeof row.checklistCode === "string" && row.checklistCode.trim())
  )
}
