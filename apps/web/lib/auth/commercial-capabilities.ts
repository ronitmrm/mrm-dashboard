import type { PageAccessDefinition } from "./page-access-types"
import { sidebarModuleLabels } from "../sidebar-module-labels"

export const commercialCapabilities = {
  corrections: {
    read: "pricing.corrections.read",
  },
  costing: {
    read: "pricing.costing.read",
  },
  customers: {
    read: "pricing.customers.read",
  },
  dashboard: { read: "pricing.dashboard.read" },
  design: {
    read: "pricing.design.read",
  },
  drawingHistory: {
    read: "pricing.drawing_history.read",
  },
  enquiries: {
    read: "pricing.enquiries.read",
  },
  masters: {
    read: "pricing.masters.read",
  },
  pricing: { read: "pricing.pricing.read" },
  products: { read: "pricing.products.read" },
  assemblies: {
    read: "pricing.assemblies.read",
  },
  purchaseOrders: {
    read: "pricing.purchase_orders.read",
  },
  quotes: {
    read: "pricing.quotes.read",
  },
  revisions: {
    read: "pricing.revisions.read",
  },
  sales: {
    read: "pricing.sales.read",
  },
  technicalReview: {
    read: "pricing.technical_review.read",
  },
  websiteProducts: {
    read: "pricing.website_products.read",
  },
} as const

export const commercialPageAccess = [
  page(
    "commercial.overview",
    "Commercial Overview",
    "/commercial",
    commercialCapabilities.dashboard
  ),
  page(
    "commercial.customers",
    "Customers",
    "/commercial/customers",
    commercialCapabilities.customers,
    sidebarModuleLabels.masterData
  ),
  page(
    "commercial.enquiries",
    "Enquiries",
    "/commercial/enquiries",
    commercialCapabilities.enquiries,
    sidebarModuleLabels.operationalEntry
  ),
  page(
    "commercial.enquiry_excel_view",
    "Excel View",
    "/commercial/enquiries/excel-view",
    commercialCapabilities.enquiries,
    sidebarModuleLabels.operationalEntry
  ),
  page(
    "commercial.sales",
    "Sales",
    "/commercial/sales",
    commercialCapabilities.sales
  ),
  page(
    "commercial.technical_review",
    "Technical Review",
    "/commercial/technical-review",
    commercialCapabilities.technicalReview
  ),
  page(
    "commercial.design",
    "Design",
    "/commercial/design",
    commercialCapabilities.design
  ),
  page(
    "commercial.masters",
    "Pricing Masters",
    "/commercial/masters",
    commercialCapabilities.masters,
    sidebarModuleLabels.masterData
  ),
  page(
    "commercial.products",
    "Products",
    "/commercial/products",
    commercialCapabilities.products
  ),
  page(
    "commercial.assemblies",
    "Assembly / BOM",
    "/commercial/assemblies",
    commercialCapabilities.assemblies
  ),
  page(
    "commercial.drawing_history",
    "Drawing History",
    "/commercial/drawing-history",
    commercialCapabilities.drawingHistory
  ),
  page(
    "commercial.website_products",
    "Website Products",
    "/commercial/website-products",
    commercialCapabilities.websiteProducts,
    sidebarModuleLabels.masterData
  ),
  page(
    "commercial.product-costing",
    "Product Parameter Costing",
    "/commercial/product-costing",
    commercialCapabilities.costing
  ),
  page(
    "commercial.customer-costing",
    "Customer Parameter Costing",
    "/commercial/customer-costing",
    commercialCapabilities.costing
  ),
  page(
    "commercial.quotes",
    "Quote Register",
    "/commercial/quotes",
    commercialCapabilities.quotes
  ),
  page(
    "commercial.pricing",
    "Pricing",
    "/commercial/pricing",
    commercialCapabilities.pricing
  ),
  page(
    "commercial.orders",
    "Purchase Orders",
    "/commercial/orders",
    commercialCapabilities.purchaseOrders,
    sidebarModuleLabels.operationalEntry
  ),
  page(
    "commercial.product-bulk-revision",
    "Product Bulk Revision",
    "/commercial/product-bulk-revision",
    commercialCapabilities.revisions
  ),
  page(
    "commercial.customer-bulk-revision",
    "Customer Bulk Revision",
    "/commercial/customer-bulk-revision",
    commercialCapabilities.revisions
  ),
  page(
    "commercial.ecns",
    "Engineering Change Notes",
    "/commercial/ecns",
    commercialCapabilities.revisions
  ),
  page(
    "commercial.revisions",
    "Price Revisions",
    "/commercial/revisions",
    commercialCapabilities.revisions
  ),
] satisfies readonly PageAccessDefinition[]

export const commercialNavigationAccess = commercialPageAccess.map(
  ({ href, readPermissionKey }) => [href, readPermissionKey] as const
)

function page(
  id: string,
  label: string,
  href: string,
  capabilities: { read: string; write?: string },
  module: string = sidebarModuleLabels.costing
): PageAccessDefinition {
  return {
    href,
    id,
    label,
    module,
    navigation: true,
    readPermissionKey: capabilities.read,
    ...(capabilities.write ? { writePermissionKey: capabilities.write } : {}),
  }
}
