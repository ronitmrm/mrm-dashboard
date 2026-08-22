"use client"

import { Button } from "@workspace/ui/components/button"
import type { ReactNode } from "react"
import { createContext, useContext, useState } from "react"

type AssetWorkspaceTabKey =
  | "overview"
  | "movement"
  | "maintenance"
  | "repairs"
  | "suppliers"
  | "documents"
  | "lifecycle"

const assetWorkspaceTabContext = createContext<AssetWorkspaceTabKey>("overview")

export function StoreAssetWorkspaceTabs({
  children,
  showLifecycle = false,
}: {
  children?: ReactNode
  showLifecycle?: boolean
}) {
  const [activeTab, setActiveTab] = useState<AssetWorkspaceTabKey>("overview")
  const tabs: Array<{ key: AssetWorkspaceTabKey; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "movement", label: "Movement" },
    { key: "maintenance", label: "Maintenance" },
    { key: "repairs", label: "Repairs" },
    { key: "suppliers", label: "Suppliers" },
    { key: "documents", label: "Documents" },
    ...(showLifecycle
      ? [{ key: "lifecycle" as const, label: "Lifecycle" }]
      : []),
  ]

  return (
    <div className="grid gap-4">
      <nav
        aria-label="Asset Workspace sections"
        className="flex gap-0 overflow-x-auto border-b"
      >
        {tabs.map((tab) => (
          <Button
            aria-pressed={activeTab === tab.key}
            className="shrink-0 rounded-none border-b-2 border-transparent bg-transparent shadow-none aria-pressed:border-[var(--color-accent)] aria-pressed:text-foreground"
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {tab.label}
          </Button>
        ))}
      </nav>
      <assetWorkspaceTabContext.Provider value={activeTab}>
        {children}
      </assetWorkspaceTabContext.Provider>
    </div>
  )
}

export function StoreAssetWorkspacePane({
  children,
  className = "grid gap-4",
  tab,
}: {
  children?: ReactNode
  className?: string
  tab: AssetWorkspaceTabKey
}) {
  const activeTab = useContext(assetWorkspaceTabContext)

  if (activeTab !== tab) return null

  return (
    <section aria-label={`${tab} section`} className={className}>
      {children}
    </section>
  )
}
