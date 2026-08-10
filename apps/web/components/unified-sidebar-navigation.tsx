"use client"

import { useSyncExternalStore } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import {
  BriefcaseBusiness,
  Calculator,
  ChevronRight,
  Factory,
} from "lucide-react"
import {
  defaultProductionFloorCode,
  normalizeProductionFloorCode,
  productionFloors,
  type ProductionFloorCode,
} from "@workspace/db/production-floors"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@workspace/ui/components/sidebar"

import type { UnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  administrationNavigation,
  commercialNavigation,
  dashboardNavigation,
  dashboardTabHref,
  hrNavigation,
  navigationHrefMatches,
  type DashboardTabId,
} from "@/lib/unified-navigation"

const storageKey = "mrmpl:sidebar:expanded-modules"
const stateChangedEvent = "mrmpl:sidebar:expanded-modules-changed"

type SectionId =
  | "costing"
  | "hr"
  | "productionConventional"
  | "productionCnc"
  | "productionForging"
type ExpandedSections = Record<SectionId, boolean>

const productionSectionIds: Record<ProductionFloorCode, SectionId> = {
  conventional: "productionConventional",
  cnc: "productionCnc",
  forging: "productionForging",
}

function defaultExpandedSections(
  pathname: string,
  activeProductionFloor: ProductionFloorCode
): ExpandedSections {
  const onProduction = pathname === "/" || pathname.startsWith("/dashboard")
  return {
    costing: pathname.startsWith("/commercial"),
    hr: pathname.startsWith("/hr"),
    productionConventional:
      onProduction && activeProductionFloor === "conventional",
    productionCnc: onProduction && activeProductionFloor === "cnc",
    productionForging: onProduction && activeProductionFloor === "forging",
  }
}

function storedExpandedSections(
  value: string | null,
  fallback: ExpandedSections
): ExpandedSections {
  if (!value) return fallback

  try {
    const parsed = JSON.parse(value) as Partial<ExpandedSections> & {
      production?: boolean
    }
    return {
      costing:
        typeof parsed.costing === "boolean" ? parsed.costing : fallback.costing,
      hr: typeof parsed.hr === "boolean" ? parsed.hr : fallback.hr,
      productionConventional:
        typeof parsed.productionConventional === "boolean"
          ? parsed.productionConventional
          : typeof parsed.production === "boolean"
            ? parsed.production
            : fallback.productionConventional,
      productionCnc:
        typeof parsed.productionCnc === "boolean"
          ? parsed.productionCnc
          : fallback.productionCnc,
      productionForging:
        typeof parsed.productionForging === "boolean"
          ? parsed.productionForging
          : fallback.productionForging,
    }
  } catch {
    return fallback
  }
}

function subscribeToExpandedSections(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(stateChangedEvent, onStoreChange)

  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(stateChangedEvent, onStoreChange)
  }
}

function expandedSectionsSnapshot() {
  return window.localStorage.getItem(storageKey) ?? ""
}

function serverExpandedSectionsSnapshot() {
  return ""
}

