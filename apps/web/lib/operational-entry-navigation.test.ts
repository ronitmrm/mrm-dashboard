import { describe, expect, it } from "vitest"

import {
  externalOperationalEntryOptions,
  operationalDataDashboardHref,
} from "./operational-entry-navigation"

describe("operational entry navigation", () => {
  it("keeps the selected entry when switching between entry and table views", () => {
    expect(
      operationalDataDashboardHref("masterTables", "cnc", "rm_inward")
    ).toBe(
      "/?tab=operationalTablesTab&floor=cnc&entry=rm_inward"
    )
  })

  it("offers Enquiries inside both operational views when permitted", () => {
    const access = {
      administration: false,
      commercialHrefs: ["/commercial/enquiries"],
      hrHrefs: [],
      operations: true,
      store: false,
    }

    expect(externalOperationalEntryOptions(access, "dataEntry")).toEqual([
      {
        href: "/commercial/enquiries?operationalView=dataEntry",
        id: "commercial_enquiries",
        title: "Enquiries",
      },
    ])
    expect(externalOperationalEntryOptions(access, "masterTables")).toEqual([
      {
        href: "/commercial/enquiries?operationalView=masterTables",
        id: "commercial_enquiries",
        title: "Enquiries",
      },
    ])
  })
})
