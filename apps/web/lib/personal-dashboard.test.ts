import { describe, expect, it } from "vitest"

import type { UnifiedNavigationAccess } from "./auth/unified-navigation-access"
import {
  availablePersonalDashboardWidgets,
  resolvePersonalDashboardSelection,
} from "./personal-dashboard"

const noAccess: UnifiedNavigationAccess = {
  administration: false,
  commercialHrefs: [],
  hrHrefs: [],
  operations: false,
  store: false,
}

describe("personal dashboard", () => {
  it("offers only information the signed-in user may open", () => {
    const widgets = availablePersonalDashboardWidgets({
      ...noAccess,
      commercialHrefs: ["/commercial", "/commercial/enquiries"],
      hrHrefs: ["/hr?panel=jobsPanel"],
      store: true,
    })

    expect(widgets.map(({ id }) => id)).toEqual([
      "commercial-overview",
      "commercial-enquiries",
      "hr-job-posts",
      "store-overview",
      "store-requests",
      "store-new-item-requests",
      "store-purchase-register",
      "store-stock",
    ])
  })

  it("restores the user's saved order and removes cards they can no longer access", () => {
    const available = availablePersonalDashboardWidgets({
      ...noAccess,
      operations: true,
      store: true,
    })

    expect(
      resolvePersonalDashboardSelection(
        ["store-stock", "production-dashboard", "commercial-overview"],
        available
      ).map(({ id }) => id)
    ).toEqual(["store-stock", "production-dashboard"])
  })

  it("offers only the specific Store pages granted to the user", () => {
    const widgets = availablePersonalDashboardWidgets({
      ...noAccess,
      store: true,
      storeHrefs: ["/store/stock"],
    })

    expect(widgets.map(({ id }) => id)).toEqual(["store-stock"])
  })

  it("keeps an intentionally empty dashboard different from a new user's defaults", () => {
    const available = availablePersonalDashboardWidgets({
      ...noAccess,
      operations: true,
      store: true,
    })

    expect(resolvePersonalDashboardSelection([], available)).toEqual([])
    expect(
      resolvePersonalDashboardSelection(null, available).map(({ id }) => id)
    ).toEqual(["production-dashboard", "store-overview"])
  })

  it("uses the unified Master Data and Operational Entry ownership", () => {
    const widgets = availablePersonalDashboardWidgets({
      ...noAccess,
      commercialHrefs: [
        "/commercial/customers",
        "/commercial/enquiries",
      ],
      operations: true,
    })
    const modules = Object.fromEntries(
      widgets.map((widget) => [widget.id, widget.module])
    )

    expect(modules).toMatchObject({
      "commercial-customers": "Master Data",
      "commercial-enquiries": "Operational Entry",
      "master-data": "Master Data",
      "operational-entry": "Operational Entry",
    })
  })
})
