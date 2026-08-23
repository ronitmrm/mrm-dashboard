"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { ReactNode } from "react"
import { useSearchParams } from "next/navigation"

import {
  operationalEntrySelectionFromContext,
  operationalEntrySelectionHref,
  withOperationalEntrySelectionContext,
  type OperationalEntryView,
} from "@/lib/operational-entry-module"
import { operationalEntryTransferAction } from "@/lib/operational-entry-transfer"

const linkClass =
  "border-b-2 px-4 py-3 text-sm font-medium transition-colors duration-[var(--dur-base)]"

export function OperationalWorkspaceTabs({
  activeView,
  csvDownloadAction,
  csvImportAction,
  dataEntryHref,
  exportAction,
  masterTablesHref,
}: {
  activeView: OperationalEntryView
  csvDownloadAction?: ReactNode
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
    csvImport: Boolean(csvDownloadAction || csvImportAction),
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
      <nav
        aria-label="Operational Entry views"
        className="flex shrink-0"
        role="tablist"
      >
        <Link
          aria-selected={activeView === "dataEntry"}
          className={[
            linkClass,
            activeView === "dataEntry"
              ? "border-[var(--color-accent)] text-foreground"
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
              ? "border-[var(--color-accent)] text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          ].join(" ")}
          href={lockedMasterTablesHref}
          role="tab"
        >
          Entry Tables
        </Link>
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {transferAction === "csvImport" ? csvDownloadAction : null}
        {transferAction === "csvImport" ? csvImportAction : null}
        {transferAction === "export" ? exportAction : null}
      </div>
    </div>
  )
}
