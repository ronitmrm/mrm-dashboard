import { expect, test } from "vitest"

import { exclusiveFilteredTableSelectionRows } from "@workspace/ui/lib/table-filtered-selection"

function row(group: string, checked = false) {
  return {
    checkbox: { checked, disabled: false },
    group,
    hidden: false,
  }
}

test("Select All stays within one Purchase Order", () => {
  const rows = [row("PO-100"), row("PO-100"), row("PO-200")]

  expect(
    exclusiveFilteredTableSelectionRows(rows).map(({ group }) => group)
  ).toEqual(["PO-100", "PO-100"])

  rows[2]!.checkbox.checked = true
  expect(
    exclusiveFilteredTableSelectionRows(rows).map(({ group }) => group)
  ).toEqual(["PO-200"])
})
