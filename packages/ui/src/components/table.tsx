"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { FilterX } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  ExcelColumnFilter,
  uniqueFilterOptions,
} from "@workspace/ui/components/excel-column-filter"
import { cn } from "@workspace/ui/lib/utils"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  filterOptionsForTableColumn,
  filterRowsByTableColumns,
  filtersForTableColumns,
  parsePersistedTableFilters,
  serializeTableFilters,
  tableFilterStorageKey,
  sortRowsByTableColumn,
  type TableColumnFilters,
  type TableFilterColumn,
  type TableSort,
} from "@workspace/ui/lib/table-filter-state"
import {
  isTableSecondaryPlaceholder,
  parseTableFilterValues,
  resolveTableFilterText,
  shouldShowTableFilter,
  tableFilterIgnoredSelector,
  tableFilterSecondarySelector,
  tableSecondaryTextSelector,
} from "@workspace/ui/lib/table-filter-display"
import {
  filteredTableSelectionState,
  selectAllFilteredTableRows,
  type FilteredTableSelectionRow,
} from "@workspace/ui/lib/table-filtered-selection"

type OperationalTableProps = React.ComponentProps<"table"> & {
  containerClassName?: string
  excelFilters?: boolean
  filteredSelection?: {
    checkboxName: string
    label?: string
  }
  filterMode?: "dom" | "external"
  filterStorageKey?: string
  onFilteredRowCountChange?: (visible: number, total: number) => void
  state?: "ready" | "empty" | "loading" | "error"
  stateAction?: React.ReactNode
  stateDescription?: React.ReactNode
  stateTitle?: React.ReactNode
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

function cellFilterValues(cell: HTMLTableCellElement | null) {
  return parseTableFilterValues(
    cell?.dataset.filterValues,
    cellFilterValue(cell)
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
    const filterValues = cells.flatMap(cellFilterValues)
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
        allLabel: cell.dataset.filterAllLabel,
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

function OperationalTable({
  className,
  containerClassName,
  excelFilters = true,
  filteredSelection,
  filterMode = "dom",
  filterStorageKey,
  onFilteredRowCountChange,
  state = "ready",
  stateAction,
  stateDescription,
  stateTitle,
  ...props
}: OperationalTableProps) {
  const tableRef = React.useRef<HTMLTableElement>(null)
  const automaticFilterStorageId = React.useId()
  const previousColumnsRef = React.useRef<TableFilterColumn[]>([])
  const hydratedFilterSchemaRef = React.useRef<string | null>(null)
  const skipNextFilterPersistRef = React.useRef(false)
  const rowOrderRef = React.useRef(new WeakMap<HTMLTableRowElement, number>())
  const nextRowOrderRef = React.useRef(0)
  const filteredSelectionRowsRef = React.useRef<
    FilteredTableSelectionRow<HTMLInputElement>[]
  >([])
  const [columns, setColumns] = React.useState<TableFilterColumn[]>([])
  const [filterHosts, setFilterHosts] = React.useState<
    Record<number, HTMLElement>
  >({})
  const [filters, setFilters] = React.useState<TableColumnFilters>({})
  const [sort, setSort] = React.useState<TableSort | null>(null)
  const [selectionState, setSelectionState] = React.useState({
    selectableCount: 0,
    selectedCount: 0,
  })
  const filteredSelectionCheckboxName = filteredSelection?.checkboxName

  const syncFilteredSelectionState = React.useCallback(() => {
    const nextState = filteredTableSelectionState(
      filteredSelectionRowsRef.current
    )
    setSelectionState((current) =>
      current.selectableCount === nextState.selectableCount &&
      current.selectedCount === nextState.selectedCount
        ? current
        : nextState
    )
  }, [])

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
    if (!excelFilters || filterMode === "external") return

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
    const schemaChanged = applicableFilters !== filters
    let applicableSort = schemaChanged ? null : sort

    const persistenceKey = tableFilterStorageKey(
      filterStorageKey,
      window.location.pathname,
      automaticFilterStorageId
    )
    if (snapshot.columns.length) {
      const schemaKey = `${persistenceKey}:${JSON.stringify(
        snapshot.columns.map(({ index, label }) => ({ index, label }))
      )}`
      if (hydratedFilterSchemaRef.current !== schemaKey) {
        try {
          applicableFilters = parsePersistedTableFilters(
            window.localStorage.getItem(persistenceKey),
            snapshot.columns
          )
        } catch {
          applicableFilters = {}
        }
        skipNextFilterPersistRef.current = true
        hydratedFilterSchemaRef.current = schemaKey
      }
    }
    if (
      applicableSort &&
      !snapshot.columns.some(
        (column) => column.index === applicableSort?.columnIndex
      )
    ) {
      applicableSort = null
    }
    previousColumnsRef.current = snapshot.columns
    if (applicableFilters !== filters) setFilters(applicableFilters)
    if (applicableSort !== sort) setSort(applicableSort)
    setFilterHosts((current) => {
      const currentHosts = Object.values(current)
      const nextHosts = Object.values(nextFilterHosts)
      return currentHosts.length === nextHosts.length &&
        currentHosts.every((host, index) => host === nextHosts[index])
        ? current
        : nextFilterHosts
    })

    const valuesForColumn = (row: HTMLTableRowElement, columnIndex: number) =>
      cellFilterValues(row.cells.item(columnIndex))
    const facetedColumns = snapshot.columns.map((column) => ({
      ...column,
      options: filterOptionsForTableColumn(
        snapshot.rows,
        snapshot.columns,
        applicableFilters,
        column.index,
        valuesForColumn
      ),
    }))
    setColumns((current) =>
      sameColumns(current, facetedColumns) ? current : facetedColumns
    )

    const matchingRows = new Set(
      filterRowsByTableColumns(
        snapshot.rows,
        snapshot.columns,
        applicableFilters,
        valuesForColumn
      )
    )
    for (const row of snapshot.rows) {
      row.hidden = !matchingRows.has(row)
      if (!rowOrderRef.current.has(row)) {
        rowOrderRef.current.set(row, nextRowOrderRef.current)
        nextRowOrderRef.current += 1
      }
    }
    filteredSelectionRowsRef.current = filteredSelectionCheckboxName
      ? snapshot.rows.map((row) => ({
          checkbox: Array.from(
            row.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
          ).find((input) => input.name === filteredSelectionCheckboxName),
          hidden: row.hidden,
        }))
      : []
    syncFilteredSelectionState()

    const rowsInOriginalOrder = [...snapshot.rows].sort(
      (left, right) =>
        (rowOrderRef.current.get(left) ?? 0) -
        (rowOrderRef.current.get(right) ?? 0)
    )
    const sortedRows = sortRowsByTableColumn(
      rowsInOriginalOrder,
      applicableSort,
      valuesForColumn
    )
    const rowSet = new Set(snapshot.rows)
    for (const body of Array.from(table.tBodies)) {
      const currentRows = Array.from(body.rows).filter((row) => rowSet.has(row))
      const nextRows = sortedRows.filter((row) => row.parentElement === body)
      if (
        currentRows.length === nextRows.length &&
        currentRows.some((row, index) => row !== nextRows[index])
      ) {
        body.append(...nextRows)
      }
    }
    onFilteredRowCountChange?.(matchingRows.size, snapshot.rows.length)
  }, [
    excelFilters,
    filterMode,
    automaticFilterStorageId,
    filterStorageKey,
    filters,
    filteredSelectionCheckboxName,
    onFilteredRowCountChange,
    sort,
    syncFilteredSelectionState,
  ])

  React.useLayoutEffect(() => {
    refreshTable()
  }, [props.children, refreshTable])

  React.useEffect(() => {
    const table = tableRef.current
    if (!table || !excelFilters || filterMode === "external") return

    const observer = new MutationObserver(refreshTable)
    observer.observe(table, {
      characterData: true,
      childList: true,
      subtree: true,
    })
    return () => observer.disconnect()
  }, [excelFilters, filterMode, refreshTable])

  React.useEffect(() => {
    if (excelFilters && filterMode !== "external") return
    const table = tableRef.current
    if (!table) return
    for (const body of Array.from(table.tBodies)) {
      for (const row of Array.from(body.rows)) row.hidden = false
    }
  }, [excelFilters, filterMode])

  React.useEffect(() => {
    const table = tableRef.current
    if (!table || !filteredSelectionCheckboxName) return
    table.addEventListener("change", syncFilteredSelectionState)
    return () => table.removeEventListener("change", syncFilteredSelectionState)
  }, [filteredSelectionCheckboxName, syncFilteredSelectionState])

  React.useEffect(() => {
    if (!excelFilters || filterMode === "external" || !columns.length) return
    const persistenceKey = tableFilterStorageKey(
      filterStorageKey,
      window.location.pathname,
      automaticFilterStorageId
    )
    const schemaKey = `${persistenceKey}:${JSON.stringify(
      columns.map(({ index, label }) => ({ index, label }))
    )}`
    if (hydratedFilterSchemaRef.current !== schemaKey) return
    if (skipNextFilterPersistRef.current) {
      skipNextFilterPersistRef.current = false
      return
    }
    try {
      window.localStorage.setItem(
        persistenceKey,
        serializeTableFilters(columns, filters)
      )
    } catch {
      // Storage can be unavailable in private or policy-restricted browsers.
    }
  }, [
    automaticFilterStorageId,
    columns,
    excelFilters,
    filterMode,
    filterStorageKey,
    filters,
  ])

  if (state !== "ready") {
    const defaultCopy = {
      empty: {
        description: "Records will appear here when they are available.",
        title: "No records",
      },
      error: {
        description: "The table could not be loaded.",
        title: "Table unavailable",
      },
      loading: {
        description: "Fetching the latest operational records.",
        title: "Loading records",
      },
    }[state]

    return (
      <div
        className="w-full"
        data-filter-storage-key={filterStorageKey ?? "automatic"}
        data-slot="operational-table"
        data-state={state}
      >
        <StandardState
          action={stateAction}
          description={stateDescription ?? defaultCopy.description}
          title={stateTitle ?? defaultCopy.title}
          variant={state}
        />
      </div>
    )
  }

  return (
    <div
      className="w-full"
      data-filter-storage-key={filterStorageKey ?? "automatic"}
      data-slot="operational-table"
    >
      {columns.map((column) => {
        const host = filterHosts[column.index]
        return host
          ? createPortal(
              <ExcelColumnFilter
                allLabel={column.allLabel}
                label={column.label}
                onApply={(selected) =>
                  setFilters((current) => ({
                    ...current,
                    [column.index]: selected,
                  }))
                }
                onSort={(direction) =>
                  setSort({ columnIndex: column.index, direction })
                }
                options={column.options}
                selected={filters[column.index] ?? null}
                sortDirection={
                  sort?.columnIndex === column.index
                    ? sort.direction
                    : undefined
                }
              />,
              host,
              String(column.index)
            )
          : null
      })}
      {columns.length ? (
        <div className="flex justify-end gap-2 pb-2">
          {filteredSelection ? (
            <Button
              aria-label={filteredSelection.label ?? "Select all filtered rows"}
              disabled={
                selectionState.selectableCount === 0 ||
                selectionState.selectedCount === selectionState.selectableCount
              }
              onClick={() => {
                const changed = selectAllFilteredTableRows(
                  filteredSelectionRowsRef.current
                )
                for (const checkbox of changed) {
                  checkbox.dispatchEvent(new Event("change", { bubbles: true }))
                }
                syncFilteredSelectionState()
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {filteredSelection.label ?? "Select All Filtered"} (
              {selectionState.selectableCount})
            </Button>
          ) : null}
          <Button
            aria-label="Clear all table filters"
            disabled={!Object.values(filters).some(Array.isArray)}
            onClick={() => setFilters({})}
            size="sm"
            type="button"
            variant="outline"
          >
            <FilterX data-icon="inline-start" />
            Clear All Filters
          </Button>
        </div>
      ) : null}
      <div
        data-slot="table-container"
        className={cn(
          "relative max-h-[calc(100svh-var(--header-height)-8rem)] w-full overflow-auto",
          containerClassName
        )}
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
        "sticky top-0 z-10 bg-muted [&_tr]:border-b-2 [&_tr]:border-[var(--color-table-border-strong)]",
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
        "h-11 border-b border-[var(--color-table-border)] transition-colors duration-[var(--dur-fast)] focus-within:bg-[var(--color-accent-tint)] focus-within:shadow-[inset_3px_0_0_var(--mrm-tennis)] hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-[var(--color-selected-bg)] data-[state=selected]:shadow-[inset_2px_0_0_var(--color-selected)]",
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
  OperationalTable,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  type OperationalTableProps,
}
