"use client"

import { useEffect, useMemo, useState } from "react"
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
} from "@workspace/ui/lib/table-filter-state"
import Link from "next/link"

import { pricingHeaders } from "./pricing-workbook"
import {
  filterPricingTableRows,
  pricingFilterColumns,
  pricingPageSize,
  type PricingTableRow,
} from "./pricing-table-state"

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
  const [pageIndex, setPageIndex] = useState(0)

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
    () => filterPricingTableRows(rows, columns, filters),
    [columns, filters, rows]
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
  const firstVisible = visibleRows.length ? firstRowIndex + 1 : 0
  const lastVisible = firstRowIndex + visibleRows.length

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p role="status">
          Showing {firstVisible}–{lastVisible} of {filteredRows.length} matching
          rows. Filters use all {rows.length} pricing rows.
        </p>
        <div className="flex items-center gap-2">
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
              {columns.map((column) => (
                <TableHead
                  className="max-w-56 whitespace-nowrap"
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
                      options={column.options}
                      selected={filters[column.index] ?? null}
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
                    return (
                      <TableCell
                        className="max-w-56 whitespace-nowrap"
                        key={header}
                      >
                        {header === "Customer Part Code" &&
                        cell &&
                        revisionLinks ? (
                          <Link
                            className="font-mono text-primary underline-offset-4 hover:underline"
                            href={
                              "/commercial/pricing/revisions?customer=" +
                              encodeURIComponent(row.customerId) +
                              "&code=" +
                              encodeURIComponent(String(cell))
                            }
                          >
                            {cell}
                          </Link>
                        ) : header === "Quote Status" && cell ? (
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
