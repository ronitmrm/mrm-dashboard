"use client"

import { useCallback, useMemo, useState } from "react"

import {
  filterOptionsForTableColumn,
  filterRowsByTableColumns,
  sortRowsByTableColumn,
  type TableColumnFilters,
  type TableFilterColumn,
  type TableSortDirection,
} from "@workspace/ui/lib/table-filter-state"

type FilterValue = string | null | undefined

export type ExcelTableColumn<Row, Key extends string> = {
  key: Key
  label: string
  values: (row: Row) => FilterValue[]
}

export function useExcelTable<Row, Key extends string>({
  columns,
  rows,
}: {
  columns: Array<ExcelTableColumn<NoInfer<Row>, Key>>
  rows: Row[]
}) {
  const [filters, setFilters] = useState<Partial<Record<Key, string[] | null>>>(
    {}
  )
  const [sort, setSortState] = useState<{
    direction: TableSortDirection
    key: Key
  } | null>(null)

  const tableColumns = useMemo<TableFilterColumn[]>(
    () =>
      columns.map((column, index) => ({
        index,
        label: column.label,
        options: [],
      })),
    [columns]
  )
  const numericFilters = useMemo<TableColumnFilters>(
    () =>
      Object.fromEntries(
        columns.map((column, index) => [index, filters[column.key] ?? null])
      ),
    [columns, filters]
  )
  const valuesForColumn = useCallback(
    (row: Row, columnIndex: number) => columns[columnIndex]?.values(row) ?? [],
    [columns]
  )
  const options = useMemo(
    () =>
      new Map(
        columns.map((column, index) => [
          column.key,
          filterOptionsForTableColumn(
            rows,
            tableColumns,
            numericFilters,
            index,
            valuesForColumn
          ),
        ])
      ),
    [columns, numericFilters, rows, tableColumns, valuesForColumn]
  )
  const filteredRows = useMemo(
    () =>
      filterRowsByTableColumns(
        rows,
        tableColumns,
        numericFilters,
        valuesForColumn
      ),
    [numericFilters, rows, tableColumns, valuesForColumn]
  )
  const visibleRows = useMemo(() => {
    const columnIndex =
      sort === null
        ? -1
        : columns.findIndex((column) => column.key === sort.key)
    return sortRowsByTableColumn(
      filteredRows,
      sort && columnIndex >= 0
        ? { columnIndex, direction: sort.direction }
        : null,
      valuesForColumn
    )
  }, [columns, filteredRows, sort, valuesForColumn])

  const clearFilters = useCallback(() => setFilters({}), [])
  const setFilter = useCallback(
    (key: Key, selected: string[] | null) =>
      setFilters((current) => ({ ...current, [key]: selected })),
    []
  )
  const setSort = useCallback(
    (key: Key, direction: TableSortDirection) =>
      setSortState({ direction, key }),
    []
  )
  const filterProps = useCallback(
    (key: Key) => ({
      onApply: (selected: string[] | null) => setFilter(key, selected),
      onSort: (direction: TableSortDirection) => setSort(key, direction),
      options: options.get(key) ?? [],
      selected: filters[key] ?? null,
      sortDirection: sort?.key === key ? sort.direction : undefined,
    }),
    [filters, options, setFilter, setSort, sort]
  )

  return {
    clearFilters,
    filterProps,
    filters,
    hasFilters: Object.values(filters).some(Array.isArray),
    options,
    setFilter,
    setSort,
    sort,
    visibleRows,
  }
}
