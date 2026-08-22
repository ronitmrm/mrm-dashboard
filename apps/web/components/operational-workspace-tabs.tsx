"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { ReactNode } from "react"
import { useSearchParams } from "next/navigation"

import {
  operationalEntrySelectionFromContext,
  operationalEntrySelectionHref,
  operationalEntrySelectionSummary,
  withOperationalEntrySelectionContext,
  type OperationalEntryView,
} from "@/lib/operational-entry-module"
import { operationalEntryTransferAction } from "@/lib/operational-entry-transfer"

const linkClass = "border-b-2 px-4 py-3 text-sm font-medium transition-colors"

export function OperationalWorkspaceTabs({
  activeView,
  csvImportAction,
  dataEntryHref,
  exportAction,
  masterTablesHref,
}: {
  activeView: OperationalEntryView
  csvImportAction?: ReactNode
  dataEntryHref: string
  exportAction?: ReactNode
  masterTablesHref: string
}) {
  const searchParams = useSearchParams()
  const selection = operationalEntrySelectionFromContext(searchParams)
  const lockedDataEntryHref = withOperationalEntrySelectionContext(
    dataEntryHref,
    searchParams
  )
  const lockedMasterTablesHref = selection
    ? withOperationalEntrySelectionContext(masterTablesHref, searchParams)
    : "/operational-entry?view=masterTables"
  const transferAction = operationalEntryTransferAction(activeView, {
    csvImport: Boolean(csvImportAction),
    export: Boolean(exportAction),
  })

  return (
    <div className="flex flex-wrap items-center border-b">
      <Link
        className="inline-flex items-center gap-2 px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
        href={operationalEntrySelectionHref(selection, activeView)}
      >
        <ArrowLeft className="size-4" />
        Back to Operational Entry Selection
      </Link>
      {selection ? (
        <p className="mr-auto hidden truncate text-xs text-muted-foreground xl:block">
          {operationalEntrySelectionSummary(selection)}
        </p>
      ) : (
        <span className="mr-auto" />
      )}
      {transferAction === "csvImport" ? csvImportAction : null}
      {transferAction === "export" ? exportAction : null}
      <nav
        aria-label="Operational Entry views"
        className="ml-auto flex shrink-0"
        role="tablist"
      >
        <Link
          aria-selected={activeView === "dataEntry"}
          className={[
            linkClass,
            activeView === "dataEntry"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          ].join(" ")}
          href={lockedDataEntryHref}
          role="tab"
        >
          Data Entry
        </Link>
        <Link
          aria-selected={activeView === "masterTables"}
          className={[
            linkClass,
            activeView === "masterTables"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          ].join(" ")}
          href={lockedMasterTablesHref}
          role="tab"
        >
          Entry Tables
        </Link>
      </nav>
    </div>
  )
}
