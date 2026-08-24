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

const masterDataPricingPrefixes = [
  "pricing.customer_default_terms.",
  "pricing.customers.",
  "pricing.masters.",
  "pricing.website_products.",
] as const

const operationalEntryPricingPrefixes = [
  "pricing.enquiries.",
  "pricing.proforma_invoices.",
  "pricing.purchase_orders.",
] as const

export function sidebarModuleForPermission(
  permissionKey: string,
  storedModule: string
) {
  if (
    masterDataPricingPrefixes.some((prefix) => permissionKey.startsWith(prefix))
  ) {
    return sidebarModuleLabels.masterData
  }
  if (
    operationalEntryPricingPrefixes.some((prefix) =>
      permissionKey.startsWith(prefix)
    )
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
    masterDataPricingPrefixes.some((prefix) => permissionKey.startsWith(prefix))
  ) {
    return "Master Selection"
  }
  if (
    operationalEntryPricingPrefixes.some((prefix) =>
      permissionKey.startsWith(prefix)
    )
  ) {
    return "Entry Selection"
  }

  const mappings = [
    ["pricing.sales.", "Sales"],
    ["pricing.technical_review.", "Technical Review"],
    ["pricing.design.", "Design Tasks"],
    ["pricing.product_costing.", "Product Parameter Costing"],
    ["pricing.customer_costing.", "Customer Parameter Costing"],
    ["pricing.product_bulk_revision.", "Product Bulk Revision"],
    ["pricing.customer_bulk_revision.", "Customer Bulk Revision"],
    ["pricing.engineering_changes.", "Engineering Changes"],
    ["pricing.drawing_history.", "Drawing History"],
    ["store.requests.", "Requests & Issues"],
    ["store.new_item_requests.", "New Item Requests"],
    ["store.purchase_register.", "Purchase Register"],
    ["store.stock.", "Stock"],
    ["maintenance.", "Mechanical Maintenance"],
    ["hr.employees.", "Master Selection"],
    ["hr.masters.", "Master Selection"],
    ["hr.candidate_entry.", "Master Selection"],
    ["hr.jobs.", "Job Posts"],
    ["hr.candidate_search.", "Search Candidate"],
    ["hr.conversations.", "Conversation History"],
    ["hr.interview_schedule.", "Interview Schedule"],
    ["hr.interview_workspace.", "Interview Workspace"],
  ] as const
  return (
    mappings.find(([prefix]) => permissionKey.startsWith(prefix))?.[1] ??
    fallbackLabel
  )
}
