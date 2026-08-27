export type TableFilterColumn = {
  allLabel?: string
  index: number
  label: string
  options: string[]
}

export type TableColumnFilters = Record<number, string[] | null>
export type TableSortDirection = "asc" | "desc"
export type TableSort = {
  columnIndex: number
  direction: TableSortDirection
}

const dashOnly = /^[\s\u2010-\u2015\u2212-]+$/u
const tableValueCollator = new Intl.Collator("en-IN", { numeric: true })

export function normalizedTableFilterValue(value: string | null | undefined) {
  const normalized = value?.trim() ?? ""
  return !normalized || dashOnly.test(normalized) ? "-" : normalized
}

export function uniqueTableFilterOptions(
  values: Array<string | null | undefined>
) {
  return [...new Set(values.map(normalizedTableFilterValue))].sort(
    tableValueCollator.compare
  )
}

export function matchesTableColumnFilter(
  value: string | null | undefined,
  selected: string[] | null
) {
  return (
    selected === null || selected.includes(normalizedTableFilterValue(value))
  )
}

type TableColumnValues<Row> = (
  row: Row,
  columnIndex: number
) => Array<string | null | undefined>

export function filterRowsByTableColumns<Row>(
  rows: Row[],
  columns: TableFilterColumn[],
  filters: TableColumnFilters,
  valuesForColumn: TableColumnValues<Row>,
  excludedColumnIndex?: number
) {
  return rows.filter((row) =>
    columns.every((column) => {
      if (column.index === excludedColumnIndex) return true
      const selected = filters[column.index] ?? null
      return valuesForColumn(row, column.index).some((value) =>
        matchesTableColumnFilter(value, selected)
      )
    })
  )
}

export function filterOptionsForTableColumn<Row>(
  rows: Row[],
  columns: TableFilterColumn[],
  filters: TableColumnFilters,
  columnIndex: number,
  valuesForColumn: TableColumnValues<Row>
) {
  return uniqueTableFilterOptions(
    filterRowsByTableColumns(
      rows,
      columns,
      filters,
      valuesForColumn,
      columnIndex
    ).flatMap((row) => valuesForColumn(row, columnIndex))
  )
}

export function sortRowsByTableColumn<Row>(
  rows: Row[],
  sort: TableSort | null,
  valuesForColumn: TableColumnValues<Row>
) {
  if (sort === null) return rows
  const direction = sort.direction === "asc" ? 1 : -1
  return rows
    .map((row, originalIndex) => ({ originalIndex, row }))
    .sort((left, right) => {
      const leftValue = normalizedTableFilterValue(
        valuesForColumn(left.row, sort.columnIndex)[0]
      )
      const rightValue = normalizedTableFilterValue(
        valuesForColumn(right.row, sort.columnIndex)[0]
      )
      return (
        tableValueCollator.compare(leftValue, rightValue) * direction ||
        left.originalIndex - right.originalIndex
      )
    })
    .map(({ row }) => row)
}

export function prepareFilterDraftForSearch({
  draft,
  nextQuery,
  options,
  previousQuery,
}: {
  draft: string[]
  nextQuery: string
  options: string[]
  previousQuery: string
}) {
  return !previousQuery.trim() &&
    nextQuery.trim() &&
    options.length > 0 &&
    options.every((option) => draft.includes(option))
    ? []
    : draft
}

const persistedTableFilterVersion = 1

function columnSchema(columns: TableFilterColumn[]) {
  return columns.map(({ allLabel, index, label }) => ({
    allLabel,
    index,
    label,
  }))
}

export function filtersForTableColumns(
  currentColumns: TableFilterColumn[],
  nextColumns: TableFilterColumn[],
  currentFilters: TableColumnFilters
) {
  const currentSchema = currentColumns
    .map((column) => `${column.index}:${column.label}:${column.allLabel ?? ""}`)
    .join("|")
  const nextSchema = nextColumns
    .map((column) => `${column.index}:${column.label}:${column.allLabel ?? ""}`)
    .join("|")

  return currentSchema === nextSchema ? currentFilters : {}
}

export function serializeTableFilters(
  columns: TableFilterColumn[],
  filters: TableColumnFilters
) {
  return JSON.stringify({
    columns: columnSchema(columns),
    filters,
    version: persistedTableFilterVersion,
  })
}

export function parsePersistedTableFilters(
  value: string | null,
  columns: TableFilterColumn[]
): TableColumnFilters {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as {
      columns?: unknown
      filters?: unknown
      version?: unknown
    }
    if (
      parsed.version !== persistedTableFilterVersion ||
      JSON.stringify(parsed.columns) !==
        JSON.stringify(columnSchema(columns)) ||
      !parsed.filters ||
      typeof parsed.filters !== "object" ||
      Array.isArray(parsed.filters)
    ) {
      return {}
    }
    const validIndexes = new Set(columns.map((column) => String(column.index)))
    const filters: TableColumnFilters = {}
    for (const [index, selected] of Object.entries(parsed.filters)) {
      if (!validIndexes.has(index)) return {}
      if (
        selected !== null &&
        (!Array.isArray(selected) ||
          selected.some((option) => typeof option !== "string"))
      ) {
        return {}
      }
      filters[Number(index)] = selected as string[] | null
    }
    return filters
  } catch {
    return {}
  }
}
