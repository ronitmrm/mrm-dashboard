import { describe, expect, test } from "vitest"

import {
  commercialCapabilities,
  commercialNavigationAccess,
} from "./commercial-capabilities"

describe("commercial Better Auth capability contract", () => {
  test("keeps every source read/write area distinct", () => {
    expect(commercialCapabilities).toEqual({
      corrections: {
        read: "pricing.corrections.read",
      },
      costing: {
        read: "pricing.costing.read",
      },
      dashboard: { read: "pricing.dashboard.read" },
      design: {
        read: "pricing.design.read",
      },
      enquiries: {
        read: "pricing.enquiries.read",
      },
      customers: {
        read: "pricing.customers.read",
      },
      masters: {
        read: "pricing.masters.read",
      },
      products: { read: "pricing.products.read" },
      assemblies: {
        read: "pricing.assemblies.read",
      },
      drawingHistory: {
        read: "pricing.drawing_history.read",
      },
      websiteProducts: {
        read: "pricing.website_products.read",
      },
      purchaseOrders: {
        read: "pricing.purchase_orders.read",
      },
      quotes: {
        read: "pricing.quotes.read",
      },
      pricing: { read: "pricing.pricing.read" },
      revisions: {
        read: "pricing.revisions.read",
      },
      sales: {
        read: "pricing.sales.read",
      },
      technicalReview: {
        read: "pricing.technical_review.read",
      },
    })
  })

  test("maps current commercial destinations to their narrow read capability", () => {
    expect(commercialNavigationAccess).toEqual([
      ["/commercial", "pricing.dashboard.read"],
      ["/commercial/customers", "pricing.customers.read"],
      ["/commercial/enquiries", "pricing.enquiries.read"],
      ["/commercial/enquiries/excel-view", "pricing.enquiries.read"],
      ["/commercial/sales", "pricing.sales.read"],
      ["/commercial/technical-review", "pricing.technical_review.read"],
      ["/commercial/design", "pricing.design.read"],
      ["/commercial/masters", "pricing.masters.read"],
      ["/commercial/products", "pricing.products.read"],
      ["/commercial/assemblies", "pricing.assemblies.read"],
      ["/commercial/drawing-history", "pricing.drawing_history.read"],
      ["/commercial/website-products", "pricing.website_products.read"],
      ["/commercial/product-costing", "pricing.costing.read"],
      ["/commercial/customer-costing", "pricing.costing.read"],
      ["/commercial/quotes", "pricing.quotes.read"],
      ["/commercial/pricing", "pricing.pricing.read"],
      ["/commercial/orders", "pricing.purchase_orders.read"],
      ["/commercial/product-bulk-revision", "pricing.revisions.read"],
      ["/commercial/customer-bulk-revision", "pricing.revisions.read"],
      ["/commercial/ecns", "pricing.revisions.read"],
      ["/commercial/revisions", "pricing.revisions.read"],
      ["/commercial/pricing", "pricing.products.read"],
    ])
  })

  test("does not alias orders, quotes, revisions, or corrections to costing", () => {
    const costing = new Set<string>(
      Object.values(commercialCapabilities.costing)
    )
    for (const area of [
      "purchaseOrders",
      "quotes",
      "revisions",
      "corrections",
    ] as const) {
      expect(
        Object.values(commercialCapabilities[area]).some((value) =>
          costing.has(value)
        )
      ).toBe(false)
    }
  })
})
