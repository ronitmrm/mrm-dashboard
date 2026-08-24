export const sidebarModuleLabels = {
  accessAdministration: "Access Administration",
  costing: "Costing",
  dashboard: "Dashboard",
  hr: "HR & Recruitment",
  machines: "Machines",
  masterData: "Master Data",
  mechanicalMaintenance: "Mechanical Maintenance",
  operationalEntry: "Operational Entry",
  productionDashboard: "Production Dashboard",
  store: "Store",
} as const

const masterDataPermissionPrefixes = [
  "pricing.customer_default_terms.",
  "pricing.customers.",
  "pricing.masters.",
  "pricing.website_products.",
  "hr.approved_posts.",
  "hr.candidate_entry.",
  "hr.candidates.assign",
  "hr.candidates.save",
  "hr.combined_roles.",
  "hr.employees.",
  "hr.job_templates.",
  "hr.masters.",
  "store.masters.",
  "quality.parameters.",
] as const

const operationalEntryPermissionPrefixes = [
  "pricing.enquiries.",
  "pricing.proforma_invoices.",
  "pricing.purchase_orders.",
  "operations.attendance.",
  "operations.training.",
] as const

function startsWithAny(
  permissionKey: string,
  prefixes: readonly string[]
) {
  return prefixes.some((prefix) => permissionKey.startsWith(prefix))
}

export function sidebarModuleForPermission(
  permissionKey: string,
  storedModule: string
) {
  if (
    startsWithAny(permissionKey, masterDataPermissionPrefixes)
  ) {
    return sidebarModuleLabels.masterData
  }
  if (
    startsWithAny(permissionKey, operationalEntryPermissionPrefixes)
  ) {
    return sidebarModuleLabels.operationalEntry
  }

  switch (storedModule) {
    case "administration":
      return sidebarModuleLabels.accessAdministration
    case "hr":
    case "recruitment":
      return sidebarModuleLabels.hr
    case "maintenance":
      return sidebarModuleLabels.mechanicalMaintenance
    case "operations":
    case "planning":
    case "quality":
      return sidebarModuleLabels.productionDashboard
    case "pricing":
      return sidebarModuleLabels.costing
    case "store":
      return sidebarModuleLabels.store
    default:
      return storedModule
  }
}

export function sidebarSubmoduleForPermission(
  permissionKey: string,
  fallbackLabel: string
) {
  if (
    startsWithAny(permissionKey, masterDataPermissionPrefixes)
  ) {
    return "Master Selection"
  }
  if (
    startsWithAny(permissionKey, operationalEntryPermissionPrefixes)
  ) {
    return "Entry Selection"
  }

  const mappings = [
    ["administration.", "Access Administration"],
    ["pricing.dashboard.", "Pricing"],
    ["pricing.pricing.", "Pricing"],
    ["pricing.products.", "Product Parameter Costing"],
    ["pricing.assemblies.", "Product Parameter Costing"],
    ["pricing.costing.", "Product Parameter Costing"],
    ["pricing.quotes.", "Sales"],
    ["pricing.sales.", "Sales"],
    ["pricing.technical_review.", "Technical Review"],
    ["pricing.design.", "Design Tasks"],
    ["pricing.product_costing.", "Product Parameter Costing"],
    ["pricing.customer_costing.", "Customer Parameter Costing"],
    ["pricing.product_bulk_revision.", "Product Bulk Revision"],
    ["pricing.customer_bulk_revision.", "Customer Bulk Revision"],
    ["pricing.price_revisions.", "Product Bulk Revision"],
    ["pricing.ecns.", "Engineering Changes"],
    ["pricing.corrections.", "Engineering Changes"],
    ["pricing.engineering_changes.", "Engineering Changes"],
    ["pricing.drawing_history.", "Drawing History"],
    ["store.overview.", "Store Overview"],
    ["store.requests.", "Requests & Issues"],
    ["store.new_item_requests.", "New Item Requests"],
    ["store.purchase_register.", "Purchase Register"],
    ["store.purchase_orders.", "Stock"],
    ["store.receipts.", "Purchase Register"],
    ["store.asset_", "Stock"],
    ["store.stock.", "Stock"],
    ["maintenance.", "Mechanical Maintenance"],
    ["hr.jobs.", "Job Posts"],
    ["hr.candidate_search.", "Search Candidate"],
    ["hr.conversations.", "Conversation History"],
    ["hr.candidates.events.", "Conversation History"],
    ["hr.candidates.applications.", "Conversation History"],
    ["hr.candidates.appointments.", "Interview Workspace"],
    ["hr.candidates.save", "Master Selection"],
    ["hr.candidates.assign", "Master Selection"],
    ["hr.interview_schedule.", "Interview Schedule"],
    ["hr.interviews.schedule", "Interview Schedule"],
    ["hr.interviews.record", "Interview Workspace"],
    ["hr.interview_workspace.", "Interview Workspace"],
    ["operations.", "Production Dashboard"],
    ["planning.", "Production Dashboard"],
    ["quality.", "Production Dashboard"],
  ] as const
  return (
    mappings.find(([prefix]) => permissionKey.startsWith(prefix))?.[1] ??
    fallbackLabel
  )
}
