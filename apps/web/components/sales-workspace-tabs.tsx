import Link from "next/link"

import { DataDownloadButton } from "./data-download-button"

export const salesWorkspaceViews = [
  {
    exportHref: "/commercial/sales/history/export.xlsx",
    id: "tasks",
    label: "Tasks",
  },
  {
    exportHref: "/commercial/sales/history/followups/export.xlsx",
    id: "followup-history",
    label: "Follow-Up History",
  },
  {
    exportHref: "/commercial/sales/history/sent-quotes/export.xlsx",
    id: "sent-quotes",
    label: "Sent Quotes",
  },
] as const

export type SalesWorkspaceView = (typeof salesWorkspaceViews)[number]["id"]

export function SalesWorkspaceTabs({
  activeView,
}: {
  activeView: SalesWorkspaceView
}) {
  const linkClass = "border-b-2 px-4 py-3 text-sm font-medium transition-colors"
  const active = salesWorkspaceViews.find((view) => view.id === activeView)!

  return (
    <div className="flex flex-wrap items-end gap-3 border-b">
      <nav
        aria-label="Sales views"
        className="flex min-w-0 flex-1 overflow-x-auto"
        role="tablist"
      >
        {salesWorkspaceViews.map((view) => (
          <Link
            aria-selected={activeView === view.id}
            className={`${linkClass} ${activeView === view.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            href={{ pathname: "/commercial/sales", query: { view: view.id } }}
            key={view.id}
            role="tab"
          >
            {view.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto pb-2">
        <DataDownloadButton href={active.exportHref} />
      </div>
    </div>
  )
}
