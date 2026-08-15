"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import {
  BriefcaseBusiness,
  Calculator,
  ChevronRight,
  Factory,
  Search,
  X,
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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@workspace/ui/components/sidebar"
import { Input } from "@workspace/ui/components/input"

import type { UnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  administrationNavigation,
  commercialNavigation,
  consolidatedProductionNavigation,
  dashboardTabHref,
  hrNavigation,
  navigationHrefMatches,
  planningHolidayNavigation,
  productionFloorNavigation,
  universalProductionNavigation,
  type DashboardTabId,
} from "@/lib/unified-navigation"

const storageKey = "mrmpl:sidebar:expanded-modules"
const stateChangedEvent = "mrmpl:sidebar:expanded-modules-changed"

type SectionId =
  | "costing"
  | "hr"
  | "productionConventional"
  | "productionConventional02"
  | "productionCnc"
  | "productionForging"
type ExpandedSections = Record<SectionId, boolean>

const productionSectionIds: Record<ProductionFloorCode, SectionId> = {
  conventional: "productionConventional",
  "conventional-02": "productionConventional02",
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
    productionConventional02:
      onProduction && activeProductionFloor === "conventional-02",
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
      productionConventional02:
        typeof parsed.productionConventional02 === "boolean"
          ? parsed.productionConventional02
          : fallback.productionConventional02,
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
  const PlanningHolidayIcon = planningHolidayNavigation.icon
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [menuSearch, setMenuSearch] = useState("")
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
  const normalizedMenuSearch = menuSearch.trim().toLowerCase()
  const filteredCommercialNavigation = filterNavigationItems(
    visibleCommercialNavigation,
    normalizedMenuSearch,
    "costing commercial"
  )
  const filteredHrNavigation = filterNavigationItems(
    visibleHrNavigation,
    normalizedMenuSearch,
    "hr recruitment"
  )
  const filteredProductionNavigation = navigationAccess.operations
    ? productionFloors
        .map((floor) => ({
          floor,
          items: filterProductionItems(
            productionFloorNavigation,
            normalizedMenuSearch,
            `${floor.label} ${floor.shortLabel} production`.toLowerCase()
          ),
        }))
        .filter(({ items }) => items.length)
    : []
  const planningHolidayMatchesSearch =
    navigationAccess.operations &&
    (!normalizedMenuSearch ||
      [
        planningHolidayNavigation.title,
        planningHolidayNavigation.subtitle,
        "holiday calendar",
      ].some((value) => value.toLowerCase().includes(normalizedMenuSearch)))
  const filteredUniversalProductionNavigation = navigationAccess.operations
    ? filterProductionItems(
        [
          ...universalProductionNavigation,
          ...consolidatedProductionNavigation,
        ],
        normalizedMenuSearch,
        "universal production corrections reverse wrong entries data entry master tables machine master checklists maintenance quality masters"
      )
    : []
  const administrationMatchesSearch =
    navigationAccess.administration &&
    (!normalizedMenuSearch ||
      "administration access".includes(normalizedMenuSearch))

  useEffect(() => {
    function focusMenuSearch(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener("keydown", focusMenuSearch)
    return () => window.removeEventListener("keydown", focusMenuSearch)
  }, [])

  function setSectionOpen(section: SectionId, open: boolean) {
    const next = { ...expandedSections, [section]: open }
    window.localStorage.setItem(storageKey, JSON.stringify(next))
    window.dispatchEvent(new Event(stateChangedEvent))
  }

  return (
    <>
      <div className="sticky top-0 z-10 bg-sidebar px-3 pt-1 pb-2">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search navigation menu"
            className="h-10 rounded-lg border-sidebar-border bg-background pr-16 pl-9 shadow-none"
            onChange={(event) => setMenuSearch(event.target.value)}
            placeholder="Search menu..."
            ref={searchInputRef}
            type="search"
            value={menuSearch}
          />
          {menuSearch ? (
            <button
              aria-label="Clear menu search"
              className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              onClick={() => {
                setMenuSearch("")
                searchInputRef.current?.focus()
              }}
              type="button"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-sidebar-border bg-sidebar-accent/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Ctrl K
            </kbd>
          )}
        </div>
      </div>

      {filteredHrNavigation.length ? (
        <NavigationSection
          icon={BriefcaseBusiness}
          isActive={visibleHrNavigation.some((item) =>
            navigationHrefMatches(pathname, searchParams, item.href)
          )}
          label="HR & Recruitment"
          onOpenChange={(open) => {
            if (!normalizedMenuSearch) setSectionOpen("hr", open)
          }}
          open={normalizedMenuSearch ? true : expandedSections.hr}
        >
          {filteredHrNavigation.map((item) => (
            <SidebarMenuSubItem key={item.href}>
              <SidebarMenuSubButton
                asChild
                className="h-8 rounded-md px-2.5 text-sidebar-foreground/70 hover:bg-transparent hover:text-sidebar-primary data-[active=true]:bg-transparent data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary data-[active=true]:shadow-none"
                isActive={navigationHrefMatches(
                  pathname,
                  searchParams,
                  item.href
                )}
              >
                <a href={item.href}>
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full bg-current opacity-55"
                  />
                  <span>{item.label}</span>
                </a>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </NavigationSection>
      ) : null}

      {filteredCommercialNavigation.length ? (
        <NavigationSection
          icon={Calculator}
          isActive={visibleCommercialNavigation.some((item) =>
            navigationHrefMatches(pathname, searchParams, item.href)
          )}
          label="Costing"
          onOpenChange={(open) => {
            if (!normalizedMenuSearch) setSectionOpen("costing", open)
          }}
          open={normalizedMenuSearch ? true : expandedSections.costing}
        >
          {filteredCommercialNavigation.map((item) => (
            <SidebarMenuSubItem key={item.href}>
              <SidebarMenuSubButton
                asChild
                className="h-8 rounded-md px-2.5 text-sidebar-foreground/70 hover:bg-transparent hover:text-sidebar-primary data-[active=true]:bg-transparent data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary data-[active=true]:shadow-none"
                isActive={navigationHrefMatches(
                  pathname,
                  searchParams,
                  item.href
                )}
              >
                <a href={item.href}>
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full bg-current opacity-55"
                  />
                  <span>{item.label}</span>
                </a>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </NavigationSection>
      ) : null}

      {planningHolidayMatchesSearch ? (
        <SidebarGroup className="px-3 py-0.5">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className="h-10 rounded-lg px-3 font-medium hover:bg-sidebar-primary/10 hover:text-sidebar-primary data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary data-[active=true]:shadow-none"
                  isActive={activeDashboardTab === planningHolidayNavigation.id}
                >
                  {onDashboardTabSelect ? (
                    <button
                      onClick={() =>
                        onDashboardTabSelect(
                          planningHolidayNavigation.id,
                          activeProductionFloor
                        )
                      }
                      type="button"
                    >
                      <PlanningHolidayIcon />
                      <span>{planningHolidayNavigation.title}</span>
                    </button>
                  ) : (
                    <a
                      href={dashboardTabHref(
                        planningHolidayNavigation.id,
                        activeProductionFloor
                      )}
                    >
                      <PlanningHolidayIcon />
                      <span>{planningHolidayNavigation.title}</span>
                    </a>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}

      {filteredUniversalProductionNavigation.length ? (
        <SidebarGroup className="px-3 py-0.5">
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredUniversalProductionNavigation.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    asChild
                    className="h-10 rounded-lg px-3 font-medium hover:bg-sidebar-primary/10 hover:text-sidebar-primary data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary data-[active=true]:shadow-none"
                    isActive={activeDashboardTab === item.id}
                  >
                    {onDashboardTabSelect ? (
                      <button
                        onClick={() => onDashboardTabSelect(item.id, activeProductionFloor)}
                        type="button"
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </button>
                    ) : (
                      <a
                        href={universalProductionNavigationHref(
                          item.id,
                          activeProductionFloor
                        )}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </a>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}

      {filteredProductionNavigation.map(({ floor, items }) => {
        const sectionId = productionSectionIds[floor.code]
        return (
          <NavigationSection
            icon={Factory}
            isActive={
              productionFloorNavigation.some(
                (item) => item.id === activeDashboardTab
              ) && floor.code === activeProductionFloor
            }
            key={floor.code}
            label={floor.label}
            onOpenChange={(open) => {
              if (!normalizedMenuSearch) setSectionOpen(sectionId, open)
            }}
            open={normalizedMenuSearch ? true : expandedSections[sectionId]}
          >
            {items.map((item) => (
              <SidebarMenuSubItem key={`${floor.code}:${item.id}`}>
                <SidebarMenuSubButton
                  asChild
                  className="h-8 rounded-md px-2.5 text-sidebar-foreground/70 hover:bg-transparent hover:text-sidebar-primary data-[active=true]:bg-transparent data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary data-[active=true]:shadow-none"
                  isActive={
                    floor.code === activeProductionFloor &&
                    item.id === activeDashboardTab
                  }
                >
                  {onDashboardTabSelect ? (
                    <button
                      onClick={() => onDashboardTabSelect(item.id, floor.code)}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-current opacity-55"
                      />
                      <span>{item.title}</span>
                    </button>
                  ) : (
                    <a href={productionNavigationHref(item.id, floor.code)}>
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-current opacity-55"
                      />
                      <span>{item.title}</span>
                    </a>
                  )}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </NavigationSection>
        )
      })}

      {administrationMatchesSearch ? (
        <SidebarGroup className="px-3 py-0.5">
          <SidebarGroupContent>
            <SidebarMenu>
              {administrationNavigation.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    className="h-10 rounded-lg px-3 font-medium hover:bg-sidebar-primary/10 hover:text-sidebar-primary data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary data-[active=true]:shadow-none"
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

      {normalizedMenuSearch &&
      !filteredHrNavigation.length &&
      !filteredCommercialNavigation.length &&
      !planningHolidayMatchesSearch &&
      !filteredUniversalProductionNavigation.length &&
      !filteredProductionNavigation.length &&
      !administrationMatchesSearch ? (
        <p className="px-6 py-8 text-center text-sm text-muted-foreground">
          No menu items found.
        </p>
      ) : null}
    </>
  )
}

function filterNavigationItems<T extends { label: string }>(
  items: readonly T[],
  query: string,
  sectionSearchText: string
) {
  if (!query || sectionSearchText.includes(query)) return items
  return items.filter((item) => item.label.toLowerCase().includes(query))
}

function productionNavigationHref(
  tab: DashboardTabId,
  floor: ProductionFloorCode
) {
  if (tab === "firstPieceInspectionTab") {
    const params = new URLSearchParams({ floor })
    return `/dashboard/first-piece-inspection?${params.toString()}`
  }
  return dashboardTabHref(tab, floor)
}

function universalProductionNavigationHref(
  tab: DashboardTabId,
  floor: ProductionFloorCode
) {
  return dashboardTabHref(
    tab,
    tab === "correctionsTab" ||
      tab === "maintenanceTab" ||
      tab === "productionDashboardTab"
      ? undefined
      : floor
  )
}

function filterProductionItems<T extends { subtitle: string; title: string }>(
  items: readonly T[],
  query: string,
  sectionSearchText: string
) {
  if (!query || sectionSearchText.includes(query)) return items
  return items.filter((item) =>
    [item.title, item.subtitle].some((value) =>
      value.toLowerCase().includes(query)
    )
  )
}

function NavigationSection({
  children,
  icon: Icon,
  isActive,
  label,
  onOpenChange,
  open,
}: {
  children: React.ReactNode
  icon: typeof Factory
  isActive: boolean
  label: string
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  return (
    <Collapsible
      className="group/collapsible px-3 py-0.5"
      onOpenChange={onOpenChange}
      open={open}
    >
      <SidebarGroup className="p-0">
        <SidebarMenu>
          <SidebarMenuItem className="overflow-hidden rounded-lg transition-colors group-data-[state=open]/collapsible:bg-sidebar-primary/[0.07]">
            <CollapsibleTrigger asChild>
              <SidebarMenuButton
                className="h-10 rounded-lg px-3 font-medium group-data-[state=open]/collapsible:text-sidebar-primary hover:bg-sidebar-primary/10 hover:text-sidebar-primary data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary data-[active=true]:shadow-none"
                isActive={isActive}
                title={label}
                type="button"
              >
                <Icon className="size-[18px]" />
                <span className="truncate">{label}</span>
                <span className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[state=open]/collapsible:text-sidebar-primary">
                  <ChevronRight className="size-3.5" />
                </span>
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub
                aria-label={`${label} submodules`}
                className="mx-5 mt-0 mb-1 gap-0 border-sidebar-primary/30 px-2 py-1"
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
