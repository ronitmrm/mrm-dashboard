import { normalizeProductionFloorCode } from "@workspace/db/production-floors"
import {
  productionMasterRowSources,
  productionMasterTableEntryTypes,
} from "../production-master-tables"
import {
  masterCapability,
  scopedMasters,
  type MasterAction,
} from "./master-capabilities"

export function productionMasterCapability(
  entry: string,
  action: MasterAction,
  floor?: unknown
) {
  if (!productionMasterTableEntryTypes.some((master) => master === entry))
    return null
  const universal = scopedMasters.some(
    (master) => master.master === entry && master.unit === "universal"
  )
  return masterCapability(
    entry,
    action,
    universal ? "universal" : normalizeProductionFloorCode(floor)
  )
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function productionMasterSnapshot(
  payload: unknown,
  granted: ReadonlySet<string>,
  floor: string
) {
  const source = record(payload)
  const masters = productionMasterTableEntryTypes.filter((entry) =>
    granted.has(productionMasterCapability(entry, "read", floor)!)
  )
  const sourceKeys = new Set(
    masters.flatMap((entry) => [...(productionMasterRowSources[entry] ?? [])])
  )
  const dataEntry = record(source.dataEntry)
  const selectRows = (value: unknown) =>
    Object.fromEntries(
      Object.entries(record(value)).filter(([key]) => sourceKeys.has(key))
    )
  const productionControl = selectRows(source.productionControl)
  const lookup = (sourceKey: string, fields: readonly string[]) => {
    if (sourceKeys.has(sourceKey)) return
    const rows =
      record(source.productionControl)[sourceKey] ?? dataEntry[sourceKey]
    productionControl[sourceKey] = Array.isArray(rows)
      ? rows.map((row: unknown) =>
          Object.fromEntries(
            Object.entries(record(row)).filter(([key]) => fields.includes(key))
          )
        )
      : []
  }
  for (const master of masters) {
    if (!granted.has(productionMasterCapability(master, "save", floor)!))
      continue
    if (["cycle", "tooling", "quality_parameter_master"].includes(master))
      lookup("routeMasterRows", [
        "partNo",
        "partCode",
        "optionNumber",
        "setupNo",
        "setupName",
        "machineFamily",
      ])
    if (master === "route") {
      lookup("setupNameMasterRows", ["setupName"])
      lookup("machinePlanningRows", ["machineFamily"])
    }
    if (master === "maintenance_master")
      lookup("maintenanceChecklistMasterRows", [
        "checklistCode",
        "checklistTitle",
        "sequence",
        "stepDescription",
        "inputType",
        "status",
        "required",
      ])
  }
  return {
    cacheStatus: source.cacheStatus,
    updatedAt: source.updatedAt,
    readModelVersion: source.readModelVersion,
    productionFloorCode: floor,
    dataEntry: {
      ...selectRows(dataEntry),
      entryTypes: masters,
      rows: Array.isArray(dataEntry.rows)
        ? dataEntry.rows.filter((row: unknown) =>
            masters.some((entry) => record(row).entryType === entry)
          )
        : [],
    },
    productionControl,
  }
}
