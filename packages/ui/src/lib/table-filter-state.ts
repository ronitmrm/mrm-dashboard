export type TableFilterColumn = {
  allLabel?: string
  index: number
  label: string
  options: string[]
}

export type TableColumnFilters = Record<number, string[] | null>

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
    .map(
      (column) =>
        `${column.index}:${column.label}:${column.allLabel ?? ""}`
    )
    .join("|")
  const nextSchema = nextColumns
    .map(
      (column) =>
        `${column.index}:${column.label}:${column.allLabel ?? ""}`
    )
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
