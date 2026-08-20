import type { PageAccessDefinition } from "./page-access-types"

export const commercialCapabilities = {
  corrections: {
    read: "pricing.corrections.read",
    write: "pricing.corrections.write",
  },
  costing: {
    read: "pricing.costing.read",
    write: "pricing.costing.write",
  },
  customers: {
    read: "pricing.customers.read",
    write: "pricing.customers.write",
  },
  dashboard: { read: "pricing.dashboard.read" },
  design: {
    read: "pricing.design.read",
    write: "pricing.design.write",
  },
  drawingHistory: {
    read: "pricing.drawing_history.read",
    write: "pricing.drawing_history.write",
  },
  enquiries: {
    read: "pricing.enquiries.read",
    write: "pricing.enquiries.write",
  },
  masters: {
    read: "pricing.masters.read",
    write: "pricing.masters.write",
  },
  pricing: { read: "pricing.pricing.read" },
  products: { read: "pricing.products.read" },
  assemblies: {
    read: "pricing.assemblies.read",
    write: "pricing.assemblies.write",
  },
  purchaseOrders: {
    read: "pricing.purchase_orders.read",
    write: "pricing.purchase_orders.write",
  },
  quotes: {
    read: "pricing.quotes.read",
    write: "pricing.quotes.write",
  },
  revisions: {
    read: "pricing.revisions.read",
    write: "pricing.revisions.write",
  },
  sales: {
    read: "pricing.sales.read",
    write: "pricing.sales.write",
  },
  technicalReview: {
    read: "pricing.technical_review.read",
    write: "pricing.technical_review.write",
  },
  websiteProducts: {
    read: "pricing.website_products.read",
    write: "pricing.website_products.write",
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
    "Master Data"
  ),
  page(
    "commercial.enquiries",
    "Enquiries",
    "/commercial/enquiries",
    commercialCapabilities.enquiries,
    "Operational Entry"
  ),
  page(
    "commercial.enquiry_excel_view",
    "Excel View",
    "/commercial/enquiries/excel-view",
    commercialCapabilities.enquiries,
    "Operational Entry"
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
    commercialCapabilities.masters
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
    "Master Data"
  ),
  page(
    "commercial.costing",
    "Product Costing",
    "/commercial/costing",
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
    commercialCapabilities.purchaseOrders
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
  page(
    "commercial.corrections",
    "Corrections",
    "/commercial/corrections",
    commercialCapabilities.corrections
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
  module = "Commercial"
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
