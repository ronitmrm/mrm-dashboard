import { describe, expect, it } from "vitest"

import {
  isTableSecondaryPlaceholder,
  hasMeaningfulTableFilterValue,
  joinTableFilterTextParts,
  parseTableFilterValues,
  resolveTableFilterText,
  shouldShowTableFilter,
} from "@workspace/ui/lib/table-filter-display"

describe("table filter display", () => {
  it("hides empty secondary placeholders without hiding meaningful details", () => {
    expect(isTableSecondaryPlaceholder("-")).toBe(true)
    expect(isTableSecondaryPlaceholder("—")).toBe(true)
    expect(isTableSecondaryPlaceholder("   ")).toBe(true)
    expect(isTableSecondaryPlaceholder("CNC")).toBe(false)
  })

  it("keeps multiple primary labels readable in one filter value", () => {
    expect(joinTableFilterTextParts(["Planning item", "Route master"])).toBe(
      "Planning item Route master"
    )
    expect(joinTableFilterTextParts(["M3", "", undefined])).toBe("M3")
  })

  it("reads multiple independent values from one table cell", () => {
    expect(
      parseTableFilterValues(
        '["Planning Item Missing","Route Master Missing"]',
        "Planning Item Missing Route Master Missing"
      )
    ).toEqual(["Planning Item Missing", "Route Master Missing"])
    expect(parseTableFilterValues(undefined, "Rm Received")).toEqual([
      "Rm Received",
    ])
    expect(parseTableFilterValues("not-json", "Waiting Rm")).toEqual([
      "Waiting Rm",
    ])
  })

  it("uses muted text when it is the only meaningful cell value", () => {
    expect(resolveTableFilterText(["M3"], ["-"])).toBe("M3")
    expect(resolveTableFilterText([], ["Not linked"])).toBe("Not linked")
  })

  it("keeps explicitly filterable columns visible before rows exist", () => {
    expect(
      shouldShowTableFilter({
        forceFilter: true,
        hasRows: false,
        isActionColumn: false,
        label: "Customer Line Status",
        values: [],
      })
    ).toBe(true)
    expect(
      shouldShowTableFilter({
        forceFilter: false,
        hasRows: false,
        isActionColumn: false,
        label: "Customer Line Status",
        values: [],
      })
    ).toBe(true)
    expect(
      shouldShowTableFilter({
        forceFilter: false,
        hasRows: false,
        isActionColumn: true,
        label: "Actions",
        values: [],
      })
    ).toBe(false)
  })
  it("keeps linked data columns filterable while ignoring control-only values", () => {
    expect(hasMeaningfulTableFilterValue(["ACME Industries", "Mayank"])).toBe(
      true
    )
    expect(hasMeaningfulTableFilterValue([undefined, "", "—"])).toBe(false)
  })
})
