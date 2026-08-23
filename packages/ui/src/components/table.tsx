"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import {
  ExcelColumnFilter,
  matchesColumnFilter,
  uniqueFilterOptions,
} from "@workspace/ui/components/excel-column-filter"
import { cn } from "@workspace/ui/lib/utils"
import {
  filtersForTableColumns,
  parsePersistedTableFilters,
  serializeTableFilters,
  type TableColumnFilters,
  type TableFilterColumn,
} from "@workspace/ui/lib/table-filter-state"
import {
  isTableSecondaryPlaceholder,
  resolveTableFilterText,
  shouldShowTableFilter,
  tableFilterIgnoredSelector,
  tableFilterSecondarySelector,
  tableSecondaryTextSelector,
} from "@workspace/ui/lib/table-filter-display"

type TableProps = React.ComponentProps<"table"> & {
  excelFilters?: boolean
  filterStorageKey?: string
}

function headerLabel(cell: HTMLTableCellElement) {
  if (cell.dataset.filterLabel) return cell.dataset.filterLabel
  const clone = cell.cloneNode(true) as HTMLTableCellElement
  clone.querySelector('[data-slot="table-column-filter-host"]')?.remove()
  return clone.textContent?.trim() ?? ""
}

function cellFilterValue(cell: HTMLTableCellElement | null) {
  if (!cell) return undefined
  if (cell.dataset.filterValue !== undefined) return cell.dataset.filterValue

  const fallbackClone = cell.cloneNode(true) as HTMLTableCellElement
  fallbackClone
    .querySelectorAll(tableFilterIgnoredSelector)
    .forEach((element) => element.remove())
  const primaryClone = fallbackClone.cloneNode(true) as HTMLTableCellElement
  primaryClone
    .querySelectorAll(tableFilterSecondarySelector)
    .forEach((element) => element.remove())
  return resolveTableFilterText(
    tableFilterTextParts(primaryClone),
    tableFilterTextParts(fallbackClone)
  )
}

function tableFilterTextParts(node: Node): string[] {
  if (!node.childNodes.length) return [node.textContent ?? ""]
  return Array.from(node.childNodes).flatMap(tableFilterTextParts)
}

function syncSecondaryPlaceholderVisibility(cell: HTMLTableCellElement) {
  cell
    .querySelectorAll<HTMLElement>(tableSecondaryTextSelector)
    .forEach((element) => {
      element.hidden = isTableSecondaryPlaceholder(element.textContent)
    })
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
    const label = headerLabel(cell)
    const cells = rows.map((row) => row.cells.item(index))
    const filterValues = cells.map(cellFilterValue)
    const forceFilter = cell.dataset.filterable === "true"
    const isActionColumn =
      rows.length > 0 &&
      cells.every((rowCell) =>
        rowCell?.querySelector("a, button, form, input, select, textarea")
      )
    if (
      !shouldShowTableFilter({
        forceFilter,
        hasRows: rows.length > 0,
        isActionColumn,
        label,
        values: filterValues,
      })
    )
      return []

    return [
      {
        index,
        label,
        options: uniqueFilterOptions(filterValues),
      },
    ]
  })

  return { columns, rows }
}

