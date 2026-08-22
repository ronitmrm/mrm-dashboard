import { describe, expect, it } from "vitest"

import {
  availableOperationalEntryMains,
  operationalEntryFormHref,
  operationalEntryModuleAccess,
  operationalEntryOpenHref,
  operationalEntrySelectionHref,
  operationalEntrySelectionMatchesDestination,
  operationalSubEntriesFor,
  resolveOperationalEntrySelection,
  type OperationalEntryModuleAccess,
} from "./operational-entry-module"

const fullAccess: OperationalEntryModuleAccess = {
  enquiries: true,
  productionDataEntry: true,
  productionTables: true,
  purchaseOrders: true,
}

describe("operational entry module selection", () => {
  it("separates production-unit entries from Universal commercial entries", () => {
    expect(
      availableOperationalEntryMains("cnc", fullAccess, "dataEntry")
    ).toEqual([{ id: "production_entries", label: "Production Entries" }])
    expect(
      availableOperationalEntryMains("universal", fullAccess, "dataEntry")
    ).toEqual([{ id: "commercial_entries", label: "Commercial Entries" }])
  })

  it("offers permitted entry forms for the selected view", () => {
    expect(
      operationalSubEntriesFor("production_entries", fullAccess, "dataEntry")
    ).toEqual([
      { id: "work_order", label: "Work Order" },
      { id: "rm_inward", label: "Rm Inward" },
      { id: "software_raw", label: "Software Production Output" },
    ])
    expect(
      operationalSubEntriesFor("commercial_entries", fullAccess, "dataEntry")
    ).toEqual([
      { id: "commercial_enquiries", label: "Enquiries" },
      { id: "commercial_purchase_orders", label: "Purchase Orders" },
    ])
    expect(
      operationalSubEntriesFor("commercial_entries", fullAccess, "masterTables")
    ).toEqual([
      { id: "commercial_enquiries", label: "Enquiries" },
      { id: "commercial_purchase_orders", label: "Purchase Orders" },
    ])
  })

  it("derives entry permissions from unified navigation access", () => {
    expect(
      operationalEntryModuleAccess({
        administration: false,
        commercialHrefs: ["/commercial/enquiries", "/commercial/orders"],
        hrHrefs: [],
        operations: true,
        productionTabIds: ["operationalEntryTab", "operationalTablesTab"],
        store: false,
      })
    ).toEqual(fullAccess)
  })

  it("rejects mismatched and unauthorized selections", () => {
    expect(
      resolveOperationalEntrySelection(
        { main: "production_entries", sub: "work_order", unit: "universal" },
        fullAccess,
        "dataEntry"
      )
    ).toBeNull()
    expect(
      resolveOperationalEntrySelection(
        {
          main: "commercial_entries",
          sub: "commercial_purchase_orders",
          unit: "universal",
        },
        { ...fullAccess, purchaseOrders: false },
        "dataEntry"
      )
    ).toBeNull()
  })

  it("preserves the locked selection in open, form, and back links", () => {
    const selection = resolveOperationalEntrySelection(
      { main: "production_entries", sub: "rm_inward", unit: "cnc" },
      fullAccess,
      "dataEntry"
    )!

    expect(operationalEntryOpenHref(selection)).toBe(
      "/operational-entry/open?unit=cnc&main=production_entries&sub=rm_inward"
    )
    expect(operationalEntryFormHref(selection)).toBe(
      "/?tab=operationalEntryTab&floor=cnc&entry=rm_inward&operationalUnit=cnc&operationalMain=production_entries&operationalSub=rm_inward"
    )
    expect(operationalEntrySelectionHref(selection)).toBe(
      "/operational-entry?unit=cnc&main=production_entries&sub=rm_inward"
    )
    expect(
      operationalEntrySelectionMatchesDestination(selection, "/", {
        entry: "rm_inward",
        floor: "cnc",
        tab: "operationalEntryTab",
      })
    ).toBe(true)
  })

  it("routes commercial entries to their existing implementations", () => {
    const enquiry = resolveOperationalEntrySelection(
      {
        main: "commercial_entries",
        sub: "commercial_enquiries",
        unit: "universal",
      },
      fullAccess,
      "masterTables"
    )!

    expect(operationalEntryFormHref(enquiry, "masterTables")).toBe(
      "/commercial/enquiries?operationalView=masterTables&operationalUnit=universal&operationalMain=commercial_entries&operationalSub=commercial_enquiries"
    )

    const purchaseOrders = resolveOperationalEntrySelection(
      {
        main: "commercial_entries",
        sub: "commercial_purchase_orders",
        unit: "universal",
      },
      fullAccess,
      "masterTables"
    )!
    expect(operationalEntryFormHref(purchaseOrders, "masterTables")).toBe(
      "/commercial/orders?operationalView=masterTables&operationalUnit=universal&operationalMain=commercial_entries&operationalSub=commercial_purchase_orders"
    )
  })
})
