export type FilteredTableSelectionCheckbox = {
  checked: boolean
  disabled: boolean
}

export type FilteredTableSelectionRow<
  Checkbox extends FilteredTableSelectionCheckbox =
    FilteredTableSelectionCheckbox,
> = {
  checkbox?: Checkbox
  group?: string
  hidden: boolean
}

export function exclusiveFilteredTableSelectionRows<
  Checkbox extends FilteredTableSelectionCheckbox,
>(rows: FilteredTableSelectionRow<Checkbox>[]) {
  const selectedGroup = rows.find((row) => row.checkbox?.checked)?.group
  const firstSelectableGroup = rows.find((row) => {
    const checkbox = row.checkbox
    return !row.hidden && checkbox && !checkbox.disabled
  })?.group
  const activeGroup = selectedGroup ?? firstSelectableGroup
  return activeGroup === undefined
    ? rows
    : rows.filter((row) => row.group === activeGroup)
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
>(
  rows: FilteredTableSelectionRow<Checkbox>[],
  onSelect?: (checkbox: Checkbox) => void
) {
  const changed: Checkbox[] = []
  for (const row of rows) {
    const checkbox = row.checkbox
    if (row.hidden || !checkbox || checkbox.disabled || checkbox.checked)
      continue
    if (onSelect) onSelect(checkbox)
    else checkbox.checked = true
    changed.push(checkbox)
  }
  return changed
}
