import { describe, expect, it } from "vitest"

import type { UnifiedNavigationAccess } from "./auth/unified-navigation-access"
import { cncDashboardCardIds, cncDashboardCardSource } from "./cnc-dashboard"
import {
  availablePersonalDashboardWidgets,
  availableCncDashboardDepartments,
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
  it("shows only granted production cards and links to an authorized unit", () => {
    const widgets = availablePersonalDashboardWidgets({
      ...noAccess,
      operations: true,
      productionTabIds: ["productionSessionsTab"],
      productionFloorTabIds: { cnc: ["productionSessionsTab"] },
      operationalEntryReadKeys: [],
      masterReadKeys: [],
    })
    expect(widgets.map(({ id, href }) => ({ id, href }))).toEqual([
      ...cncDashboardCardIds
        .filter((id) => cncDashboardCardSource(id) === "productionSessionsTab")
        .map((id) => ({
          id,
          href: "/dashboard/production-sessions?floor=cnc",
        })),
      {
        id: "production-sessions",
        href: "/dashboard/production-sessions?floor=cnc",
      },
    ])
    expect(
      resolvePersonalDashboardSelection(null, widgets).map(({ id }) => id)
    ).toContain("cnc-shift-comparison")
  })

  it("shows department views and cards only for the corresponding CNC and maintenance permissions", () => {
    const access = {
      ...noAccess,
      operations: true,
      productionFloorTabIds: {
        cnc: ["qualityControlTasksTab"],
        conventional: ["machinistTasksTab"],
      },
      maintenanceHrefs: ["/?tab=maintenanceTab"],
    } satisfies UnifiedNavigationAccess
    expect(
      availableCncDashboardDepartments(access).map(({ id }) => id)
    ).toEqual(["quality", "maintenance"])
    const ids = availablePersonalDashboardWidgets(access).map(({ id }) => id)
    expect(ids).toContain("cnc-qc-pending")
    expect(ids).toContain("cnc-open-breakdowns")
    expect(ids).not.toContain("cnc-pieces-rejected")
    expect(ids).not.toContain("cnc-setup-pending")
  })
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
      "operational-entry",
    ])
  })

  it("restores saved order and skips retired or inaccessible cards", () => {
    const available = availablePersonalDashboardWidgets({
      ...noAccess,
      operations: true,
      store: true,
      productionTabIds: ["productionDashboardTab"],
      productionFloorTabIds: {
        cnc: ["qualityControlTasksTab", "firstPieceInspectionTab"],
      },
    })

    expect(
      resolvePersonalDashboardSelection(
        [
          "store-stock",
          "quality-production",
          "production-dashboard",
          "commercial-overview",
        ],
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
      productionTabIds: ["productionDashboardTab"],
    })

    expect(resolvePersonalDashboardSelection([], available)).toEqual([])
    expect(
      resolvePersonalDashboardSelection(null, available).map(({ id }) => id)
    ).toEqual(["production-dashboard", "store-overview"])
  })

  it("uses the unified Master Data and Operational Entry ownership", () => {
    const widgets = availablePersonalDashboardWidgets({
      ...noAccess,
      commercialHrefs: ["/commercial/customers", "/commercial/enquiries"],
      operations: true,
      masterReadKeys: ["masters.universal.commercial_customers.read"],
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
    expect(widgets.find(({ id }) => id === "operational-entry")).toMatchObject({
      href: "/operational-entry",
    })
  })
})
