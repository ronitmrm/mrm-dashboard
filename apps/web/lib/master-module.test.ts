import { describe, expect, it } from "vitest"

import {
  availableMainMasters,
  masterFormHref,
  masterModuleAccess,
  masterSelectionMatchesDestination,
  masterSelectionHref,
  resolveMasterSelection,
  subMastersFor,
  type MasterModuleAccess,
  withMasterSelectionContext,
} from "./master-module"

const fullAccess: MasterModuleAccess = {
  commercialCustomers: true,
  commercialPricing: true,
  commercialWebsiteProducts: true,
  hrJobTemplates: true,
  hrMasters: true,
  operations: true,
  storeMasters: true,
}

describe("master module selection", () => {
  it("requires the direct Store Masters capability", () => {
    const navigationAccess = {
      administration: false,
      commercialHrefs: [],
      hrHrefs: [],
      operations: true,
      productionTabIds: ["dataEntryTab" as const, "masterTablesTab" as const],
      store: true,
      storeHrefs: ["/store"],
    }

    expect(masterModuleAccess(navigationAccess).storeMasters).toBe(false)
    expect(
      masterModuleAccess(navigationAccess, { storeMasters: true }).storeMasters
    ).toBe(true)
  })
  it("separates unit masters from Universal masters", () => {
    const unitIds = availableMainMasters("cnc", fullAccess).map(({ id }) => id)
    const universalIds = availableMainMasters("universal", fullAccess).map(
      ({ id }) => id
    )

    expect(unitIds).toContain("route")
    expect(unitIds).not.toContain("commercial_pricing_masters")
    expect(universalIds).toContain("commercial_pricing_masters")
    expect(universalIds).not.toContain("route")
  })

  it("uses the main master as a confirmed zero-sub-master fallback", () => {
    expect(subMastersFor("route", fullAccess)).toEqual({
      fallback: true,
      options: [{ id: "route", label: "Process Route" }],
    })
  })

  it("uses configured sub-masters without creating a fallback", () => {
    const result = subMastersFor("store_masters", fullAccess)!

    expect(result.fallback).toBe(false)
    expect(result.options).toContainEqual({
      id: "CATEGORY",
      label: "Asset Category",
    })
  })

  it("rejects invalid, mismatched, and unauthorized relationships", () => {
    expect(
      resolveMasterSelection(
        { main: "route", sub: "route", unit: "universal" },
        fullAccess
      )
    ).toBeNull()
    expect(
      resolveMasterSelection(
        { main: "store_masters", sub: "NOT_REAL", unit: "universal" },
        fullAccess
      )
    ).toBeNull()
    expect(
      resolveMasterSelection(
        { main: "store_masters", sub: "CATEGORY", unit: "universal" },
        { ...fullAccess, storeMasters: false }
      )
    ).toBeNull()
  })

  it("preserves the complete context in form, tab, and back links", () => {
    const selection = resolveMasterSelection(
      {
        main: "commercial_pricing_masters",
        sub: "materialGrade",
        unit: "universal",
      },
      fullAccess
    )!

    expect(masterFormHref(selection, "masterTables")).toBe(
      "/commercial/masters?masterView=masterTables&kind=materialGrade&masterUnit=universal&masterMain=commercial_pricing_masters&masterSub=materialGrade"
    )
    expect(masterSelectionHref(selection)).toBe(
      "/masters?unit=universal&main=commercial_pricing_masters&sub=materialGrade"
    )
    expect(
      withMasterSelectionContext(
        "/commercial/masters?masterView=masterTables&kind=materialGrade",
        new URLSearchParams(
          "masterUnit=universal&masterMain=commercial_pricing_masters&masterSub=materialGrade"
        )
      )
    ).toBe(
      "/commercial/masters?masterView=masterTables&kind=materialGrade&masterUnit=universal&masterMain=commercial_pricing_masters&masterSub=materialGrade"
    )
  })

  it("validates that routed forms match the selected relationship", () => {
    const selection = resolveMasterSelection(
      { main: "store_masters", sub: "CATEGORY", unit: "universal" },
      fullAccess
    )!

    expect(
      masterSelectionMatchesDestination(selection, "/", {
        entry: "store_masters",
        storeMaster: "CATEGORY",
      })
    ).toBe(true)
    expect(
      masterSelectionMatchesDestination(selection, "/", {
        entry: "store_masters",
        storeMaster: "SUPPLIER",
      })
    ).toBe(false)
  })
})
