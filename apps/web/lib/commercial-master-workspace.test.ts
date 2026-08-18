import { describe, expect, it } from "vitest"

import {
  commercialMasterSelection,
  commercialMasterViewHref,
} from "./commercial-master-workspace"

describe("commercial master workspace", () => {
  it("keeps Material Grade selected between entry and table views", () => {
    expect(commercialMasterSelection("materialGrade")).toEqual({
      entryKind: "materialGrade",
      label: "Material grade",
      tableKind: "commercial_material_grade",
    })
    expect(
      commercialMasterViewHref("masterTables", "materialGrade")
    ).toBe(
      "/commercial/masters?masterView=masterTables&kind=materialGrade"
    )
  })

  it("maps every table kind back to its entry form", () => {
    expect(commercialMasterSelection("commercial_shipping")).toEqual({
      entryKind: "shippingTerm",
      label: "Shipping term",
      tableKind: "commercial_shipping",
    })
  })

  it("falls back safely when the address contains an unknown master", () => {
    expect(commercialMasterSelection("unknown").entryKind).toBe(
      "materialGrade"
    )
  })
})
