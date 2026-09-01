import { describe, expect, it } from "vitest"

import {
  filteredTableSelectionState,
  selectAllFilteredTableRows,
} from "@workspace/ui/lib/table-filtered-selection"

describe("filtered table selection", () => {
  it("selects visible rows without changing rows excluded by active filters", () => {
    const visibleUnchecked = { checked: false, disabled: false }
    const visibleChecked = { checked: true, disabled: false }
    const filteredOut = { checked: false, disabled: false }
    const disabled = { checked: false, disabled: true }
    const rows = [
      { checkbox: visibleUnchecked, hidden: false },
      { checkbox: visibleChecked, hidden: false },
      { checkbox: filteredOut, hidden: true },
      { checkbox: disabled, hidden: false },
    ]

    expect(selectAllFilteredTableRows(rows)).toEqual([visibleUnchecked])
    expect(filteredTableSelectionState(rows)).toEqual({
      selectableCount: 2,
      selectedCount: 2,
    })
    expect(filteredOut.checked).toBe(false)
    expect(disabled.checked).toBe(false)
  })
})