export function UnifiedSidebarNavigation({
  activeDashboardTab,
  activeProductionFloor = defaultProductionFloorCode,
  navigationAccess,
  onDashboardTabSelect,
}: {
  activeDashboardTab?: DashboardTabId
  activeProductionFloor?: ProductionFloorCode
  navigationAccess: UnifiedNavigationAccess
  onDashboardTabSelect?: (
    tab: DashboardTabId,
    productionFloor: ProductionFloorCode
  ) => void
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const storedSections = useSyncExternalStore(
    subscribeToExpandedSections,
    expandedSectionsSnapshot,
    serverExpandedSectionsSnapshot
  )
  const expandedSections = storedExpandedSections(
    storedSections,
    defaultExpandedSections(
      pathname,
      normalizeProductionFloorCode(
        searchParams.get("floor") ?? activeProductionFloor
      )
    )
  )
  const visibleCommercialNavigation = commercialNavigation.filter((item) =>
    navigationAccess.commercialHrefs.includes(item.href)
  )
  const visibleHrNavigation = hrNavigation.filter((item) =>
    navigationAccess.hrHrefs.includes(item.href)
  )

  function setSectionOpen(section: SectionId, open: boolean) {
    const next = { ...expandedSections, [section]: open }
    window.localStorage.setItem(storageKey, JSON.stringify(next))
    window.dispatchEvent(new Event(stateChangedEvent))
  }

  return (
    <>
      {visibleHrNavigation.length ? (
        <NavigationSection
          icon={BriefcaseBusiness}
          label="Hr Recruitment"
          onOpenChange={(open) => setSectionOpen("hr", open)}
          open={expandedSections.hr}
          submoduleCount={visibleHrNavigation.length}
        >
          {visibleHrNavigation.map((item) => (
            <SidebarMenuSubItem key={item.href}>
              <SidebarMenuSubButton
                asChild
                className="h-8 rounded-lg px-2.5 text-sidebar-foreground/75 hover:bg-sidebar-primary/15 hover:text-sidebar-primary data-[active=true]:bg-sidebar-primary/20 data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary"
                isActive={navigationHrefMatches(
                  pathname,
                  searchParams,
                  item.href
                )}
              >
                <a href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </a>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </NavigationSection>
      ) : null}

      {visibleCommercialNavigation.length ? (
        <NavigationSection
          icon={Calculator}
          label="Costing"
          onOpenChange={(open) => setSectionOpen("costing", open)}
          open={expandedSections.costing}
          submoduleCount={visibleCommercialNavigation.length}
        >
          {visibleCommercialNavigation.map((item) => (
            <SidebarMenuSubItem key={item.href}>
              <SidebarMenuSubButton
                asChild
                className="h-8 rounded-lg px-2.5 text-sidebar-foreground/75 hover:bg-sidebar-primary/15 hover:text-sidebar-primary data-[active=true]:bg-sidebar-primary/20 data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary"
                isActive={navigationHrefMatches(
                  pathname,
                  searchParams,
                  item.href
                )}
              >
                <a href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </a>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </NavigationSection>
      ) : null}

      {navigationAccess.operations ? (
        productionFloors.map((floor) => {
          const sectionId = productionSectionIds[floor.code]
          return (
            <NavigationSection
              icon={Factory}
              key={floor.code}
              label={floor.label}
              onOpenChange={(open) => setSectionOpen(sectionId, open)}
              open={expandedSections[sectionId]}
              submoduleCount={dashboardNavigation.length}
            >
              {dashboardNavigation.map((item) => (
                <SidebarMenuSubItem key={`${floor.code}:${item.id}`}>
                  <SidebarMenuSubButton
                    asChild
                    className="h-8 rounded-lg px-2.5 text-sidebar-foreground/75 hover:bg-sidebar-primary/15 hover:text-sidebar-primary data-[active=true]:bg-sidebar-primary/20 data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary"
                    isActive={
                      floor.code === activeProductionFloor &&
                      item.id === activeDashboardTab
                    }
                  >
                    {onDashboardTabSelect ? (
                      <button
                        onClick={() =>
                          onDashboardTabSelect(item.id, floor.code)
                        }
                        type="button"
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </button>
                    ) : (
                      <a href={dashboardTabHref(item.id, floor.code)}>
                        <item.icon />
                        <span>{item.title}</span>
                      </a>
                    )}
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </NavigationSection>
          )
        })
      ) : null}

      {navigationAccess.administration ? (
        <SidebarGroup className="py-1">
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {administrationNavigation.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={navigationHrefMatches(
                      pathname,
                      searchParams,
                      item.href
                    )}
                  >
                    <a href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
    </>
  )
}

function NavigationSection({
  children,
  icon: Icon,
  label,
  onOpenChange,
  open,
  submoduleCount,
}: {
  children: React.ReactNode
  icon: typeof Factory
  label: string
  onOpenChange: (open: boolean) => void
  open: boolean
  submoduleCount: number
}) {
  return (
    <Collapsible
      className="group/collapsible px-2 py-1"
      onOpenChange={onOpenChange}
      open={open}
    >
      <SidebarGroup className="p-0">
        <SidebarMenu>
          <SidebarMenuItem className="overflow-hidden rounded-xl border border-sidebar-border/70 bg-sidebar/70 transition-colors group-data-[state=open]/collapsible:bg-sidebar-accent/25">
            <CollapsibleTrigger asChild>
              <SidebarMenuButton
                className="h-11 rounded-xl px-2.5 font-semibold hover:bg-sidebar-primary/15 hover:text-sidebar-primary"
                type="button"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/10 text-sidebar-primary ring-1 ring-sidebar-primary/15">
                  <Icon className="size-4" />
                </span>
                <span className="truncate text-[13px]">{label}</span>
                <span
                  aria-hidden="true"
                  className="ml-auto min-w-6 rounded-md border border-sidebar-border/70 bg-background/70 px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums text-muted-foreground"
                >
                  {submoduleCount}
                </span>
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90">
                  <ChevronRight className="size-3.5" />
                </span>
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub
                aria-label={`${label} submodules`}
                className="mx-3 mb-2 mt-0 gap-0.5 border-sidebar-border/80 px-2 py-1"
              >
                {children}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </Collapsible>
  )
}
