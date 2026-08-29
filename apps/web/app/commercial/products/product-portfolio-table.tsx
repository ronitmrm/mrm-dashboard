"use client"

import { useEffect, useMemo, useState } from "react"
import { FilterX } from "lucide-react"

import type { ProductPortfolioRow } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  ExcelColumnFilter,
  uniqueFilterOptions,
} from "@workspace/ui/components/excel-column-filter"
import {
  Table,
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
  type TableFilterColumn,
  type TableSort,
} from "@workspace/ui/lib/table-filter-state"

const pageSize = 200
const filterStorageKey = "mrmpl:commercial:product-portfolio:filters:v2"

const columns = [
  { key: "uid", label: "Product UID" },
  { key: "itemType", label: "List / Package" },
  { key: "productSize", label: "Product Size" },
  { key: "rodSize", label: "Rod Size" },
  { key: "category", label: "Category" },
  { key: "subCategory", label: "Subcategory" },
  { key: "mrmplDescription", label: "MRMPL Description" },
  { key: "productType", label: "Product Type" },
] as const satisfies ReadonlyArray<{
  key: keyof ProductPortfolioRow
  label: string
}>

function valueForColumn(row: ProductPortfolioRow, columnIndex: number) {
  const column = columns[columnIndex]
  return [column ? String(row[column.key] ?? "") : ""]
}

export function ProductPortfolioTable({
  rows,
}: {
  rows: ProductPortfolioRow[]
}) {
  const [filters, setFilters] = useState<TableColumnFilters>({})
  const [filtersHydrated, setFiltersHydrated] = useState(false)
  const [sort, setSort] = useState<TableSort | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const tableColumns = useMemo<TableFilterColumn[]>(
    () =>
      columns.map((column, index) => ({
        index,
        label: column.label,
        options: uniqueFilterOptions(
          rows.map((row) => valueForColumn(row, index)[0] ?? "")
        ),
      })),
    [rows]
  )

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      try {
        setFilters(
          parsePersistedTableFilters(
            window.localStorage.getItem(filterStorageKey),
            tableColumns
          )
        )
      } catch {
        setFilters({})
      }
      setPageIndex(0)
      setFiltersHydrated(true)
    }, 0)
    return () => window.clearTimeout(hydrationTimer)
  }, [tableColumns])

  useEffect(() => {
    if (!filtersHydrated) return
    try {
      window.localStorage.setItem(
        filterStorageKey,
        serializeTableFilters(tableColumns, filters)
      )
    } catch {
      // Storage can be unavailable in private or policy-restricted browsers.
    }
  }, [filters, filtersHydrated, tableColumns])

  const filteredRows = useMemo(
    () =>
      sortRowsByTableColumn(
        filterRowsByTableColumns(rows, tableColumns, filters, valueForColumn),
        sort,
        valueForColumn
      ),
    [filters, rows, sort, tableColumns]
  )
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(pageIndex, pageCount - 1)
  const visibleRows = filteredRows.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  )
  const facetedColumns = useMemo(
    () =>
      tableColumns.map((column) => ({
        ...column,
        options: filterOptionsForTableColumn(
          rows,
          tableColumns,
          filters,
          column.index,
          valueForColumn
        ),
      })),
    [filters, rows, tableColumns]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {filteredRows.length} of {rows.length} products
        </span>
        <div className="flex items-center gap-2">
          <Button
            aria-label="Clear all product portfolio filters"
            disabled={!Object.values(filters).some(Array.isArray)}
            onClick={() => {
              setFilters({})
              setPageIndex(0)
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <FilterX data-icon="inline-start" />
            Clear All Filters
          </Button>
          <Button
            disabled={currentPage === 0}
            onClick={() => setPageIndex((value) => Math.max(0, value - 1))}
            size="sm"
            type="button"
            variant="outline"
          >
            Previous
          </Button>
          <span>
            Page {currentPage + 1} of {pageCount}
          </span>
          <Button
            disabled={currentPage + 1 >= pageCount}
            onClick={() =>
              setPageIndex((value) => Math.min(pageCount - 1, value + 1))
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Next
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border">
        <Table
          className="min-w-[76rem] text-xs"
          containerClassName="max-h-none overflow-visible"
          filterMode="external"
        >
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              {facetedColumns.map((column) => (
                <TableHead data-filterable="true" key={column.label}>
                  <span className="block">{column.label}</span>
                  <div className="pt-1">
                    <ExcelColumnFilter
                      label={column.label}
                      onApply={(selected) => {
                        setFilters((current) => ({
                          ...current,
                          [column.index]: selected,
                        }))
                        setPageIndex(0)
                      }}
                      onSort={(direction) => {
                        setSort({ columnIndex: column.index, direction })
                        setPageIndex(0)
                      }}
                      options={column.options}
                      selected={filters[column.index] ?? null}
                      sortDirection={
                        sort?.columnIndex === column.index
                          ? sort.direction
                          : undefined
                      }
                    />
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length ? (
              visibleRows.map((product) => (
                <TableRow key={product.uid}>
                  <TableCell className="font-mono font-medium" translate="no">
                    {product.uid}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{product.itemType}</Badge>
                  </TableCell>
                  <TableCell>{product.productSize || "—"}</TableCell>
                  <TableCell>{product.rodSize || "—"}</TableCell>
                  <TableCell>{product.category || "—"}</TableCell>
                  <TableCell>{product.subCategory || "—"}</TableCell>
                  <TableCell className="max-w-96 break-words whitespace-normal">
                    {product.mrmplDescription}
                  </TableCell>
                  <TableCell>{product.productType || "—"}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-32 text-center text-muted-foreground"
                  colSpan={columns.length}
                >
                  No Products Match These Filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
