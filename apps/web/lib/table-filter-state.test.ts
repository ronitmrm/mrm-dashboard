import { describe, expect, it } from "vitest"

import {
  filterOptionsForTableColumn,
  filterRowsByTableColumns,
  filtersForTableColumns,
  parsePersistedTableFilters,
  prepareFilterDraftForSearch,
  serializeTableFilters,
  sortRowsByTableColumn,
} from "@workspace/ui/lib/table-filter-state"

describe("table filter state", () => {
  const rows = [
    { customer: "MRM", status: "Open", uid: "P-10" },
    { customer: "MRM", status: "Closed", uid: "P-2" },
    { customer: "Acme", status: "Open", uid: "P-1" },
  ]
  const columns = [
    { index: 0, label: "Customer", options: ["Acme", "MRM"] },
    { index: 1, label: "Status", options: ["Closed", "Open"] },
    { index: 2, label: "UID", options: ["P-1", "P-2", "P-10"] },
  ]
  const valuesForColumn = (row: (typeof rows)[number], columnIndex: number) => [
    String(row[columns[columnIndex]?.label.toLowerCase() as keyof typeof row]),
  ]

  it("starts a searched all-values draft empty so one found value can be selected", () => {
    expect(
      prepareFilterDraftForSearch({
        draft: ["Acme", "MRM"],
        nextQuery: "mrm",
        options: ["Acme", "MRM"],
        previousQuery: "",
      })
    ).toEqual([])
    expect(
      prepareFilterDraftForSearch({
        draft: ["MRM"],
        nextQuery: "mr",
        options: ["Acme", "MRM"],
        previousQuery: "m",
      })
    ).toEqual(["MRM"])
  })

  it("offers values matching every other active column filter", () => {
    const filters = { 0: ["MRM"], 1: ["Closed"] }

    expect(
      filterOptionsForTableColumn(rows, columns, filters, 1, valuesForColumn)
    ).toEqual(["Closed", "Open"])
    expect(
      filterOptionsForTableColumn(rows, columns, filters, 0, valuesForColumn)
    ).toEqual(["MRM"])
    expect(
      filterRowsByTableColumns(rows, columns, filters, valuesForColumn).map(
        (row) => row.uid
      )
    ).toEqual(["P-2"])
  })

  it("sorts text naturally in either Excel direction without mutating rows", () => {
    expect(
      sortRowsByTableColumn(
        rows,
        { columnIndex: 2, direction: "asc" },
        valuesForColumn
      ).map((row) => row.uid)
    ).toEqual(["P-1", "P-2", "P-10"])
    expect(
      sortRowsByTableColumn(
        rows,
        { columnIndex: 2, direction: "desc" },
        valuesForColumn
      ).map((row) => row.uid)
    ).toEqual(["P-10", "P-2", "P-1"])
    expect(rows.map((row) => row.uid)).toEqual(["P-10", "P-2", "P-1"])
  })

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
