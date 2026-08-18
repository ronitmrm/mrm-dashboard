import Link from "next/link"

const linkClass =
  "border-b-2 px-4 py-3 text-sm font-medium transition-colors"

export function MasterDataViewTabs({
  activeView,
  dataEntryHref,
  masterTablesHref,
}: {
  activeView: "dataEntry" | "masterTables"
  dataEntryHref: string
  masterTablesHref: string
}) {
  return (
    <nav aria-label="Master Data views" className="flex border-b" role="tablist">
      <Link
        aria-selected={activeView === "dataEntry"}
        className={`${linkClass} ${
          activeView === "dataEntry"
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground"
        }`}
        href={dataEntryHref}
        role="tab"
      >
        Data Entry
      </Link>
      <Link
        aria-selected={activeView === "masterTables"}
        className={`${linkClass} ${
          activeView === "masterTables"
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground"
        }`}
        href={masterTablesHref}
        role="tab"
      >
        Master Tables
      </Link>
    </nav>
  )
}
