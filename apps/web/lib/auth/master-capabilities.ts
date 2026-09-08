import { productionFloors } from "@workspace/db/production-floors"
import {
  masterDefinitions,
  sharedOperationalMasterDefinitions,
} from "../master-module"

export type MasterAction = "read" | "save" | "import" | "rename" | "delete"

export function masterPermissionKey(
  unit: string,
  master: string,
  action: MasterAction
) {
  return `masters.${unit}.${master}.${action}`
}

// Independent grants only. These keys never imply a legacy umbrella permission.
export const scopedMasters = masterDefinitions.flatMap((definition) => {
  const scopes =
    definition.scope === "universal"
      ? [{ code: "universal", shortLabel: "Universal" }]
      : productionFloors
  const leaves = definition.subMasters ?? [
    { id: definition.id, label: definition.label },
  ]
  return scopes.flatMap((scope) =>
    leaves.map((leaf) => ({
      unit: scope.code,
      scopeLabel: scope.shortLabel,
      master: leaf.id,
      label: leaf.label,
      category:
        definition.scope === "unit" ? "Production Masters" : definition.label,
      main: definition.id,
    }))
  )
})

export function supportedMasterActions(
  master: (typeof scopedMasters)[number]
): MasterAction[] {
  const actions: MasterAction[] = ["read", "save"]
  const commercialReference =
    master.main === "commercial_pricing_masters" ||
    (master.main === "commercial_website_products" &&
      master.master !== master.main)
  const sharedOperational = sharedOperationalMasterDefinitions.some(
    ({ id }) => id === master.master
  )
  if (
    master.unit !== "universal" ||
    sharedOperational ||
    master.main === "rejection" ||
    commercialReference
  )
    actions.push("import")
  if (
    commercialReference ||
    ["department", "designation"].includes(master.master)
  )
    actions.push("rename")
  if (
    commercialReference ||
    master.unit !== "universal" ||
    sharedOperational ||
    ["rejection", "store_masters"].includes(master.main) ||
    ["department", "designation", "approved_posts", "job_templates"].includes(
      master.master
    )
  )
    actions.push("delete")
  return actions
}

export const masterPermissionOptions = scopedMasters.flatMap((master) =>
  supportedMasterActions(master).map((action) => ({
    key: masterPermissionKey(master.unit, master.master, action),
    module: "masters",
    name: `${master.scopeLabel} / ${master.label} / ${action}`,
  }))
)
