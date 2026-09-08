"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { ExcelColumnFilter } from "@workspace/ui/components/excel-column-filter"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  filterOptionsForTableColumn,
  filterRowsByTableColumns,
  parsePersistedTableFilters,
  serializeTableFilters,
  sortRowsByTableColumn,
  type TableColumnFilters,
  type TableSort,
} from "@workspace/ui/lib/table-filter-state"

type ProductRow = { id: string; uid: string; values: string[] }
const pageSize = 200
const valuesForColumn = (row: ProductRow, index: number) => [
  row.values[index] ?? "",
]

export function BulkProductSelectionTable({
  columns,
  rows,
  storageKey,
}: {
  columns: string[]
  rows: ProductRow[]
  storageKey: string
}) {
  const [filters, setFilters] = useState<TableColumnFilters>({})
  const [sort, setSort] = useState<TableSort | null>(null)
  const [page, setPage] = useState(0)
  const [hydrated, setHydrated] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const tableColumns = useMemo(
    () =>
      columns.map((label, index) => ({
        label,
        index,
        options: [],
      })),
    [columns]
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setFilters(
          parsePersistedTableFilters(
            localStorage.getItem(storageKey),
            tableColumns
          )
        )
      } catch {
        /* Browser storage may be unavailable. */
      }
      setHydrated(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [storageKey, tableColumns])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(
        storageKey,
        serializeTableFilters(tableColumns, filters)
      )
    } catch {
      /* Browser storage may be unavailable. */
    }
  }, [filters, hydrated, storageKey, tableColumns])

  const filtered = useMemo(
    () =>
      sortRowsByTableColumn(
        filterRowsByTableColumns(rows, tableColumns, filters, valuesForColumn),
        sort,
        valuesForColumn
      ),
    [rows, tableColumns, filters, sort]
  )
  const facets = useMemo(
    () =>
      tableColumns.map((column) => ({
        ...column,
        options: filterOptionsForTableColumn(
          rows,
          tableColumns,
          filters,
          column.index,
          valuesForColumn
        ),
      })),
    [rows, tableColumns, filters]
  )
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pages - 1)
  const visible = filtered.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  )
  // Match the existing bulk workflow: only selected rows matching the current filters submit.
  const submitted = filtered.filter((row) => selected.has(row.id))

  return (
    <div className="grid min-w-0 gap-2">
      {submitted.map((row) => (
        <input
          key={row.id}
          type="hidden"
          name="selected_product_ids"
          value={row.id}
        />
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span role="status" className="text-xs text-muted-foreground">
          {filtered.length} matching products · {submitted.length} selected
        </span>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              !hydrated ||
              !filtered.length ||
              submitted.length === filtered.length
            }
            title="Select every filtered product across all pages"
            onClick={() =>
              setSelected(
                (current) =>
                  new Set([...current, ...filtered.map((row) => row.id)])
              )
            }
          >
            Select All ({filtered.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selected.size}
            onClick={() => setSelected(new Set())}
          >
            Clear Selection
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!Object.values(filters).some(Array.isArray)}
            onClick={() => {
              setFilters({})
              setPage(0)
            }}
          >
            Clear All Filters
          </Button>
        </div>
      </div>
      <OperationalTable
        excelFilters
        filterMode="external"
        className="tabular-nums"
        containerClassName="h-[calc(100svh-24rem)] min-h-[34rem] rounded-md border"
      >
        <TableHeader>
          <TableRow>
            <TableHead>Select</TableHead>
            {facets.map((column) => (
              <TableHead key={column.label}>
                {column.label}
                <div className="pt-1">
                  <ExcelColumnFilter
                    label={column.label}
                    options={column.options}
                    selected={filters[column.index] ?? null}
                    sortDirection={
                      sort?.columnIndex === column.index
                        ? sort.direction
                        : undefined
                    }
                    onApply={(value) => {
                      setFilters((current) => ({
                        ...current,
                        [column.index]: value,
                      }))
                      setPage(0)
                    }}
                    onSort={(direction) => {
                      setSort({ columnIndex: column.index, direction })
                      setPage(0)
                    }}
                  />
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row) => (
            <TableRow
              key={row.id}
              data-state={selected.has(row.id) ? "selected" : undefined}
            >
              <TableCell>
                <input
                  type="checkbox"
                  aria-label={`Select ${row.uid}`}
                  checked={selected.has(row.id)}
                  disabled={!hydrated}
                  onChange={(event) => {
                    const checked = event.target.checked
                    setSelected((current) => {
                      const next = new Set(current)
                      if (checked) next.add(row.id)
                      else next.delete(row.id)
                      return next
                    })
                  }}
                />
              </TableCell>
              {row.values.map((value, index) => (
                <TableCell
                  key={columns[index]}
                  className={
                    columns[index] === "Description" ||
                    columns[index] === "Remarks"
                      ? "max-w-64 min-w-64 break-words whitespace-normal"
                      : "whitespace-nowrap"
                  }
                >
                  {value}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {!visible.length && (
            <TableRow>
              <TableCell
                colSpan={columns.length + 1}
                className="h-24 text-center"
              >
                No Products Match These Filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </OperationalTable>
      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          Previous
        </Button>
        <span className="text-xs">
          Page {currentPage + 1} of {pages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={currentPage + 1 >= pages}
          onClick={() => setPage(currentPage + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
