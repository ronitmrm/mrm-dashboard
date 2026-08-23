"use client"

import Link from "next/link"
import { ArrowLeft, Download } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { type ReactNode, useEffect } from "react"

import { Button } from "@workspace/ui/components/button"

import { masterDataTransferAction } from "@/lib/master-data-transfer"
import { MasterDataUnsavedGuard } from "./master-data-unsaved-guard"
import {
  masterSelectionFromContext,
  masterSelectionHref,
  withMasterSelectionContext,
} from "@/lib/master-module"

const linkClass =
  "border-b-2 px-4 py-3 text-sm font-medium transition-colors duration-[var(--dur-base)]"

type MasterDataViewTabsProps = {
  activeView: "dataEntry" | "masterTables"
  allMastersHref?: string
  csvImportAction?: ReactNode
  dataEntryHref: string
  exportAction?: ReactNode
  exportDisabled?: boolean
  masterTablesHref: string
  onExport?: () => void
}

function useMasterSelectionContextBridge(searchParams: URLSearchParams) {
  useEffect(() => {
    const values = ["masterUnit", "masterMain", "masterSub"]
      .map((key) => [key, searchParams.get(key)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
    if (!values.length) return

    const preserveLink = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const link = event.target.closest<HTMLAnchorElement>("a[href]")
      if (!link || link.target === "_blank" || link.hasAttribute("download"))
        return
      const destination = new URL(link.href, window.location.href)
      if (
        destination.origin !== window.location.origin ||
        destination.pathname === "/masters"
      )
        return
      for (const [key, value] of values)
        destination.searchParams.set(key, value)
      link.href = destination.toString()
    }

    document.addEventListener("click", preserveLink, true)
    return () => document.removeEventListener("click", preserveLink, true)
  }, [searchParams])
}
export function MasterDataViewTabs(props: MasterDataViewTabsProps) {
  const searchParams = useSearchParams()
  useMasterSelectionContextBridge(searchParams)
  const selection = masterSelectionFromContext(searchParams)
  const dataEntryHref = withMasterSelectionContext(
    props.dataEntryHref,
    searchParams
  )
  const masterTablesHref = selection
    ? withMasterSelectionContext(props.masterTablesHref, searchParams)
    : "/masters?view=masterTables"
  const transferAction = masterDataTransferAction(props.activeView, {
    csvImport: Boolean(props.csvImportAction),
    export: Boolean(props.exportAction || props.onExport),
  })

  return (
    <>
      <MasterDataUnsavedGuard enabled={props.activeView === "dataEntry"} />
      <div className="flex flex-wrap items-center border-b">
        <Link
          className="inline-flex items-center gap-2 px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          href={masterSelectionHref(selection, props.activeView)}
        >
          <ArrowLeft className="size-4" />
          Back to Master Selection
        </Link>
        <nav
          aria-label="Master Data views"
          className="flex shrink-0"
          role="tablist"
        >
          <Link
            aria-selected={props.activeView === "dataEntry"}
            className={`${linkClass} ${
              props.activeView === "dataEntry"
                ? "border-[var(--color-accent)] text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            href={dataEntryHref}
            role="tab"
          >
            Data Entry
          </Link>
          <Link
            aria-selected={props.activeView === "masterTables"}
            className={`${linkClass} ${
              props.activeView === "masterTables"
                ? "border-[var(--color-accent)] text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            href={masterTablesHref}
            role="tab"
          >
            Master Table
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {transferAction === "csvImport" ? props.csvImportAction : null}
          {transferAction === "export" && props.exportAction
            ? props.exportAction
            : null}
          {transferAction === "export" &&
          !props.exportAction &&
          props.onExport ? (
            <Button
              disabled={props.exportDisabled}
              onClick={props.onExport}
              size="sm"
              type="button"
              variant="outline"
            >
              <Download className="size-4" />
              Export
            </Button>
          ) : null}
        </div>
      </div>
    </>
  )
}
