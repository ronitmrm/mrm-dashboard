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

import type { createCommercialRevisionsRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { applyProductBulkRevisionPriceDecisionAction } from "../../../revisions/actions"
type Work = NonNullable<
  Awaited<
    ReturnType<
      ReturnType<
        typeof createCommercialRevisionsRepository
      >["getProductBulkRevisionCustomerCosting"]
    >
  >
>
type PriceRow = Work["rows"][number] & { values: string[] }
const formatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
})
const money = (value: number) => formatter.format(value)
const percent = (value: number) => `${money(value * 100)}%`
const pageSize = 100
const valuesForColumn = (row: PriceRow, index: number) => [
  row.values[index] ?? "",
]
export function CustomerCostingPriceTable({
  columns,
  rows,
  storageKey,
  revisionId,
}: {
  columns: string[]
  rows: PriceRow[]
  storageKey: string
  revisionId: string
}) {
  const [filters, setFilters] = useState<TableColumnFilters>({})
  const [sort, setSort] = useState<TableSort | null>(null)
  const [page, setPage] = useState(0)
  const [hydrated, setHydrated] = useState(false)
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
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {filtered.length} matching prices
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setFilters({})
            setPage(0)
          }}
        >
          Clear All Filters
        </Button>
      </div>
      <OperationalTable
        excelFilters
        filterMode="external"
        containerClassName="h-[calc(100svh-22rem)] min-h-[34rem] rounded-md border"
      >
        <TableHeader>
          <TableRow>
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
          {visible.map((price) => (
            <TableRow key={price.quoteItemId}>
              <TableCell>{price.companyName}</TableCell>
              <TableCell className="font-mono">
                {price.customerPartCode ?? "—"}
              </TableCell>
              <TableCell className="font-mono whitespace-nowrap">
                {price.uid}
              </TableCell>
              <TableCell className="max-w-64 min-w-64 break-words whitespace-normal">
                {price.description}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {price.category ?? "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {price.subcategory ?? "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
                <span>$ {money(price.approvedPriceUsd)}</span>
                <span className="block text-xs text-muted-foreground">
                  Profit {percent(price.currentProfitPercent)}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
                <span>$ {money(price.revisePriceUsd)}</span>
                <span className="block text-xs text-muted-foreground">
                  Profit {percent(price.reviseProfitPercent)}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
                <span>$ {money(price.keepSamePriceUsd)}</span>
                <span className="block text-xs text-muted-foreground">
                  Profit {percent(price.keepSameProfitPercent)}
                </span>
              </TableCell>
              <TableCell>
                {price.decision ? (
                  <Badge>{price.decision}</Badge>
                ) : (
                  <form
                    action={applyProductBulkRevisionPriceDecisionAction}
                    className="flex min-w-72 gap-2"
                  >
                    <input
                      name="bulk_price_revision_id"
                      type="hidden"
                      value={revisionId}
                    />
                    <input
                      name="source_quote_item_id"
                      type="hidden"
                      value={price.quoteItemId}
                    />
                    <NativeSelect name="decision" required>
                      <NativeSelectOption value="Revise Price">
                        Revise Price
                      </NativeSelectOption>
                      <NativeSelectOption value="Keep Price Same">
                        Keep Price Same
                      </NativeSelectOption>
                    </NativeSelect>
                    <Input name="notes" placeholder="Note" />
                    <Button type="submit">Record</Button>
                  </form>
                )}
              </TableCell>
              {price.values.slice(10).map((value, index) => (
                <TableCell className="max-w-64 min-w-32 break-words whitespace-normal tabular-nums" key={columns[index + 10]}>
                  {value}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {!visible.length && (
            <TableRow>
              <TableCell colSpan={columns.length}>
                No Affected Prices Match These Filters.
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
