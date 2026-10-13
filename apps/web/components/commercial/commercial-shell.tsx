"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Settings2 } from "lucide-react"

import {
  defaultProductionFloorCode,
  normalizeProductionFloorCode,
  productionFloors,
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
import { UserAccountFooter } from "@/components/user-account-footer"
import {
  PageActionsTarget,
  useShellPageActions,
} from "@/components/ui/page-actions"
import type { UnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  administrationNavigation,
  brandingNavigation,
  qualityControlNavigation,
  publishedRegisterNavigation,
  commercialMasterNavigation,
  commercialNavigation,
  dashboardNavigation,
  hrMasterNavigation,
  hrNavigation,
  navigationHrefMatches,
  personalDashboardNavigation,
  storeNavigation,
  isoDocumentNavigation,
  maintenanceNavigation,
  type DashboardTabId,
} from "@/lib/unified-navigation"

const productionPageNavigation: Record<
  string,
  { label: string; parentTab: DashboardTabId }
> = {
  "/order-acceptance": {
    label: "Order Acceptance Planning",
    parentTab: "productionControlTab",
  },
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
  const { actionsTarget, setActionsTarget, headerHeight, headerRef } =
    useShellPageActions()
  const productionPage = pathname.startsWith("/dashboard/job-cards/")
    ? { label: "Job Card", parentTab: "jobCardStatusTab" as const }
    : Object.entries(productionPageNavigation).find(
        ([path]) => pathname === path || pathname.startsWith(`${path}/`)
      )?.[1]
  const requestedReturnTab = searchParams.get("returnTab")
  const activeDashboardTab = dashboardNavigation.some(
    (item) => item.id === requestedReturnTab
  )
    ? (requestedReturnTab as DashboardTabId)
    : productionPage?.parentTab
  const activeProductionFloor = normalizeProductionFloorCode(
    searchParams.get("floor") ?? defaultProductionFloorCode
  )
  const storeFloor = productionFloors.find((floor) => {
    const storePath = `/production-store/${floor.code}`
    return pathname === storePath || pathname.startsWith(`${storePath}/`)
  })
  const current =
    (pathname === "/commercial/price-master"
      ? { label: "Price Master" }
      : pathname === "/account/password"
        ? { label: "Password & Security" }
        : pathname === "/masters" || pathname === "/operational-entry"
          ? {
              label:
                searchParams.get("view") === "masterTables"
                  ? "View Records"
                  : "Data Entry",
            }
          : storeFloor
            ? {
                label: `${storeFloor.label} · ${pathname.endsWith("/movement") ? "Store Movement" : pathname.endsWith("/repairs") ? "Store Repairs" : "Store Stock"}`,
              }
            : productionPage) ??
    [
      personalDashboardNavigation,
      ...commercialNavigation,
      commercialMasterNavigation,
      ...hrMasterNavigation,
      ...hrNavigation,
      ...administrationNavigation,
      ...brandingNavigation,
      ...qualityControlNavigation,
      ...publishedRegisterNavigation,
      ...storeNavigation,
      ...isoDocumentNavigation,
      ...maintenanceNavigation,
    ]
      .sort((left, right) => right.href.length - left.href.length)
      .find((item) =>
        navigationHrefMatches(pathname, searchParams, item.href)
      ) ??
    personalDashboardNavigation

  return (
    <SidebarProvider
      style={
        {
          "--header-height": `${headerHeight}px`,
          "--sidebar-width": "19rem",
        } as React.CSSProperties
      }
    >
      <Sidebar variant="sidebar">
        <SidebarHeader className="border-b border-black/10 bg-[var(--color-logo-surface)] px-3 py-3">
          <Link className="flex items-center px-2 py-2" href="/home">
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
          <UserAccountFooter user={user} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header
          ref={headerRef}
          className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur lg:px-6"
        >
          <SidebarTrigger />
          <Separator className="h-5" orientation="vertical" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">
              {current.label}
            </h1>
          </div>
          <div
            className="flex max-w-full min-w-0 flex-wrap items-center gap-2 empty:hidden max-sm:order-last max-sm:basis-full"
            data-slot="shell-page-actions"
            ref={setActionsTarget}
          />
          <Badge variant="outline">
            <Settings2 />
            Postgresql
          </Badge>
        </header>
        <PageActionsTarget value={actionsTarget}>
          <main className="@container/main flex min-w-0 flex-1 flex-col gap-6 p-4 lg:p-6">
            {children}
          </main>
        </PageActionsTarget>
      </SidebarInset>
    </SidebarProvider>
  )
}
