import { productionFloors } from "@workspace/db/production-floors"

export const operationalEntryActions = [
  "read",
  "save",
  "import",
  "export",
] as const
export type OperationalEntryAction = (typeof operationalEntryActions)[number]

export const productionOperationalEntries = [
  { id: "work_order", label: "Work Order" },
  { id: "rm_inward", label: "RM Inward" },
  { id: "software_raw", label: "Software Production Output" },
] as const

export type ProductionOperationalEntry =
  (typeof productionOperationalEntries)[number]["id"]

export function operationalEntryPermissionKey(
  unit: string,
  entry: string,
  action: OperationalEntryAction
) {
  return `entries.${unit}.${entry}.${action}`
}

// Entry Selection and Entry Tables share one independently granted unit/entry.
export const scopedOperationalEntries = productionFloors.flatMap((floor) =>
  productionOperationalEntries.map((entry) => ({
    unit: floor.code,
    scopeLabel: floor.shortLabel,
    entry: entry.id,
    label: entry.label,
  }))
)

export const operationalEntryPermissionOptions =
  scopedOperationalEntries.flatMap((entry) =>
    operationalEntryActions.map((action) => ({
      key: operationalEntryPermissionKey(entry.unit, entry.entry, action),
      module: "entries",
      name: `${entry.scopeLabel} / ${entry.label} / ${action}`,
    }))
  )

export function operationalEntryCapability(
  entry: string,
  action: OperationalEntryAction,
  unit: string
) {
  if (
    !scopedOperationalEntries.some(
      (item) => item.entry === entry && item.unit === unit
    )
  ) {
    throw new Error("Unknown operational entry or unit.")
  }
  return operationalEntryPermissionKey(unit, entry, action)
}
