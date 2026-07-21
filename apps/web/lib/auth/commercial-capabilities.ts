export const commercialCapabilities = {
  corrections: {
    read: "pricing.corrections.read",
    write: "pricing.corrections.write",
  },
  costing: {
    read: "pricing.costing.read",
    write: "pricing.costing.write",
  },
  dashboard: { read: "pricing.dashboard.read" },
  design: {
    read: "pricing.design.read",
    write: "pricing.design.write",
  },
  enquiries: {
    read: "pricing.enquiries.read",
    write: "pricing.enquiries.write",
  },
  masters: {
    read: "pricing.masters.read",
    write: "pricing.masters.write",
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
} as const

export const commercialNavigationAccess = [
  ["/commercial", commercialCapabilities.dashboard.read],
  ["/commercial/customers", commercialCapabilities.masters.read],
  ["/commercial/enquiries", commercialCapabilities.enquiries.read],
  ["/commercial/masters", commercialCapabilities.masters.read],
  ["/commercial/products", commercialCapabilities.masters.read],
  ["/commercial/costing", commercialCapabilities.costing.read],
  ["/commercial/quotes", commercialCapabilities.quotes.read],
  ["/commercial/orders", commercialCapabilities.purchaseOrders.read],
  ["/commercial/revisions", commercialCapabilities.revisions.read],
  ["/commercial/corrections", commercialCapabilities.corrections.read],
] as const
