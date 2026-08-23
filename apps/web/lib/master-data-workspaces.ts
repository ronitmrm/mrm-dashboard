export const masterDataEntryTypes = [
  "setup_name_master",
  "route",
  "cycle",
  "tooling",
  "machine_master",
  "setup_checklist_master",
  "maintenance_checklist_master",
  "maintenance_master",
  "rejection_type_master",
  "rejection_remark_master",
  "rejection_reason_master",
  "quality_parameter_master",
  "planning_holiday",
  "store_masters",
] as const

export const operationalDataEntryTypes = [
  "work_order",
  "rm_inward",
  "software_raw",
] as const

export const rejectionMasterSubMasters = [
  { entryType: "rejection_type_master", title: "Rejection Type" },
  { entryType: "rejection_remark_master", title: "Rejection Remark" },
  { entryType: "rejection_reason_master", title: "Rejection Reason" },
] as const

const rejectionMasterEntryTypes = new Set<string>(
  rejectionMasterSubMasters.map(({ entryType }) => entryType)
)

export function isRejectionMasterEntryType(entryType: string) {
  return rejectionMasterEntryTypes.has(entryType)
}

export function masterDataMainMasterKey(entryType: string) {
  return isRejectionMasterEntryType(entryType) ? "rejection" : entryType
}

const operationalRowSourceByEntryType: Record<string, string> = {
  rm_inward: "rmInwardRows",
  software_raw: "productionOutputRows",
  work_order: "workOrders",
}

function recordRows(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null && !Array.isArray(row)
      )
    : []
}

export function operationalEntryRows(
  entryType: string,
  dataEntry: Record<string, unknown>,
  productionControl: Record<string, unknown>
) {
  const projectedRows = recordRows(
    productionControl[operationalRowSourceByEntryType[entryType] ?? ""]
  )
  const savedRows = recordRows(dataEntry.rows).filter(
    (row) => row.entryType === entryType
  )
  return [...projectedRows, ...savedRows]
}

const identityFieldsByEntryType: Record<string, readonly string[]> = {
  cycle: ["partNo", "optionNumber", "setupNo"],
  machine_master: ["machineNo"],
  maintenance_checklist_master: ["checklistCode", "sequence"],
  maintenance_master: ["maintenanceCode"],
  planning_holiday: ["date", "reason"],
  quality_parameter_master: [
    "partNo",
    "optionNumber",
    "setupNo",
    "parameterCode",
  ],
  rejection_reason_master: ["code"],
  rejection_remark_master: ["code"],
  rejection_type_master: ["code"],
  route: ["partNo", "optionNumber", "setupNo"],
  setup_checklist_master: ["checklistCode", "sequence"],
  setup_name_master: ["setupName"],
  tooling: ["partNo", "optionNumber", "setupNo"],
}

export function immutableMasterFields(entryType: string) {
  return [...(identityFieldsByEntryType[entryType] ?? [])]
}

export function masterEditDefaults(
  _entryType: string,
  row: Record<string, unknown>
) {
  const entryId = String(row._id ?? "").trim()
  return {
    ...row,
    __editingMaster: true,
    ...(entryId ? { __entryId: entryId } : {}),
    __returnTab: "masterTablesTab",
  }
}
