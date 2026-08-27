"use client"

import { useEffect, useMemo, useState } from "react"
import { FilterX } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { ExcelColumnFilter } from "@workspace/ui/components/excel-column-filter"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  parsePersistedTableFilters,
  serializeTableFilters,
  type TableColumnFilters,
  type TableSort,
} from "@workspace/ui/lib/table-filter-state"
import Link from "next/link"

import {
  isPricingFormulaCell,
  isPricingFormulaHeader,
  pricingHeaders,
} from "./pricing-workbook"
import {
  facetedPricingFilterColumns,
  filterPricingTableRows,
  pricingFilterColumns,
  pricingPageSize,
  sortPricingTableRows,
  type PricingTableRow,
} from "./pricing-table-state"

const widePricingColumns = new Set([
  "Description",
  "MRMPL Product Description",
  "Enquiry Description",
  "Missing Pricing Values",
  "Remarks",
])

const mediumPricingColumns = new Set([
  "Change Date",
  "Customer Part Code",
  "Customer",
  "Production Type",
  "Shipping",
  "Packaging",
])

const compactPricingColumns = new Set([
  "Row Type",
  "Pricing Scope",
  "Customer Line Status",
  "Price Rev",
  "Under",
  "BOM Qty",
  "Q/P",
  "ENQ",
  "Line",
])

function pricingColumnWidth(header: string) {
  if (widePricingColumns.has(header)) return "w-72 min-w-72 max-w-72"
  if (mediumPricingColumns.has(header)) return "w-48 min-w-48 max-w-48"
  if (compactPricingColumns.has(header)) return "w-32 min-w-32 max-w-32"
  return "w-40 min-w-40 max-w-40"
}
export function PricingTable({
  filterStorageKey,
  revisionLinks = true,
  rows,
}: {
  filterStorageKey?: string
  revisionLinks?: boolean
  rows: PricingTableRow[]
}) {
  const columns = useMemo(
    () => pricingFilterColumns(rows, pricingHeaders),
    [rows]
  )
  const [filters, setFilters] = useState<TableColumnFilters>({})
  const [filtersHydrated, setFiltersHydrated] = useState(false)
  const [sort, setSort] = useState<TableSort | null>(null)
  const [pageIndex, setPageIndex] = useState(0)

  const facetedColumns = useMemo(
    () => facetedPricingFilterColumns(rows, columns, filters),
    [columns, filters, rows]
  )

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      if (filterStorageKey) {
        try {
          setFilters(
            parsePersistedTableFilters(
              window.localStorage.getItem(filterStorageKey),
              columns
            )
          )
        } catch {
          setFilters({})
        }
      }
      setPageIndex(0)
      setFiltersHydrated(true)
    }, 0)
    return () => window.clearTimeout(hydrationTimer)
  }, [columns, filterStorageKey])
  useEffect(() => {
    if (!filterStorageKey || !filtersHydrated) return
    try {
      window.localStorage.setItem(
        filterStorageKey,
        serializeTableFilters(columns, filters)
      )
    } catch {
      // Storage can be unavailable in private or policy-restricted browsers.
    }
  }, [columns, filterStorageKey, filters, filtersHydrated])

  const filteredRows = useMemo(
    () =>
      sortPricingTableRows(
        filterPricingTableRows(rows, columns, filters),
        columns,
        sort
      ),
    [columns, filters, rows, sort]
  )
  const pageCount = Math.max(
    1,
    Math.ceil(filteredRows.length / pricingPageSize)
  )
  const currentPage = Math.min(pageIndex, pageCount - 1)
  const firstRowIndex = currentPage * pricingPageSize
  const visibleRows = filteredRows.slice(
    firstRowIndex,
    firstRowIndex + pricingPageSize
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-3 rounded-sm border border-sky-300 bg-sky-100 dark:border-sky-700 dark:bg-sky-950/60"
          />
          Formula-derived cells
        </div>
        <div className="flex items-center gap-2">
          <Button
            aria-label="Clear all pricing table filters"
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
          containerClassName="max-h-none overflow-visible"
          className="min-w-max text-xs"
          filterMode="external"
        >
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              {facetedColumns.map((column) => (
                <TableHead
                  className={`${pricingColumnWidth(column.label)} overflow-hidden whitespace-nowrap ${
                    isPricingFormulaHeader(column.label)
                      ? "bg-sky-100/80 dark:bg-sky-950/40"
                      : ""
                  }`}
                  data-filterable="true"
                  key={column.label}
                >
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
                        setSort({
                          columnIndex: column.index,
                          direction,
                        })
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
              visibleRows.map((row) => (
                <TableRow
                  className="[contain-intrinsic-size:auto_48px] [content-visibility:auto]"
                  key={row.rowKey}
                >
                  {pricingHeaders.map((header) => {
                    const cell = row.values[header]
                    const formulaCell = isPricingFormulaCell(header, row.values)
                    return (
                      <TableCell
                        className={`${pricingColumnWidth(header)} overflow-hidden text-ellipsis whitespace-nowrap ${
                          formulaCell ? "!bg-sky-100 dark:!bg-sky-950/60" : ""
                        }`}
                        key={header}
                        title={cell === "" ? undefined : String(cell)}
                      >
                        {header === "Customer Part Code" &&
                        cell !== "-" &&
                        row.customerId &&
                        revisionLinks ? (
                          <Link
                            className="block truncate font-mono text-primary underline-offset-4 hover:underline"
                            href={
                              "/commercial/pricing/revisions?customer=" +
                              encodeURIComponent(row.customerId) +
                              "&code=" +
                              encodeURIComponent(String(cell))
                            }
                          >
                            {cell}
                          </Link>
                        ) : header === "Quote Status" &&
                          cell &&
                          cell !== "-" ? (
                          <Badge variant="secondary">{cell}</Badge>
                        ) : (
                          cell
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-32 text-center text-muted-foreground"
                  colSpan={pricingHeaders.length}
                >
                  No Pricing Rows Match This View.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
