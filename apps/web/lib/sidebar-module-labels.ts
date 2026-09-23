export const sidebarModuleLabels = {
  branding: "Document Templates",
  qualityControl: "Quality Control",
  accessAdministration: "Access Administration",
  costing: "Costing",
  dashboard: "Dashboard",
  hr: "HR & Recruitment",
  machines: "Machines",
  masterData: "Master Data",
  maintenance: "Maintenance",
  operationalEntry: "Operational Entry",
  productionDashboard: "Production Dashboard",
  store: "Store",
  isoDocument: "ISO Document",
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

function startsWithAny(permissionKey: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => permissionKey.startsWith(prefix))
}

export function sidebarModuleForPermission(
  permissionKey: string,
  storedModule: string
) {
  if (permissionKey.startsWith("iso.documents."))
    return sidebarModuleLabels.isoDocument
  if (permissionKey.startsWith("quality.control.")) return sidebarModuleLabels.qualityControl
  if (permissionKey.startsWith("quality.rejection_register.")) return sidebarModuleLabels.isoDocument
  if (startsWithAny(permissionKey, masterDataPermissionPrefixes)) {
    return sidebarModuleLabels.masterData
  }
  if (startsWithAny(permissionKey, operationalEntryPermissionPrefixes)) {
    return sidebarModuleLabels.operationalEntry
  }

  switch (storedModule) {
    case "branding":
      return sidebarModuleLabels.branding
    case "administration":
    case "artifacts":
      return sidebarModuleLabels.accessAdministration
    case "hr":
    case "recruitment":
      return sidebarModuleLabels.hr
    case "maintenance":
      return sidebarModuleLabels.maintenance
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
  if (startsWithAny(permissionKey, masterDataPermissionPrefixes)) {
    return "Data Entry"
  }
  if (startsWithAny(permissionKey, operationalEntryPermissionPrefixes)) {
    return "Data Entry"
  }

  const mappings = [
    ["iso.documents.", "Master Document List"],
    ["quality.control.", "Rejection Entry"],
    ["quality.rejection_register.", "Rejection Register"],
    ["branding.sop.", "SOPs"],
    ["branding.controlled-document.", "Controlled Documents"],
    ["branding.notice.", "Notices"],
    ["branding.policy.", "Policies"],
    ["branding.work-instruction.", "Work Instructions"],
    ["administration.", "Access Administration"],
    ["artifacts.", "Artifacts"],
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
    ["maintenance.requests.manage", "Manager Approval"],
    ["maintenance.trade.electrical", "Electrical"],
    ["maintenance.trade.plumbing", "Plumbing"],
    ["maintenance.", "Mechanical"],
    ["hr.jobs.", "Job Posts"],
    ["hr.candidate_search.", "Search Candidate"],
    ["hr.conversations.", "Conversation History"],
    ["hr.candidates.events.", "Conversation History"],
    ["hr.candidates.applications.", "Conversation History"],
    ["hr.candidates.appointments.", "Interview Workspace"],
    ["hr.candidates.save", "Data Entry"],
    ["hr.candidates.assign", "Data Entry"],
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
