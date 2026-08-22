"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useEffect } from "react"

import { MasterDataUnsavedGuard } from "./master-data-unsaved-guard"
import {
  masterSelectionFromContext,
  masterSelectionHref,
  masterSelectionSummary,
  withMasterSelectionContext,
} from "@/lib/master-module"

const linkClass = "border-b-2 px-4 py-3 text-sm font-medium transition-colors"

type MasterDataViewTabsProps = {
  activeView: "dataEntry" | "masterTables"
  allMastersHref?: string
  dataEntryHref: string
  masterTablesHref: string
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
  const masterTablesHref = withMasterSelectionContext(
    props.masterTablesHref,
    searchParams
  )

  return (
    <>
      <MasterDataUnsavedGuard enabled={props.activeView === "dataEntry"} />
      <div className="flex items-center border-b">
        <Link
          className="mr-2 inline-flex items-center gap-2 px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          href={masterSelectionHref(selection)}
        >
          <ArrowLeft className="size-4" />
          Back to Master Selection
        </Link>
        {selection ? (
          <p className="mr-auto hidden truncate text-xs text-muted-foreground xl:block">
            {masterSelectionSummary(selection)}
          </p>
        ) : (
          <span className="mr-auto" />
        )}
        <nav aria-label="Master Data views" className="flex" role="tablist">
          <Link
            aria-selected={props.activeView === "dataEntry"}
            className={`${linkClass} ${
              props.activeView === "dataEntry"
                ? "border-primary text-foreground"
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
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            href={masterTablesHref}
            role="tab"
          >
            Master Table
          </Link>
        </nav>
      </div>
    </>
  )
}
