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
        hrHrefs: ["/hr?panel=approvedPostPanel"],
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

  it("keeps the company selectors reachable for HR-only users", () => {
    expect(
      masterDataFallbackLinks({
        administration: false,
        commercialHrefs: [],
        hrHrefs: ["/hr?panel=jobsPanel"],
        operations: false,
        store: false,
      })
    ).toEqual([
      {
        destination:
          "/hr?panel=mastersPanel&masterView=dataEntry",
        id: "dataEntryTab",
        title: "Data Entry",
      },
      {
        destination:
          "/hr?panel=mastersPanel&masterView=masterTables",
        id: "masterTablesTab",
        title: "Master Tables",
      },
    ])
  })

  it("opens the unfiltered unified workspace from HR masters", () => {
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
        destination: "/?tab=dataEntryTab&floor=cnc",
        id: "dataEntryTab",
        title: "Data Entry",
      },
      {
        destination: "/?tab=masterTablesTab&floor=cnc",
        id: "masterTablesTab",
        title: "Master Tables",
      },
    ])
  })

  it("keeps Cycle Time selected when switching to its master table", () => {
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
        destination: "/?tab=dataEntryTab&floor=cnc&entry=cycle",
        id: "dataEntryTab",
        title: "Data Entry",
      },
      {
        destination: "/?tab=masterTablesTab&floor=cnc&entry=cycle",
        id: "masterTablesTab",
        title: "Master Tables",
      },
    ])
  })

  it("keeps Asset Category selected when switching Store Master views", () => {
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
      ).map((link) => link.destination)
    ).toEqual([
      "/?tab=dataEntryTab&floor=conventional&entry=store_masters&storeMaster=CATEGORY",
      "/?tab=masterTablesTab&floor=conventional&entry=store_masters&storeMaster=CATEGORY",
    ])
  })

  it("opens the unfiltered unified workspace from Pricing Masters", () => {
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
        destination: "/?tab=dataEntryTab&floor=cnc",
        id: "dataEntryTab",
        title: "Data Entry",
      },
      {
        destination: "/?tab=masterTablesTab&floor=cnc",
        id: "masterTablesTab",
        title: "Master Tables",
      },
    ])
  })
})
