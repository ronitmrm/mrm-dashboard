import Link from "next/link"

import type { OperationalEntryView } from "@/lib/operational-entry-navigation"

export function OperationalWorkspaceTabs({
  activeView,
  dataEntryHref,
  masterTablesHref,
}: {
  activeView: OperationalEntryView
  dataEntryHref: string
  masterTablesHref: string
}) {
  const linkClass =
    "border-b-2 px-4 py-3 text-sm font-medium transition-colors"

  return (
    <nav
      aria-label="Operational Entry views"
      className="flex border-b"
      role="tablist"
    >
      <Link
        aria-selected={activeView === "dataEntry"}
        className={`${linkClass} ${activeView === "dataEntry" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        href={dataEntryHref}
        role="tab"
      >
        Data Entry
      </Link>
      <Link
        aria-selected={activeView === "masterTables"}
        className={`${linkClass} ${activeView === "masterTables" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        href={masterTablesHref}
        role="tab"
      >
        Master Tables
      </Link>
    </nav>
  )
}
