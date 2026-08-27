import { uniqueFilterOptions } from "@workspace/ui/components/excel-column-filter"
import {
  filterOptionsForTableColumn,
  filterRowsByTableColumns,
  sortRowsByTableColumn,
  TableColumnFilters,
  TableFilterColumn,
  type TableSort,
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

function pricingValuesForColumn(
  columns: TableFilterColumn[],
  row: PricingTableRow,
  columnIndex: number
) {
  const column = columns.find((candidate) => candidate.index === columnIndex)
  return [filterValue(column ? row.values[column.label] : undefined)]
}

export function facetedPricingFilterColumns(
  rows: PricingTableRow[],
  columns: TableFilterColumn[],
  filters: TableColumnFilters
) {
  return columns.map((column) => ({
    ...column,
    options: filterOptionsForTableColumn(
      rows,
      columns,
      filters,
      column.index,
      (row, columnIndex) => pricingValuesForColumn(columns, row, columnIndex)
    ),
  }))
}

export function filterPricingTableRows(
  rows: PricingTableRow[],
  columns: TableFilterColumn[],
  filters: TableColumnFilters
) {
  return filterRowsByTableColumns(rows, columns, filters, (row, columnIndex) =>
    pricingValuesForColumn(columns, row, columnIndex)
  )
}

export function sortPricingTableRows(
  rows: PricingTableRow[],
  columns: TableFilterColumn[],
  sort: TableSort | null
) {
  return sortRowsByTableColumn(rows, sort, (row, columnIndex) =>
    pricingValuesForColumn(columns, row, columnIndex)
  )
}
