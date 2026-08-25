import {
  matchesColumnFilter,
  uniqueFilterOptions,
} from "@workspace/ui/components/excel-column-filter"
import type {
  TableColumnFilters,
  TableFilterColumn,
} from "@workspace/ui/lib/table-filter-state"

export type PricingTableRow = {
  customerId: string
  rowKey: string
  values: Record<string, string | number>
}

export const pricingPageSize = 200

function filterValue(value: string | number | undefined) {
  return value === undefined ? "" : String(value)
}

export function pricingFilterColumns(
  rows: PricingTableRow[],
  headers: string[]
): TableFilterColumn[] {
  return headers.map((label, index) => ({
    index,
    label,
    options: uniqueFilterOptions(
      rows.map((row) => filterValue(row.values[label]))
    ),
  }))
}

export function filterPricingTableRows(
  rows: PricingTableRow[],
  columns: TableFilterColumn[],
  filters: TableColumnFilters
) {
  const activeFilters = columns.flatMap((column) => {
    const selected = filters[column.index] ?? null
    return selected === null ? [] : [{ column, selected }]
  })
  if (!activeFilters.length) return rows

  return rows.filter((row) =>
    activeFilters.every(({ column, selected }) =>
      matchesColumnFilter(filterValue(row.values[column.label]), selected)
    )
  )
}
