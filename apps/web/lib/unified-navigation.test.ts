import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { commercialNavigationAccess } from "./auth/commercial-capabilities"
import { productionCapabilityForTab } from "./auth/production-capabilities"
import {
  administrationNavigation,
  commercialCostingNavigation,
  commercialMasterDataWorkspaceNavigation,
  commercialNavigation,
  commercialOperationalEntryNavigation,
  consolidatedProductionNavigation,
  dashboardNavigation,
  dashboardNavigationDestination,
  dashboardTabHref,
  hrNavigation,
  jobCardWorkspaceHref,
  legacyMasterEntryForDashboardTab,
  machineMasterNavigation,
  masterDataNavigation,
  navigationHrefMatches,
  operationalEntryNavigation,
  planningHolidayNavigation,
  productionFloorNavigation,
  storeNavigation,
  storePurchaseOrderHref,
  universalProductionNavigation,
} from "./unified-navigation"

describe("unified navigation", () => {
  it("groups master and operational entry destinations into separate modules", () => {
    const source = readFileSync(
      new URL("../components/unified-sidebar-navigation.tsx", import.meta.url),
      "utf8"
    )

    expect(source).toContain('label="Master Data"')
    expect(source).toContain('label="Operational Entry"')
    expect(source).toContain("filteredMasterDataNavigation.map")
    expect(source).toContain("filteredOperationalEntryNavigation.map")
    expect(source).toContain("filteredCommercialOperationalEntryNavigation.map")
    expect(source).toContain("CostingSubmoduleLabel")
    expect(source).not.toContain("visibleCommercialMasterDataNavigation.map")
  })

  it("uses native navigation for data-heavy sidebar destinations", () => {
    const source = readFileSync(
      new URL("../components/unified-sidebar-navigation.tsx", import.meta.url),
      "utf8"
    )
    const nativeLinks = source.match(/<a href=\{item\.href\}>/g) ?? []

    expect(nativeLinks).toHaveLength(5)
    expect(source).toContain(
      "<a href={productionNavigationHref(item.id, floor.code)}>"
    )
    expect(
      dashboardNavigationDestination("firstPieceInspectionTab", "cnc")
    ).toEqual({
      href: "/dashboard/first-piece-inspection?floor=cnc",
      interaction: "route",
    })
    expect(source).not.toContain('from "next/link"')
    expect(source).not.toContain("router.prefetch")
  })

  it("keeps every commercial destination tied to a permission", () => {
    const protectedHrefs = commercialNavigationAccess.map(([href]) => href)
    expect(
      commercialNavigation.every(({ href }) => protectedHrefs.includes(href))
    ).toBe(true)
    expect(protectedHrefs).toContain("/commercial/masters")
  })

  it("provides unique links for every merged application tab", () => {
    const hrefs = [
      ...dashboardNavigation.map(({ href }) => href),
      ...commercialNavigation.map(({ href }) => href),
      ...hrNavigation.map(({ href }) => href),
      ...administrationNavigation.map(({ href }) => href),
      ...storeNavigation.map(({ href }) => href),
    ]

    expect(new Set(hrefs)).toHaveLength(hrefs.length)
    expect(dashboardNavigation).toHaveLength(23)
    expect(productionFloorNavigation).toHaveLength(11)
    expect(productionFloorNavigation).not.toContainEqual(
      planningHolidayNavigation
    )
    expect(productionFloorNavigation).not.toContainEqual(
      machineMasterNavigation
    )
    expect(machineMasterNavigation).toMatchObject({
      id: "machineMasterTab",
      subtitle: "History And Maintenance",
      title: "Machines",
    })
    expect(universalProductionNavigation.map(({ id }) => id)).toEqual([
      "productionDashboardTab",
      "machineMasterTab",
      "maintenanceTab",
      "correctionsTab",
    ])
    expect(
      masterDataNavigation.map(({ id, title }) => ({ id, title }))
    ).toEqual([
      { id: "dataEntryTab", title: "Data Entry" },
      { id: "masterTablesTab", title: "Master Tables" },
    ])
    expect(
      operationalEntryNavigation.map(({ id, title }) => ({ id, title }))
    ).toEqual([
      { id: "operationalEntryTab", title: "Data Entry" },
      { id: "operationalTablesTab", title: "Master Tables" },
    ])
    expect(productionCapabilityForTab("operationalTablesTab")).toBe(
      productionCapabilityForTab("operationalEntryTab")
    )
    expect(consolidatedProductionNavigation).toEqual([])
    expect(productionFloorNavigation.map(({ id }) => id)).not.toEqual(
      expect.arrayContaining([
        "setupChecklistMasterTab",
        "maintenanceMastersTab",
        "qualityMastersTab",
      ])
    )
    expect(productionFloorNavigation.map(({ id }) => id)).toContain(
      "productionSessionsTab"
    )
    expect(planningHolidayNavigation).toMatchObject({
      id: "planningHolidayTab",
      title: "Planning Holidays",
    })
    expect(dashboardNavigation.map(({ id }) => id)).toEqual([
      "productionDashboardTab",
      "productionSessionsTab",
      "productionControlTab",
      "planningControlTab",
      "jobCardStatusTab",
      "machineDetailTab",
      "shopFloorStatusTab",
      "shopFloorTasksTab",
      "machinistTasksTab",
      "qualityControlTasksTab",
      "firstPieceInspectionTab",
      "maintenanceTab",
      "correctionsTab",
      "dataEntryTab",
      "masterTablesTab",
      "operationalEntryTab",
      "operationalTablesTab",
      "masterGapsTab",
      "machineMasterTab",
      "planningHolidayTab",
      "setupChecklistMasterTab",
      "maintenanceMastersTab",
      "qualityMastersTab",
    ])
    expect(
      dashboardNavigation.find(({ id }) => id === "setupChecklistMasterTab")
    ).toMatchObject({
      subtitle: "Setup And Maintenance",
      title: "Checklists",
    })
    expect(
      dashboardNavigation.find(({ id }) => id === "maintenanceTab")
    ).toMatchObject({
      title: "Mechanical Maintenance",
    })
    expect(commercialNavigation).toHaveLength(21)
    expect(
      commercialMasterDataWorkspaceNavigation.map(({ href, label }) => ({
        href,
        label,
      }))
    ).toEqual([
      { href: "/commercial/customers", label: "Customers" },
      { href: "/commercial/website-products", label: "Website Products" },
    ])
    expect(
      commercialOperationalEntryNavigation.map(({ href, label }) => ({
        href,
        label,
      }))
    ).toEqual([
      { href: "/commercial/enquiries", label: "Enquiries" },
      {
        href: "/commercial/enquiries/excel-view",
        label: "Excel View",
      },
    ])
    expect(commercialCostingNavigation.map(({ label }) => label)).not.toEqual(
      expect.arrayContaining([
        "Customers",
        "Enquiries",
        "Excel View",
        "Website Products",
      ])
    )
    expect(
      commercialCostingNavigation.length +
        commercialMasterDataWorkspaceNavigation.length +
        commercialOperationalEntryNavigation.length
    ).toBe(commercialNavigation.length)
    expect(commercialNavigation.map(({ label }) => label)).not.toContain(
      "Pricing Masters"
    )
    expect(storeNavigation.map(({ href, label }) => ({ href, label }))).toEqual(
      [
        { href: "/store", label: "Store Overview" },
        { href: "/store/requests", label: "Requests & Issues" },
        { href: "/store/new-item-requests", label: "New Item Requests" },
        { href: "/store/orders", label: "Purchase Register" },
        { href: "/store/stock", label: "Stock" },
      ]
    )
    expect(
      administrationNavigation.map(({ href, label }) => ({ href, label }))
    ).toEqual([
      { href: "/administration/access", label: "Access Administration" },
      { href: "/account/password", label: "Password & Security" },
    ])
    expect(hrNavigation.map(({ href, label }) => ({ href, label }))).toEqual([
      { href: "/hr?panel=approvedPostPanel", label: "Approved Post Form" },
      { href: "/hr?panel=employeeMasterPanel", label: "Employee Master" },
      { href: "/hr?panel=jobsPanel", label: "Job Posts" },
      { href: "/hr?panel=candidatesPanel", label: "Log Candidate" },
      {
        href: "/hr?panel=candidateSearchPanel",
        label: "Search Candidate",
      },
      {
        href: "/hr?panel=conversationLogsPanel",
        label: "Conversation History",
      },
      {
        href: "/hr?panel=interviewsPanel",
        label: "Interview Schedule",
      },
      {
        href: "/hr?panel=interviewWorkspacePanel",
        label: "Interview Workspace",
      },
    ])
  })

  it("creates shareable links for operations tabs", () => {
    expect(dashboardTabHref("maintenanceTab")).toBe("/?tab=maintenanceTab")
    expect(dashboardTabHref("maintenanceTab", "cnc")).toBe(
      "/?tab=maintenanceTab&floor=cnc"
    )
    expect(dashboardTabHref("correctionsTab")).toBe("/?tab=correctionsTab")
  })

  it("selects Excel View without also selecting its Enquiries parent", () => {
    const searchParams = new URLSearchParams()

    expect(
      navigationHrefMatches(
        "/commercial/enquiries/excel-view",
        searchParams,
        "/commercial/enquiries/excel-view"
      )
    ).toBe(true)
    expect(
      navigationHrefMatches(
        "/commercial/enquiries/excel-view",
        searchParams,
        "/commercial/enquiries"
      )
    ).toBe(false)
  })

  it("sends old Production master bookmarks into company Data Entry", () => {
    expect(legacyMasterEntryForDashboardTab("planningHolidayTab")).toBe(
      "planning_holiday"
    )
    expect(legacyMasterEntryForDashboardTab("setupChecklistMasterTab")).toBe(
      "setup_checklist_master"
    )
    expect(legacyMasterEntryForDashboardTab("maintenanceMastersTab")).toBe(
      "maintenance_master"
    )
    expect(legacyMasterEntryForDashboardTab("qualityMastersTab")).toBe(
      "quality_parameter_master"
    )
    expect(legacyMasterEntryForDashboardTab("machineMasterTab")).toBeUndefined()
  })

  it("opens Production Sessions as a standalone route from the live dashboard", () => {
    expect(
      dashboardNavigationDestination("productionSessionsTab", "cnc")
    ).toEqual({
      href: "/dashboard/production-sessions?floor=cnc",
      interaction: "route",
    })
  })

  it("creates a standalone Job Card workspace link", () => {
    expect(jobCardWorkspaceHref("JC 100/2", "cnc")).toBe(
      "/dashboard/job-cards/JC%20100%2F2?floor=cnc"
    )
  })

  it("creates a prefilled Purchase Order link from a Store request", () => {
    expect(
      storePurchaseOrderHref({
        itemTypeId: "item-123",
        quantity: "3.5",
        requestNumber: "STR-REQ-2026-000123",
      })
    ).toBe(
      "/store/stock?mode=order&orderItemId=item-123&orderQuantity=3.5&requestNumber=STR-REQ-2026-000123"
    )
  })

  it("matches the selected HR panel instead of every HR link", () => {
    const searchParams = new URLSearchParams("panel=candidateSearchPanel")

    expect(
      navigationHrefMatches(
        "/hr",
        searchParams,
        "/hr?panel=candidateSearchPanel"
      )
    ).toBe(true)
    expect(
      navigationHrefMatches("/hr", searchParams, "/hr?panel=mastersPanel")
    ).toBe(false)
  })

  it("keeps Job Posts selected inside a job recruitment workspace", () => {
    const searchParams = new URLSearchParams()

    expect(
      navigationHrefMatches(
        "/hr/jobs/9824b9a7-b917-4dea-a8b2-9eb9d2935dc7",
        searchParams,
        "/hr?panel=jobsPanel"
      )
    ).toBe(true)
    expect(
      navigationHrefMatches(
        "/hr/jobs/9824b9a7-b917-4dea-a8b2-9eb9d2935dc7",
        searchParams,
        "/hr?panel=interviewsPanel"
      )
    ).toBe(false)
  })

  it("keeps Log Candidate selected inside a candidate workspace", () => {
    const searchParams = new URLSearchParams()

    expect(
      navigationHrefMatches(
        "/hr/candidates/9824b9a7-b917-4dea-a8b2-9eb9d2935dc7",
        searchParams,
        "/hr?panel=candidatesPanel"
      )
    ).toBe(true)
  })
})
