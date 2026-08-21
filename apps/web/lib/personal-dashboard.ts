import type { UnifiedNavigationAccess } from "./auth/unified-navigation-access"

export type PersonalDashboardWidgetId =
  | "access-administration"
  | "commercial-costing"
  | "commercial-customer-bulk-revision"
  | "commercial-customer-costing"
  | "commercial-customers"
  | "commercial-design"
  | "commercial-enquiries"
  | "commercial-orders"
  | "commercial-overview"
  | "commercial-pricing"
  | "commercial-product-bulk-revision"
  | "commercial-quotes"
  | "commercial-revisions"
  | "commercial-technical-review"
  | "hr-approved-posts"
  | "hr-candidate-search"
  | "hr-employees"
  | "hr-interviews"
  | "hr-job-posts"
  | "hr-log-candidate"
  | "master-data"
  | "machines"
  | "mechanical-maintenance"
  | "operational-entry"
  | "part-readiness"
  | "planner-actions"
  | "planning-control"
  | "production-dashboard"
  | "production-job-cards"
  | "production-sessions"
  | "store-new-item-requests"
  | "store-overview"
  | "store-purchase-register"
  | "store-requests"
  | "store-stock"

export type PersonalDashboardWidget = {
  description: string
  href: string
  id: PersonalDashboardWidgetId
  module:
    | "Administration"
    | "Costing"
    | "HR & Recruitment"
    | "Master Data"
    | "Operational Entry"
    | "Production"
    | "Store"
  requiredHref?: string
  scope: "administration" | "commercial" | "hr" | "operations" | "store"
  summary: "commercial" | "hr" | "none" | "store"
  title: string
}

const widgetCatalog: readonly PersonalDashboardWidget[] = [
  { id: "commercial-overview", title: "Commercial Overview", description: "Commercial workload, quoting and follow-ups.", href: "/commercial", module: "Costing", requiredHref: "/commercial", scope: "commercial", summary: "commercial" },
  { id: "commercial-enquiries", title: "Enquiries", description: "Open the enquiry register and incoming work.", href: "/commercial/enquiries", module: "Operational Entry", requiredHref: "/commercial/enquiries", scope: "commercial", summary: "none" },
  { id: "commercial-technical-review", title: "Technical Review", description: "Review commercial items awaiting technical input.", href: "/commercial/technical-review", module: "Costing", requiredHref: "/commercial/technical-review", scope: "commercial", summary: "none" },
  { id: "commercial-design", title: "Design Tasks", description: "Open design tasks and product drawings.", href: "/commercial/design", module: "Costing", requiredHref: "/commercial/design", scope: "commercial", summary: "none" },
  { id: "commercial-costing", title: "Product Parameter Costing", description: "Prepare and review product-level costing.", href: "/commercial/product-costing", module: "Costing", requiredHref: "/commercial/product-costing", scope: "commercial", summary: "none" },
  { id: "commercial-customer-costing", title: "Customer Parameter Costing", description: "Calculate customer-specific quotes after product costing.", href: "/commercial/customer-costing", module: "Costing", requiredHref: "/commercial/customer-costing", scope: "commercial", summary: "none" },
  { id: "commercial-product-bulk-revision", title: "Product Bulk Revision", description: "Stage product cost changes across active customer prices.", href: "/commercial/product-bulk-revision", module: "Costing", requiredHref: "/commercial/product-bulk-revision", scope: "commercial", summary: "none" },
  { id: "commercial-customer-bulk-revision", title: "Customer Bulk Revision", description: "Revise selected active customer prices in one staged workflow.", href: "/commercial/customer-bulk-revision", module: "Costing", requiredHref: "/commercial/customer-bulk-revision", scope: "commercial", summary: "none" },
  { id: "commercial-quotes", title: "Quote Register", description: "Track quotations and customer responses.", href: "/commercial/quotes", module: "Costing", requiredHref: "/commercial/quotes", scope: "commercial", summary: "none" },
  { id: "commercial-pricing", title: "Pricing", description: "View current product pricing records.", href: "/commercial/pricing", module: "Costing", requiredHref: "/commercial/pricing", scope: "commercial", summary: "none" },
  { id: "commercial-orders", title: "Purchase Orders", description: "Open customer purchase orders and processing.", href: "/commercial/orders", module: "Costing", requiredHref: "/commercial/orders", scope: "commercial", summary: "none" },
  { id: "commercial-revisions", title: "Price Revisions", description: "Review and apply approved price revisions.", href: "/commercial/revisions", module: "Costing", requiredHref: "/commercial/revisions", scope: "commercial", summary: "none" },
  { id: "commercial-customers", title: "Customers", description: "Open customer master records.", href: "/commercial/customers?masterView=masterTables", module: "Master Data", requiredHref: "/commercial/customers", scope: "commercial", summary: "none" },
  { id: "hr-approved-posts", title: "Approved Posts", description: "Create and review approved employee posts.", href: "/hr?panel=approvedPostPanel", module: "HR & Recruitment", requiredHref: "/hr?panel=approvedPostPanel", scope: "hr", summary: "none" },
  { id: "hr-employees", title: "Employee Master", description: "Open active and historical employee records.", href: "/hr?panel=employeeMasterPanel", module: "HR & Recruitment", requiredHref: "/hr?panel=employeeMasterPanel", scope: "hr", summary: "none" },
  { id: "hr-job-posts", title: "Job Posts", description: "Recruitment vacancies, candidates and interviews.", href: "/hr?panel=jobsPanel", module: "HR & Recruitment", requiredHref: "/hr?panel=jobsPanel", scope: "hr", summary: "hr" },
  { id: "hr-log-candidate", title: "Log Candidate", description: "Add a new candidate to Recruitment.", href: "/hr?panel=candidatesPanel", module: "HR & Recruitment", requiredHref: "/hr?panel=candidatesPanel", scope: "hr", summary: "none" },
  { id: "hr-candidate-search", title: "Search Candidate", description: "Find candidates and application history.", href: "/hr?panel=candidateSearchPanel", module: "HR & Recruitment", requiredHref: "/hr?panel=candidateSearchPanel", scope: "hr", summary: "none" },
  { id: "hr-interviews", title: "Interview Schedule", description: "Upcoming and completed interviews.", href: "/hr?panel=interviewsPanel", module: "HR & Recruitment", requiredHref: "/hr?panel=interviewsPanel", scope: "hr", summary: "none" },
  { id: "store-overview", title: "Store Overview", description: "Stock, requests, assets and attention required.", href: "/store", module: "Store", requiredHref: "/store", scope: "store", summary: "store" },
  { id: "store-requests", title: "Requests & Issues", description: "Department requests and Store issues.", href: "/store/requests", module: "Store", requiredHref: "/store/requests", scope: "store", summary: "none" },
  { id: "store-new-item-requests", title: "New Item Requests", description: "Review requests for new Store codes.", href: "/store/new-item-requests", module: "Store", requiredHref: "/store/new-item-requests", scope: "store", summary: "none" },
  { id: "store-purchase-register", title: "Purchase Register", description: "Store purchase orders and receipts.", href: "/store/orders", module: "Store", requiredHref: "/store/orders", scope: "store", summary: "none" },
  { id: "store-stock", title: "Stock", description: "Current consumable and non-consumable stock.", href: "/store/stock", module: "Store", requiredHref: "/store/stock", scope: "store", summary: "none" },
  { id: "production-dashboard", title: "Production Dashboard", description: "Orders, Production Units and dispatch dates.", href: "/?tab=productionDashboardTab", module: "Production", scope: "operations", summary: "none" },
  { id: "production-sessions", title: "Production Sessions", description: "Start, close and review production sessions.", href: "/dashboard/production-sessions", module: "Production", scope: "operations", summary: "none" },
  { id: "planner-actions", title: "Planner Actions", description: "Priority, route and machine decisions.", href: "/?tab=productionControlTab", module: "Production", scope: "operations", summary: "none" },
  { id: "planning-control", title: "Planning Control", description: "Routes, plans and production readiness.", href: "/?tab=planningControlTab", module: "Production", scope: "operations", summary: "none" },
  { id: "production-job-cards", title: "Job Cards", description: "Running and completed production jobs.", href: "/?tab=jobCardStatusTab", module: "Production", scope: "operations", summary: "none" },
  { id: "part-readiness", title: "Part Readiness", description: "Missing Route, Cycle and Tooling masters.", href: "/?tab=masterGapsTab", module: "Production", scope: "operations", summary: "none" },
  { id: "machines", title: "Machines", description: "Machine details, maintenance and history.", href: "/?tab=machineMasterTab", module: "Production", scope: "operations", summary: "none" },
  { id: "mechanical-maintenance", title: "Mechanical Maintenance", description: "Planned and breakdown maintenance work.", href: "/?tab=maintenanceTab", module: "Production", scope: "operations", summary: "none" },
  { id: "master-data", title: "Master Data", description: "Add and review company master records.", href: "/?tab=dataEntryTab", module: "Master Data", scope: "operations", summary: "none" },
  { id: "operational-entry", title: "Operational Entry", description: "Work Orders, RM Inward and production entry.", href: "/?tab=operationalEntryTab", module: "Operational Entry", scope: "operations", summary: "none" },
  { id: "access-administration", title: "Access Administration", description: "Accounts, roles and application access.", href: "/administration/access", module: "Administration", scope: "administration", summary: "none" },
]

