import { describe, expect, it } from "vitest"

import {
  externalMasterDataOptions,
  masterDataFallbackLinks,
} from "./master-data-navigation"

describe("master data navigation", () => {
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
