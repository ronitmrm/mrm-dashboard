export const checklistWorkspaceEntryTypes = [
  "setup_checklist_master",
  "maintenance_checklist_master",
] as const

export const qualityWorkspaceEntryTypes = [
  "quality_parameter_master",
  "rejection_type_master",
  "rejection_remark_master",
  "rejection_reason_master",
] as const

export const companyWideQualityMasterEntryTypes = [
  "rejection_type_master",
  "rejection_remark_master",
  "rejection_reason_master",
] as const

export const productionUnitQualityMasterEntryTypes = [
  "quality_parameter_master",
] as const

export const productionMasterTableEntryTypes = [
  "route",
  "cycle",
  "tooling",
  "planning_holiday",
  "maintenance_master",
  ...checklistWorkspaceEntryTypes,
  ...qualityWorkspaceEntryTypes,
] as const

export function rowsForProductionMaster<T extends Record<string, unknown>>(
  entryType: string,
  rows: T[]
) {
  return rows.filter((row) => {
    const rowEntryType =
      typeof row.entryType === "string" ? row.entryType.trim() : ""
    return !rowEntryType || rowEntryType === entryType
  })
}

function recordRows(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter(
    (row): row is Record<string, unknown> =>
      typeof row === "object" && row !== null && !Array.isArray(row)
  )
}

export function dataEntryRowsForProductionMaster(
  entryType: string,
  dataEntry: Record<string, unknown>
) {
  return recordRows(dataEntry.rows).filter(
    (row) => row.entryType === entryType
  )
}

export const productionMasterRowSources: Record<string, readonly string[]> = {
  route: ["routeMasterRows"],
  cycle: ["cycleMasterRows"],
  tooling: ["toolingMasterRows"],
  maintenance_master: ["maintenanceMasterRows"],
  maintenance_checklist_master: ["maintenanceChecklistMasterRows"],
  planning_holiday: ["planningHolidayRows"],
  setup_checklist_master: ["setupChecklistMasterRows"],
  rejection_type_master: ["rejectionTypeMasterRows"],
  rejection_remark_master: ["rejectionRemarkMasterRows"],
  rejection_reason_master: ["rejectionReasonMasterRows"],
  quality_parameter_master: ["qualityParameterMasterRows"],
}

type ProductionMasterField = {
  name: string
  label: string
}

export function columnsForProductionMaster(
  fields: ProductionMasterField[]
) {
  return fields
    .map((field) => ({ key: field.name, label: field.label }))
}
