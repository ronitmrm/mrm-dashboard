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
    })
  })

  test("maps current commercial destinations to their narrow read capability", () => {
    expect(commercialNavigationAccess).toEqual([
      ["/commercial", "pricing.dashboard.read"],
      ["/commercial/customers", "pricing.masters.read"],
      ["/commercial/enquiries", "pricing.enquiries.read"],
      ["/commercial/sales", "pricing.sales.read"],
      ["/commercial/technical-review", "pricing.technical_review.read"],
      ["/commercial/design", "pricing.design.read"],
      ["/commercial/masters", "pricing.masters.read"],
      ["/commercial/products", "pricing.masters.read"],
      ["/commercial/assemblies", "pricing.masters.read"],
      ["/commercial/drawing-history", "pricing.masters.read"],
      ["/commercial/website-products", "pricing.masters.read"],
      ["/commercial/costing", "pricing.costing.read"],
      ["/commercial/quotes", "pricing.quotes.read"],
      ["/commercial/pricing", "pricing.quotes.read"],
      ["/commercial/orders", "pricing.purchase_orders.read"],
      ["/commercial/revisions", "pricing.revisions.read"],
      ["/commercial/corrections", "pricing.corrections.read"],
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
