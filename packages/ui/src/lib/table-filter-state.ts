export type TableFilterColumn = {
  index: number
  label: string
  options: string[]
}

export type TableColumnFilters = Record<number, string[] | null>

export function filtersForTableColumns(
  currentColumns: TableFilterColumn[],
  nextColumns: TableFilterColumn[],
  currentFilters: TableColumnFilters
) {
  const currentSchema = currentColumns
    .map((column) => `${column.index}:${column.label}`)
    .join("|")
  const nextSchema = nextColumns
    .map((column) => `${column.index}:${column.label}`)
    .join("|")

  return currentSchema === nextSchema ? currentFilters : {}
}
