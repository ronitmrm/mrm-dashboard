import { describe, expect, it } from "vitest"

import {
  filtersForTableColumns,
  parsePersistedTableFilters,
  serializeTableFilters,
} from "@workspace/ui/lib/table-filter-state"

describe("table filter state", () => {
  it("clears filters when a Production master changes its columns", () => {
    const machineColumns = [
      { index: 0, label: "Machine no.", options: ["1", "2"] },
      { index: 1, label: "Machine type", options: ["Manual"] },
    ]
    const routeColumns = [
      { index: 0, label: "Part no.", options: ["P-1"] },
      { index: 1, label: "Option no.", options: ["1"] },
      { index: 2, label: "Setup no.", options: ["10"] },
    ]

    expect(
      filtersForTableColumns(machineColumns, routeColumns, { 0: ["1"] })
    ).toEqual({})
  })

  it("keeps filters when only the values in the same columns refresh", () => {
    const currentColumns = [
      { index: 0, label: "Machine no.", options: ["1", "2"] },
    ]
    const nextColumns = [
      { index: 0, label: "Machine no.", options: ["1", "2", "3"] },
    ]
    const filters = { 0: ["1"] }

    expect(filtersForTableColumns(currentColumns, nextColumns, filters)).toBe(
      filters
    )
  })

  it("round-trips versioned filters only for the same column schema", () => {
    const columns = [
      { index: 0, label: "ENQ No.", options: ["ENQ-1", "ENQ-2"] },
      { index: 1, label: "Status", options: ["With Sales"] },
    ]
    const stored = serializeTableFilters(columns, {
      0: ["ENQ-1"],
      1: null,
    })

    expect(parsePersistedTableFilters(stored, columns)).toEqual({
      0: ["ENQ-1"],
      1: null,
    })
    expect(
      parsePersistedTableFilters(stored, [
        { index: 0, label: "Different", options: [] },
      ])
    ).toEqual({})
    expect(parsePersistedTableFilters("not-json", columns)).toEqual({})
  })
})
