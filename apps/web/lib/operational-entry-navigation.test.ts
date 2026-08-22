import { describe, expect, it } from "vitest"

import {
  externalOperationalEntryOptions,
  operationalDataDashboardHref,
} from "./operational-entry-navigation"

describe("operational entry navigation", () => {
  it("keeps the selected entry when switching between entry and table views", () => {
    expect(
      operationalDataDashboardHref("masterTables", "cnc", "rm_inward")
    ).toBe("/?tab=operationalTablesTab&floor=cnc&entry=rm_inward")
  })

  it("offers Enquiries and Purchase Orders in both views", () => {
    const access = {
      administration: false,
      commercialHrefs: ["/commercial/enquiries", "/commercial/orders"],
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
      {
        href: "/commercial/orders?operationalView=dataEntry",
        id: "commercial_purchase_orders",
        title: "Purchase Orders",
      },
    ])
    expect(externalOperationalEntryOptions(access, "masterTables")).toEqual([
      {
        href: "/commercial/enquiries?operationalView=masterTables",
        id: "commercial_enquiries",
        title: "Enquiries",
      },
      {
        href: "/commercial/orders?operationalView=masterTables",
        id: "commercial_purchase_orders",
        title: "Purchase Orders",
      },
    ])
  })
})
