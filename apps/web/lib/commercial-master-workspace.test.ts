import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  commercialMasterSelection,
  commercialMasterTemplateHref,
  commercialMasterViewHref,
} from "./commercial-master-workspace"

describe("commercial master workspace", () => {
  it("keeps Material Grade selected between entry and table views", () => {
    expect(commercialMasterSelection("materialGrade")).toEqual({
      entryKind: "materialGrade",
      label: "Material grade",
      tableKind: "commercial_material_grade",
    })
    expect(commercialMasterViewHref("masterTables", "materialGrade")).toBe(
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

  it("exposes Buyer as a dedicated commercial master", () => {
    expect(commercialMasterSelection("buyer")).toMatchObject({
      entryKind: "commercialTerm",
      label: "Buyer",
      tableKind: "commercial_commercial_term",
      termType: "buyer",
      workspaceKind: "buyer",
    })
    expect(commercialMasterViewHref("dataEntry", "buyer")).toBe(
      "/commercial/masters?masterView=dataEntry&kind=buyer"
    )
  })

  it("downloads the source workbook sheet for the selected master", () => {
    expect(commercialMasterTemplateHref("materialGrade")).toBe(
      "/commercial/masters/template.csv?master=grades"
    )
    expect(commercialMasterTemplateHref("commercial_shipping")).toBe(
      "/commercial/masters/template.csv?master=shipping"
    )
    expect(commercialMasterTemplateHref("buyer")).toBe(
      "/commercial/masters/template.csv?master=commercials&termType=buyer"
    )
  })

  it("falls back safely when the address contains an unknown master", () => {
    expect(commercialMasterSelection("unknown").entryKind).toBe("materialGrade")
  })

  it("locks the selected Commercial table", () => {
    const source = readFileSync(
      new URL("../app/commercial/masters/page.tsx", import.meta.url),
      "utf8"
    )

    expect(source).toContain("<CommercialMasterTable")
    expect(source).toContain("selectionLocked={true}")
  })
})
