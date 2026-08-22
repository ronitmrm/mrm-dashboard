import { describe, expect, it } from "vitest"

import {
  companyWideMasterEntryTypes,
  externalMasterDataOptions,
  isCompanyWideMasterEntryType,
  masterDataDashboardHref,
  masterDataFallbackLinks,
  masterDataNavigationLinks,
  masterPayloadForScope,
} from "./master-data-navigation"

describe("master data navigation", () => {
  it("keeps standalone Data Entry out of Master Data navigation", () => {
    const links = masterDataNavigationLinks(
      {
        administration: false,
        commercialHrefs: [],
        hrHrefs: [],
        operations: true,
        productionTabIds: ["dataEntryTab", "masterTablesTab"],
        store: false,
        storeHrefs: [],
      },
      {
        entryType: "route",
        pathname: "/",
        productionFloorCode: "cnc",
        searchParams: new URLSearchParams("tab=dataEntryTab&entry=route"),
      }
    )

    expect(links).toEqual([
      {
        destination: "/masters?view=masterTables",
        id: "masterTablesTab",
        title: "Master Tables",
      },
    ])
  })

  it("marks software-wide masters as not applicable to one Production Unit", () => {
    expect(companyWideMasterEntryTypes).toEqual([
      "rejection_type_master",
      "rejection_remark_master",
      "rejection_reason_master",
      "store_masters",
      "hr_masters",
      "hr_job_templates",
      "commercial_pricing_masters",
      "commercial_customers",
      "commercial_website_products",
    ])

    for (const entryType of companyWideMasterEntryTypes) {
      expect(isCompanyWideMasterEntryType(entryType)).toBe(true)
    }
    expect(isCompanyWideMasterEntryType("quality_parameter_master")).toBe(false)
  })

  it("removes a Production Unit from company-wide master writes only", () => {
    expect(
      masterPayloadForScope("rejection_type_master", {
        productionFloorCode: "cnc",
        typeOfRejection: "Crack",
      })
    ).toEqual({ typeOfRejection: "Crack" })

    expect(
      masterPayloadForScope("quality_parameter_master", {
        parameterName: "Diameter",
        productionFloorCode: "cnc",
      })
    ).toEqual({
      parameterName: "Diameter",
      productionFloorCode: "cnc",
    })
  })

  it("offers permitted HR and Commercial masters from both company selectors", () => {
    const options = externalMasterDataOptions(
      {
        administration: false,
        commercialHrefs: [
          "/commercial/masters",
          "/commercial/customers",
          "/commercial/website-products",
        ],
        hrHrefs: ["/hr?panel=mastersPanel", "/hr?panel=postMasterPanel"],
        operations: true,
        store: true,
      },
      "dataEntry"
    )

    expect(options).toEqual([
      {
        href: "/hr?panel=mastersPanel&masterView=dataEntry",
        id: "hr_masters",
        title: "HR Departments & Designations",
      },
      {
        href: "/hr?panel=postMasterPanel&masterView=dataEntry",
        id: "hr_job_templates",
        title: "HR Job Templates",
      },
      {
        href: "/commercial/masters?masterView=dataEntry",
        id: "commercial_pricing_masters",
        title: "Commercial Pricing Masters",
      },
      {
        href: "/commercial/customers?masterView=dataEntry",
        id: "commercial_customers",
        title: "Customers",
      },
      {
        href: "/commercial/website-products?masterView=dataEntry",
        id: "commercial_website_products",
        title: "Website Products",
      },
    ])
  })

  it("requires each Commercial master permission independently", () => {
    expect(
      externalMasterDataOptions(
        {
          administration: false,
          commercialHrefs: ["/commercial/customers"],
          hrHrefs: [],
          operations: true,
          store: false,
        },
        "masterTables"
      )
    ).toEqual([
      {
        href: "/commercial/customers?masterView=masterTables",
        id: "commercial_customers",
        title: "Customers",
      },
    ])
  })

  it("requires each HR master permission independently", () => {
    expect(
      externalMasterDataOptions(
        {
          administration: false,
          commercialHrefs: [],
          hrHrefs: ["/hr?panel=postMasterPanel"],
          operations: false,
          store: false,
        },
        "masterTables"
      )
    ).toEqual([
      {
        href: "/hr?panel=postMasterPanel&masterView=masterTables",
        id: "hr_job_templates",
        title: "HR Job Templates",
      },
    ])
  })

  it("does not expose another module without its read permission", () => {
    expect(
      externalMasterDataOptions(
        {
          administration: false,
          commercialHrefs: [],
          hrHrefs: [],
          operations: true,
          store: false,
        },
        "masterTables"
      )
    ).toEqual([])
  })

  it("opens table selection for HR-only users", () => {
    expect(
      masterDataFallbackLinks({
        administration: false,
        commercialHrefs: [],
        hrHrefs: ["/hr?panel=mastersPanel"],
        operations: false,
        store: false,
      })
    ).toEqual([
      {
        destination: "/masters?view=masterTables",
        id: "masterTablesTab",
        title: "Master Tables",
      },
    ])
  })

  it("returns to table selection from HR masters", () => {
    const access = {
      administration: false,
      commercialHrefs: ["/commercial/masters"],
      hrHrefs: ["/hr?panel=approvedPostPanel"],
      operations: true,
      store: true,
    }

    expect(
      masterDataNavigationLinks(access, {
        pathname: "/hr",
        productionFloorCode: "cnc",
        searchParams: new URLSearchParams(
          "panel=mastersPanel&masterView=dataEntry"
        ),
      })
    ).toEqual([
      {
        destination: "/masters?view=masterTables",
        id: "masterTablesTab",
        title: "Master Tables",
      },
    ])
  })

  it("opens table selection instead of switching directly from Cycle Time", () => {
    const access = {
      administration: false,
      commercialHrefs: [],
      hrHrefs: [],
      operations: true,
      store: false,
    }

    expect(
      masterDataNavigationLinks(access, {
        entryType: "cycle",
        pathname: "/",
        productionFloorCode: "cnc",
        searchParams: new URLSearchParams("tab=dataEntryTab&floor=cnc"),
      })
    ).toEqual([
      {
        destination: "/masters?view=masterTables",
        id: "masterTablesTab",
        title: "Master Tables",
      },
    ])
  })

  it("opens table selection instead of switching directly from Store Masters", () => {
    expect(
      masterDataDashboardHref(
        "masterTables",
        "conventional",
        "store_masters",
        "CATEGORY"
      )
    ).toBe(
      "/?tab=masterTablesTab&floor=conventional&entry=store_masters&storeMaster=CATEGORY"
    )

    expect(
      masterDataNavigationLinks(
        {
          administration: false,
          commercialHrefs: [],
          hrHrefs: [],
          operations: true,
          store: true,
        },
        {
          entryType: "store_masters",
          pathname: "/",
          productionFloorCode: "conventional",
          searchParams: new URLSearchParams(
            "tab=dataEntryTab&entry=store_masters&storeMaster=CATEGORY"
          ),
        }
      )
    ).toEqual([
      {
        destination: "/masters?view=masterTables",
        id: "masterTablesTab",
        title: "Master Tables",
      },
    ])
  })

  it("returns to table selection from Pricing Masters", () => {
    const access = {
      administration: false,
      commercialHrefs: ["/commercial/masters"],
      hrHrefs: ["/hr?panel=approvedPostPanel"],
      operations: true,
      store: true,
    }

    expect(
      masterDataNavigationLinks(access, {
        entryType: "commercial_pricing_masters",
        pathname: "/commercial/masters",
        productionFloorCode: "cnc",
        searchParams: new URLSearchParams("masterView=dataEntry"),
      })
    ).toEqual([
      {
        destination: "/masters?view=masterTables",
        id: "masterTablesTab",
        title: "Master Tables",
      },
    ])
  })
})
