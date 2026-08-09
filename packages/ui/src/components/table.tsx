"use client"

import * as React from "react"
import { FilterX } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  ExcelColumnFilter,
  matchesColumnFilter,
  uniqueFilterOptions,
} from "@workspace/ui/components/excel-column-filter"
import { cn } from "@workspace/ui/lib/utils"

type ExcelFilterColumn = {
  index: number
  label: string
  options: string[]
}

type TableProps = React.ComponentProps<"table"> & {
  excelFilters?: boolean
}

function tableSnapshot(table: HTMLTableElement) {
  const headerRows = table.tHead?.rows
  const firstHeaderRow = headerRows?.item(0)
  const secondHeaderRow = headerRows?.item(1)
  const bodyRows = Array.from(table.tBodies).flatMap((body) =>
    Array.from(body.rows)
  )
  const hasExcelFilterRow = Boolean(
    secondHeaderRow?.querySelector('button[aria-label^="Filter "]')
  )
  const hasLegacyFilterRow = Boolean(
    secondHeaderRow?.querySelector('select[aria-label^="Filter "]')
  )

  if (secondHeaderRow) secondHeaderRow.hidden = hasLegacyFilterRow

  if (
    !firstHeaderRow ||
    !bodyRows.length ||
    hasExcelFilterRow ||
    ((headerRows?.length ?? 0) > 1 && !hasLegacyFilterRow)
  ) {
    return { columns: [], rows: [] }
  }

  const headerCells = Array.from(firstHeaderRow.cells)
  const rows = bodyRows.filter(
    (row) =>
      row.cells.length === headerCells.length &&
      Array.from(row.cells).every((cell) => cell.colSpan === 1)
  )
  const columns = headerCells.flatMap((cell, index) => {
    const label = cell.textContent?.trim() ?? ""
    const cells = rows.map((row) => row.cells.item(index))
    const isActionColumn = cells.every((rowCell) =>
      rowCell?.querySelector("a, button, form, input, select, textarea")
    )
    if (!label || !rows.length || isActionColumn) return []

    return [
      {
        index,
        label,
        options: uniqueFilterOptions(cells.map((rowCell) => rowCell?.textContent)),
      },
    ]
  })

  return { columns, rows }
}

function sameColumns(left: ExcelFilterColumn[], right: ExcelFilterColumn[]) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function Table({ className, excelFilters = true, ...props }: TableProps) {
  const tableRef = React.useRef<HTMLTableElement>(null)
  const [columns, setColumns] = React.useState<ExcelFilterColumn[]>([])
  const [filters, setFilters] = React.useState<
    Record<number, string[] | null>
  >({})
  const activeFilterCount = Object.values(filters).filter(
    (filter) => filter !== null && filter !== undefined
  ).length

  const refreshTable = React.useCallback(() => {
    const table = tableRef.current
    if (!table || !excelFilters) return

    const snapshot = tableSnapshot(table)
    setColumns((current) =>
      sameColumns(current, snapshot.columns) ? current : snapshot.columns
    )

    for (const row of snapshot.rows) {
      row.hidden = snapshot.columns.some((column) => {
        const selected = filters[column.index] ?? null
        const value = row.cells.item(column.index)?.textContent
        return !matchesColumnFilter(value, selected)
      })
    }
  }, [excelFilters, filters])

  React.useLayoutEffect(() => {
    refreshTable()
  }, [props.children, refreshTable])

  React.useEffect(() => {
    const table = tableRef.current
    if (!table || !excelFilters) return

    const observer = new MutationObserver(refreshTable)
    observer.observe(table, {
      characterData: true,
      childList: true,
      subtree: true,
    })
    return () => observer.disconnect()
  }, [excelFilters, refreshTable])

  React.useEffect(() => {
    if (excelFilters) return
    const table = tableRef.current
    if (!table) return
    for (const body of Array.from(table.tBodies)) {
      for (const row of Array.from(body.rows)) row.hidden = false
    }
  }, [excelFilters])

  return (
    <div className="w-full space-y-2" data-slot="table-shell">
      {columns.length ? (
        <div
          className="overflow-x-auto rounded-lg border bg-muted/20 p-2"
          data-slot="table-excel-filters"
        >
          <div className="flex w-max min-w-full items-end gap-2">
            {columns.map((column) => (
              <div className="grid gap-1" key={column.index}>
                <span className="max-w-36 truncate px-0.5 text-[11px] font-medium text-muted-foreground">
                  {column.label}
                </span>
                <ExcelColumnFilter
                  label={column.label}
                  onApply={(selected) =>
                    setFilters((current) => ({
                      ...current,
                      [column.index]: selected,
                    }))
                  }
                  options={column.options}
                  selected={filters[column.index] ?? null}
                />
              </div>
            ))}
            {activeFilterCount ? (
              <Button
                className="ml-auto"
                onClick={() => setFilters({})}
                size="sm"
                type="button"
                variant="ghost"
              >
                <FilterX />
                Clear all
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        data-slot="table-container"
        className="relative w-full overflow-x-auto"
      >
        <table
          ref={tableRef}
          data-slot="table"
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-12 px-3 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