export function availablePersonalDashboardWidgets(
  access: UnifiedNavigationAccess
) {
  return widgetCatalog.filter((widget) => {
    if (widget.scope === "administration") return access.administration
    if (widget.scope === "operations") return access.operations
    if (widget.scope === "store") {
      return access.storeHrefs
        ? Boolean(
            widget.requiredHref &&
              access.storeHrefs.includes(widget.requiredHref)
          )
        : access.store
    }
    if (widget.scope === "commercial") {
      return Boolean(
        widget.requiredHref && access.commercialHrefs.includes(widget.requiredHref)
      )
    }
    return Boolean(widget.requiredHref && access.hrHrefs.includes(widget.requiredHref))
  })
}

const defaultWidgetIds: readonly PersonalDashboardWidgetId[] = [
  "production-dashboard",
  "commercial-overview",
  "hr-job-posts",
  "store-overview",
  "access-administration",
]

export function resolvePersonalDashboardSelection(
  savedIds: readonly string[] | null,
  availableWidgets: readonly PersonalDashboardWidget[]
) {
  const availableById = new Map(
    availableWidgets.map((widget) => [widget.id, widget])
  )
  const requestedIds =
    savedIds === null
      ? defaultWidgetIds.filter((id) => availableById.has(id))
      : savedIds
  const selected: PersonalDashboardWidget[] = []
  const seen = new Set<string>()

  for (const id of requestedIds) {
    const widget = availableById.get(id as PersonalDashboardWidgetId)
    if (!widget || seen.has(id)) continue
    seen.add(id)
    selected.push(widget)
    if (selected.length === 24) break
  }

  if (savedIds === null && selected.length === 0) {
    return availableWidgets.slice(0, 4)
  }
  return selected
}
