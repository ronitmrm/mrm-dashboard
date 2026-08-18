import Link from "next/link"
import { ArrowLeft } from "lucide-react"

const linkClass = "border-b-2 px-4 py-3 text-sm font-medium transition-colors"

export function MasterDataViewTabs({
  activeView,
  allMastersHref,
  dataEntryHref,
  masterTablesHref,
}: {
  activeView: "dataEntry" | "masterTables"
  allMastersHref?: string
  dataEntryHref: string
  masterTablesHref: string
}) {
  return (
    <div className="flex items-center border-b">
      {allMastersHref ? (
        <Link
          className="mr-2 inline-flex items-center gap-2 px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          href={allMastersHref}
        >
          <ArrowLeft className="size-4" />
          All Masters
        </Link>
      ) : null}
      <nav aria-label="Master Data views" className="flex" role="tablist">
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
    </div>
  )
}
