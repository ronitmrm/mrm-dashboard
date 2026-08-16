"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Settings2 } from "lucide-react"

import {
  defaultProductionFloorCode,
  normalizeProductionFloorCode,
} from "@workspace/db/production-floors"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"

import { UnifiedSidebarNavigation } from "@/components/unified-sidebar-navigation"
import type { UnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  administrationNavigation,
  commercialNavigation,
  dashboardNavigation,
  hrNavigation,
  navigationHrefMatches,
  storeNavigation,
  type DashboardTabId,
} from "@/lib/unified-navigation"

const productionPageNavigation: Record<
  string,
  { label: string; parentTab: DashboardTabId }
> = {
  "/dashboard/production-sessions": {
    label: "Production Sessions",
    parentTab: "productionSessionsTab",
  },
  "/dashboard/first-piece-inspection": {
    label: "First Piece Inspection",
    parentTab: "firstPieceInspectionTab",
  },
  "/dashboard/hourly-quality-check": {
    label: "Hourly Quality Check",
    parentTab: "qualityControlTasksTab",
  },
  "/dashboard/setup-checklist": {
    label: "Setup Checklist",
    parentTab: "machinistTasksTab",
  },
}

export function CommercialShell({
  children,
  navigationAccess,
  user,
}: {
  children: ReactNode
  navigationAccess: UnifiedNavigationAccess
  user: { email: string; name: string }
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const productionPage = pathname.startsWith("/dashboard/job-cards/")
    ? { label: "Job Card", parentTab: "jobCardStatusTab" as const }
    : productionPageNavigation[pathname]
  const requestedReturnTab = searchParams.get("returnTab")
  const activeDashboardTab = dashboardNavigation.some(
    (item) => item.id === requestedReturnTab
  )
    ? (requestedReturnTab as DashboardTabId)
    : productionPage?.parentTab
  const activeProductionFloor = normalizeProductionFloorCode(
    searchParams.get("floor") ?? defaultProductionFloorCode
  )
  const current =
    productionPage ??
    [
      ...commercialNavigation,
      ...hrNavigation,
      ...administrationNavigation,
      ...storeNavigation,
    ].find((item) =>
      navigationHrefMatches(pathname, searchParams, item.href)
    ) ??
    commercialNavigation[0]!

  return (
    <SidebarProvider
      style={
        {
          "--header-height": "4rem",
          "--sidebar-width": "19rem",
        } as React.CSSProperties
      }
    >
      <Sidebar variant="sidebar">
        <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
          <Link className="flex items-center px-2 py-2" href="/">
            <Image
              src="/mrm-green.svg"
              alt="Mrmpl"
              width={792}
              height={176}
              priority
              className="h-8 w-auto max-w-full object-contain"
            />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <UnifiedSidebarNavigation
            activeDashboardTab={activeDashboardTab}
            activeProductionFloor={activeProductionFloor}
            navigationAccess={navigationAccess}
          />
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-3">
          <div className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/12 text-sm font-semibold text-sidebar-primary">
              {(user.name || user.email).trim().charAt(0).toUpperCase()}
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate text-sm font-semibold">
                {user.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </span>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-(--header-height) items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
          <SidebarTrigger />
          <Separator className="h-5" orientation="vertical" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">
              {current.label}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              Unified Mrmpl Workflow
            </p>
          </div>
          <Badge variant="outline">
            <Settings2 />
            Postgresql
          </Badge>
        </header>
        <main className="@container/main flex flex-1 flex-col gap-6 p-4 lg:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
