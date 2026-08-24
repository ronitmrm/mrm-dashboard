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
    masterDataPricingPrefixes.some((prefix) =>
      permissionKey.startsWith(prefix)
    )
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