function sameColumns(left: TableFilterColumn[], right: TableFilterColumn[]) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function Table({
  className,
  excelFilters = true,
  filterStorageKey,
  ...props
}: TableProps) {
  const tableRef = React.useRef<HTMLTableElement>(null)
  const previousColumnsRef = React.useRef<TableFilterColumn[]>([])
  const hydratedFilterSchemaRef = React.useRef<string | null>(null)
  const skipNextFilterPersistRef = React.useRef(false)
  const [columns, setColumns] = React.useState<TableFilterColumn[]>([])
  const [filterHosts, setFilterHosts] = React.useState<
    Record<number, HTMLElement>
  >({})
  const [filters, setFilters] = React.useState<TableColumnFilters>({})

  const refreshTable = React.useCallback(() => {
    const table = tableRef.current
    if (!table) return

    for (const body of Array.from(table.tBodies)) {
      for (const row of Array.from(body.rows)) {
        for (const cell of Array.from(row.cells)) {
          syncSecondaryPlaceholderVisibility(cell)
        }
      }
    }
    if (!excelFilters) return

    const snapshot = tableSnapshot(table)
    const headerCells = Array.from(table.tHead?.rows.item(0)?.cells ?? [])
    const nextFilterHosts = Object.fromEntries(
      snapshot.columns.flatMap((column) => {
        const headerCell = headerCells[column.index]
        if (!headerCell) return []
        let host = headerCell.querySelector<HTMLElement>(
          '[data-slot="table-column-filter-host"]'
        )
        if (!host) {
          host = document.createElement("div")
          host.dataset.slot = "table-column-filter-host"
          host.className = "pt-1 [&>button]:w-full"
          headerCell.append(host)
        }
        return [[column.index, host]]
      })
    )
    let applicableFilters = filtersForTableColumns(
      previousColumnsRef.current,
      snapshot.columns,
      filters
    )
    if (filterStorageKey && snapshot.columns.length) {
      const schemaKey = `${filterStorageKey}:${JSON.stringify(
        snapshot.columns.map(({ index, label }) => ({ index, label }))
      )}`
      if (hydratedFilterSchemaRef.current !== schemaKey) {
        try {
          applicableFilters = parsePersistedTableFilters(
            window.localStorage.getItem(filterStorageKey),
            snapshot.columns
          )
        } catch {
          applicableFilters = {}
        }
        skipNextFilterPersistRef.current = true
        hydratedFilterSchemaRef.current = schemaKey
      }
    }
    previousColumnsRef.current = snapshot.columns
    if (applicableFilters !== filters) setFilters(applicableFilters)
    setFilterHosts((current) => {
      const currentHosts = Object.values(current)
      const nextHosts = Object.values(nextFilterHosts)
      return currentHosts.length === nextHosts.length &&
        currentHosts.every((host, index) => host === nextHosts[index])
        ? current
        : nextFilterHosts
    })
    setColumns((current) =>
      sameColumns(current, snapshot.columns) ? current : snapshot.columns
    )

    for (const row of snapshot.rows) {
      row.hidden = snapshot.columns.some((column) => {
        const selected = applicableFilters[column.index] ?? null
        const value = cellFilterValue(row.cells.item(column.index))
        return !matchesColumnFilter(value, selected)
      })
    }
  }, [excelFilters, filterStorageKey, filters])

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

  React.useEffect(() => {
    if (!excelFilters || !filterStorageKey || !columns.length) return
    const schemaKey = `${filterStorageKey}:${JSON.stringify(
      columns.map(({ index, label }) => ({ index, label }))
    )}`
    if (hydratedFilterSchemaRef.current !== schemaKey) return
    if (skipNextFilterPersistRef.current) {
      skipNextFilterPersistRef.current = false
      return
    }
    try {
      window.localStorage.setItem(
        filterStorageKey,
        serializeTableFilters(columns, filters)
      )
    } catch {
      // Storage can be unavailable in private or policy-restricted browsers.
    }
  }, [columns, excelFilters, filterStorageKey, filters])

  return (
    <div className="w-full" data-slot="table-shell">
      {columns.map((column) => {
        const host = filterHosts[column.index]
        return host
          ? createPortal(
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
              />,
              host,
              String(column.index)
            )
          : null
      })}
      <div
        data-slot="table-container"
        className="relative w-full overflow-x-auto"
      >
        <table
          ref={tableRef}
          data-slot="table"
          className={cn(
            "w-full caption-bottom text-[13px] tabular-nums",
            className
          )}
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
      className={cn(
        "bg-muted/70 [&_tr]:border-b-2 [&_tr]:border-[var(--color-table-border-strong)]",
        className
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-[var(--color-table-border-strong)] bg-muted/50 font-medium [&>tr]:last:border-b-0",
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
        "h-11 border-b border-[var(--color-table-border)] transition-colors duration-[var(--dur-fast)] focus-within:bg-[var(--color-accent-tint)] focus-within:shadow-[inset_3px_0_0_var(--mrm-tennis)] hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-accent/10 data-[state=selected]:shadow-[inset_2px_0_0_var(--color-accent)]",
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
        "h-11 px-3 text-left align-middle text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase [&:has([role=checkbox])]:pr-0",
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
        "p-3 align-middle whitespace-nowrap tabular-nums [&:has([role=checkbox])]:pr-0",
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
