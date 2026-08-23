import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("master readiness table filters", () => {
  it("keeps gap and RM controls inside their table columns", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )

    const tableSource = source.slice(
      source.indexOf("function WorkOrderGapTable"),
      source.indexOf("function WorkOrderGapRow")
    )

    expect(tableSource).not.toContain('label="Gap Type"')
    expect(tableSource).not.toContain('label="Rm Status"')
    expect(source).not.toContain("showFilters")
    expect(source).toContain('data-filter-all-label="All Gaps"')
    expect(source).toContain('data-filter-all-label="All Work Orders"')
    expect(source).toContain("data-filter-values={JSON.stringify(gaps)}")
  })
})
