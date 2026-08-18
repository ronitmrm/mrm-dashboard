import { describe, expect, it } from "vitest"

import {
  companyWideMasterEntryTypes,
  externalMasterDataOptions,
  isCompanyWideMasterEntryType,
  masterDataFallbackLinks,
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
        commercialHrefs: ["/commercial/masters"],
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
})
