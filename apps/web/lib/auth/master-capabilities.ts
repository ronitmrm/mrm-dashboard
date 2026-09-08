import { productionFloors } from "@workspace/db/production-floors"
import {
  masterDefinitions,
  sharedOperationalMasterDefinitions,
} from "../master-module"

export type MasterAction =
  | "read"
  | "save"
  | "create"
  | "update"
  | "import"
  | "rename"
  | "delete"

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
  if (master.master === "commercial_customers")
    return ["read", "create", "update", "import"]
  if (master.master === "approved_posts")
    return ["read", "create", "update", "delete"]
  if (master.master === "combined_approved_posts")
    return ["read", "create", "update"]
  if (master.master === "employee_assignments")
    return ["read", "save", "import"]
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
    commercialReference ||
    master.main === "store_masters"
  )
    actions.push("import")
  if (
    (commercialReference && master.master !== "materialRate") ||
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

export function masterCapability(
  master: string,
  action: MasterAction,
  unit = "universal"
) {
  const definition = scopedMasters.find(
    (entry) => entry.master === master && entry.unit === unit
  )
  if (!definition || !supportedMasterActions(definition).includes(action)) {
    throw new Error("Unknown master, unit or action.")
  }
  return masterPermissionKey(unit, master, action)
}

export function hrMasterForPanel(panel: string, kind?: string) {
  if (panel === "mastersPanel")
    return kind === "designation" ? "designation" : "department"
  const panels: Record<string, string> = {
    approvedPostPanel: "approved_posts",
    combinedRolesPanel: "combined_approved_posts",
    candidatesPanel: "candidates",
    employeeMasterPanel: "employee_assignments",
    postMasterPanel: "job_templates",
  }
  return panels[panel] ?? null
}

// Presentation adapter for existing components on ONE selected master page.
// Never use this result for server authorization or persist it as grants.
export function masterComponentActions(
  masterId: string,
  granted: readonly string[],
  unit = "universal"
) {
  const master = scopedMasters.find(
    (entry) => entry.master === masterId && entry.unit === unit
  )
  if (!master) return []
  return supportedMasterActions(master)
    .filter(
      (action) =>
        action !== "read" &&
        granted.includes(masterPermissionKey(unit, masterId, action))
    )
    .flatMap((action) => previousMasterCapabilities(master, action))
}

// Used only to migrate existing grants and describe existing UI actions.
// A leaf permission must never grant these legacy capabilities to an account.
export function previousMasterCapabilities(
  master: (typeof scopedMasters)[number],
  action: MasterAction
): string[] {
  if (master.main === "commercial_customers") {
    return [
      action === "read"
        ? "pricing.customers.read"
        : action === "update"
          ? "pricing.customers.update"
          : "pricing.customers.create",
    ]
  }
  if (master.master === "commercial_website_products") {
    return [
      action === "read"
        ? "pricing.website_products.read"
        : "pricing.website_products.update",
    ]
  }
  if (
    master.main === "commercial_pricing_masters" ||
    master.main === "commercial_website_products"
  ) {
    if (action === "save") {
      return [
        "pricing.masters.update",
        ...([
          "buyer",
          "incoterms",
          "payment_terms",
          "shipment_mode",
          "packaging_terms",
        ].includes(master.master)
          ? ["pricing.customer_default_terms.update"]
          : []),
      ]
    }
    return [`pricing.masters.${action}`]
  }
  if (master.main === "store_masters")
    return [action === "read" ? "store.masters.read" : "store.masters.write"]
  if (master.main === "hr_masters") {
    if (action === "read" && master.master === "candidates")
      return ["hr.candidate_entry.read"]
    const prefixes: Record<string, string> = {
      department: "hr.masters",
      designation: "hr.masters",
      approved_posts: "hr.approved_posts",
      combined_approved_posts: "hr.combined_roles",
      candidates: "hr.candidates",
      employee_assignments: "hr.employees",
      job_templates: "hr.job_templates",
    }
    if (action === "read" && master.master === "combined_approved_posts")
      return ["hr.approved_posts.read"]
    if (action === "delete" && master.master === "job_templates")
      return ["hr.masters.delete"]
    const suffix =
      master.master === "employee_assignments" && action !== "read"
        ? action === "import"
          ? "bulk_assign"
          : "assign"
        : ["department", "designation"].includes(master.master) &&
            action === "save"
          ? "create"
          : action
    return [`${prefixes[master.master]}.${suffix}`]
  }
  if (action === "read")
    return [
      "operations.master_data_entry.read",
      "operations.master_tables.read",
    ]
  if (action === "delete") return ["operations.corrections.write"]
  if (
    master.main === "rejection" ||
    master.master === "quality_parameter_master"
  )
    return ["quality.parameters.manage"]
  if (master.master === "setup_checklist_master")
    return ["quality.parameters.manage"]
  if (
    ["maintenance_master", "maintenance_checklist_master"].includes(
      master.master
    )
  )
    return ["maintenance.definitions.manage"]
  return ["operations.shop_floor.write"]
}
