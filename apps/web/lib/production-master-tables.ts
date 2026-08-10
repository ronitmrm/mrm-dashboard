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
  employee: ["employeeMasterRows"],
  machine_master: ["machinePlanningRows"],
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

function hasMasterValue(value: unknown) {
  if (value === null || value === undefined) return false
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return normalized !== "" && normalized !== "-" && normalized !== "n/a"
  }
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object") return Object.keys(value).length > 0
  return true
}

export function columnsForProductionMaster(
  fields: ProductionMasterField[],
  rows: Array<Record<string, unknown>>,
  alwaysInclude: readonly string[] = []
) {
  return fields
    .filter(
      (field) =>
        alwaysInclude.includes(field.name) ||
        rows.some((row) => hasMasterValue(row[field.name]))
    )
    .map((field) => ({ key: field.name, label: field.label }))
}
