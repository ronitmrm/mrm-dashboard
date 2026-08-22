import { describe, expect, it } from "vitest"

import {
  isTableSecondaryPlaceholder,
  hasMeaningfulTableFilterValue,
  joinTableFilterTextParts,
  resolveTableFilterText,
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

  it("uses muted text when it is the only meaningful cell value", () => {
    expect(resolveTableFilterText(["M3"], ["-"])).toBe("M3")
    expect(resolveTableFilterText([], ["Not linked"])).toBe("Not linked")
  })

  it("keeps linked data columns filterable while ignoring control-only values", () => {
    expect(hasMeaningfulTableFilterValue(["ACME Industries", "Mayank"])).toBe(
      true
    )
    expect(hasMeaningfulTableFilterValue([undefined, "", "—"])).toBe(false)
  })
})
