export type FilteredTableSelectionCheckbox = {
  checked: boolean
  disabled: boolean
}

export type FilteredTableSelectionRow<
  Checkbox extends FilteredTableSelectionCheckbox =
    FilteredTableSelectionCheckbox,
> = {
  checkbox?: Checkbox
  hidden: boolean
}

export function filteredTableSelectionState(rows: FilteredTableSelectionRow[]) {
  const selectable = rows.flatMap((row) => {
    const checkbox = row.checkbox
    return !row.hidden && checkbox && !checkbox.disabled ? [checkbox] : []
  })

  return {
    selectableCount: selectable.length,
    selectedCount: selectable.filter((checkbox) => checkbox.checked).length,
  }
}

export function selectAllFilteredTableRows<
  Checkbox extends FilteredTableSelectionCheckbox,
>(rows: FilteredTableSelectionRow<Checkbox>[]) {
  const changed: Checkbox[] = []
  for (const row of rows) {
    const checkbox = row.checkbox
    if (row.hidden || !checkbox || checkbox.disabled || checkbox.checked)
      continue
    checkbox.checked = true
    changed.push(checkbox)
  }
  return changed
}
