"use client"

import {
  Children,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { usePathname, useSearchParams } from "next/navigation"
import {
  BriefcaseBusiness,
  Boxes,
  Calculator,
  ChevronRight,
  Factory,
  Database,
  ListChecks,
  LayoutDashboard,
  Search,
  TableProperties,
  Wrench,
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
import { masterDataNavigationLinks } from "@/lib/master-data-navigation"
import { sidebarModuleLabels } from "@/lib/sidebar-module-labels"
import {
  expandedSidebarSections,
  storedSidebarSections,
  type ExpandedSidebarSections,
  type SidebarSectionId,
} from "@/lib/sidebar-accordion"
import {
  administrationNavigation,
  commercialCostingNavigation,
  commercialMasterDataWorkspaceNavigation,
  commercialOperationalEntryNavigation,
  consolidatedProductionNavigation,
  dashboardNavigationDestination,
  hrSidebarNavigation,
  maintenanceNavigation,
  navigationHrefMatches,
  operationalEntryNavigation,
  personalDashboardNavigation,
  productionFloorNavigation,
  storeNavigation,
  universalProductionNavigation,
  type DashboardTabId,
} from "@/lib/unified-navigation"

const storageKey = "mrmpl:sidebar:expanded-modules"
const stateChangedEvent = "mrmpl:sidebar:expanded-modules-changed"
const topLevelButtonClassName =
  "h-10 rounded-lg px-3 font-medium text-sidebar-foreground/85 transition-[transform,background-color,color,box-shadow] duration-[var(--dur-fast)] hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-[var(--color-brand-tint)] data-[active=true]:font-semibold data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-[inset_3px_0_0_var(--sidebar-primary)] data-[active=true]:hover:bg-[var(--color-brand-tint)]"
const submoduleButtonClassName =
  "group/submodule h-8 rounded-md px-2.5 text-sidebar-foreground/70 transition-[transform,background-color,color,box-shadow] duration-[var(--dur-fast)] hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-[var(--color-brand-tint)] data-[active=true]:font-semibold data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-[inset_3px_0_0_var(--sidebar-primary)] data-[active=true]:hover:bg-[var(--color-brand-tint)]"

type SectionId = SidebarSectionId
type ExpandedSections = ExpandedSidebarSections

const productionSectionIds: Record<ProductionFloorCode, SectionId> = {
  conventional: "productionConventional",
  "conventional-02": "productionConventional02",
  cnc: "productionCnc",
  forging: "productionForging",
}
function defaultExpandedSections(
  pathname: string,
  activeProductionFloor: ProductionFloorCode,
  activeDashboardTab?: DashboardTabId
): ExpandedSections {
  const onProduction = pathname === "/" || pathname.startsWith("/dashboard")
  const onCommercialMasterData = commercialMasterDataWorkspaceNavigation.some(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`)
  )
  const onCommercialOperationalEntry =
    commercialOperationalEntryNavigation.some(
      ({ href }) => pathname === href || pathname.startsWith(`${href}/`)
    )
  return {
    costing:
      pathname.startsWith("/commercial") &&
      !onCommercialMasterData &&
      !onCommercialOperationalEntry,
    hr: pathname.startsWith("/hr"),
    masterData:
      pathname.startsWith("/masters") ||
      activeDashboardTab === "dataEntryTab" ||
      activeDashboardTab === "masterTablesTab" ||
      onCommercialMasterData,
    operationalEntry:
      pathname.startsWith("/operational-entry") ||
      activeDashboardTab === "operationalEntryTab" ||
      activeDashboardTab === "operationalTablesTab" ||
      onCommercialOperationalEntry,
    maintenance:
      pathname.startsWith("/maintenance") ||
      activeDashboardTab === "maintenanceTab",
    store: pathname.startsWith("/store"),
    productionConventional:
      onProduction && activeProductionFloor === "conventional",
    productionConventional02:
      onProduction && activeProductionFloor === "conventional-02",
    productionCnc: onProduction && activeProductionFloor === "cnc",
    productionForging: onProduction && activeProductionFloor === "forging",
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
  activeMasterEntryType,
  activeProductionFloor = defaultProductionFloorCode,
  navigationAccess,
  onDashboardTabSelect,
}: {
  activeDashboardTab?: DashboardTabId
  activeMasterEntryType?: string
  activeProductionFloor?: ProductionFloorCode
  navigationAccess: UnifiedNavigationAccess
  onDashboardTabSelect?: (
    tab: DashboardTabId,
    productionFloor: ProductionFloorCode
  ) => void
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [menuSearch, setMenuSearch] = useState("")
  const storedSections = useSyncExternalStore(
    subscribeToExpandedSections,
    expandedSectionsSnapshot,
    serverExpandedSectionsSnapshot
  )
  const expandedSections = storedSidebarSections(
    storedSections,
    defaultExpandedSections(
      pathname,
      normalizeProductionFloorCode(
        searchParams.get("floor") ?? activeProductionFloor
      ),
      activeDashboardTab
    )
  )
  const visibleCommercialNavigation = commercialCostingNavigation.filter(
    (item) => navigationAccess.commercialHrefs.includes(item.href)
  )
  const visibleCommercialOperationalEntryNavigation =
    commercialOperationalEntryNavigation.filter((item) =>
      navigationAccess.commercialHrefs.includes(item.href)
    )
  const onCommercialOperationalEntry =
    visibleCommercialOperationalEntryNavigation.some((item) =>
      navigationHrefMatches(pathname, searchParams, item.href)
    )
  const visibleHrNavigation = hrSidebarNavigation.filter((item) =>
    navigationAccess.hrHrefs.includes(item.href)
  )
  const visibleStoreNavigation = navigationAccess.storeHrefs
    ? storeNavigation.filter((item) =>
        navigationAccess.storeHrefs?.includes(item.href)
      )
    : navigationAccess.store
      ? storeNavigation
      : []
  const visibleMaintenanceNavigation = maintenanceNavigation.filter((item) =>
    (navigationAccess.maintenanceHrefs ?? ["/maintenance/requests"]).includes(
      item.href
    )
  )
  const visibleAdministrationNavigation = administrationNavigation.filter(
    (item) =>
      (item.href !== "/administration/access" ||
        navigationAccess.administration) &&
      (item.href !== "/administration/artifacts" || navigationAccess.artifacts)
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
  const filteredStoreNavigation = filterNavigationItems(
    visibleStoreNavigation,
    normalizedMenuSearch,
    "store inventory assets requests receipts"
  )
  const filteredMaintenanceNavigation = filterNavigationItems(
    visibleMaintenanceNavigation,
    normalizedMenuSearch,
    "maintenance requests manager approval electrical plumbing mechanical"
  )
  const filteredProductionNavigation = navigationAccess.operations
    ? productionFloors
        .map((floor) => ({
          floor,
          items: filterProductionItems(
            productionFloorNavigation.filter(
              (item) =>
                !navigationAccess.productionFloorTabIds ||
                navigationAccess.productionFloorTabIds[floor.code]?.includes(
                  item.id
                )
            ),
            normalizedMenuSearch,
            `${floor.label} ${floor.shortLabel} production`.toLowerCase()
          ),
        }))
        .filter(({ items }) => items.length)
    : []
  const filteredUniversalProductionNavigation = navigationAccess.operations
    ? filterProductionItems(
        [
          ...universalProductionNavigation,
          ...consolidatedProductionNavigation,
        ].filter(
          (item) =>
            !navigationAccess.productionTabIds ||
            navigationAccess.productionTabIds.includes(item.id)
        ),
        normalizedMenuSearch,
        "universal production corrections reverse wrong entries data entry master tables machine master checklists maintenance quality masters"
      )
    : []
  const visibleMasterDataNavigation = [
    {
      destination: "/masters",
      icon: Database,
      id: "masterSelection" as const,
      title: "Master Selection" as const,
    },
    ...masterDataNavigationLinks(navigationAccess, {
      entryType: activeMasterEntryType,
      pathname,
      productionFloorCode: activeProductionFloor,
      searchParams,
    }).map((item) => ({ ...item, icon: TableProperties })),
  ]
  const filteredMasterDataNavigation = visibleMasterDataNavigation.filter(
    (item) =>
      !normalizedMenuSearch ||
      item.title.toLowerCase().includes(normalizedMenuSearch) ||
      "company master data masters customers website products".includes(
        normalizedMenuSearch
      )
  )
  const canSelectProductionEntry =
    navigationAccess.operations &&
    (!navigationAccess.productionTabIds ||
      navigationAccess.productionTabIds.includes("operationalEntryTab"))
  const canSelectProductionTable =
    navigationAccess.operations &&
    (!navigationAccess.productionTabIds ||
      navigationAccess.productionTabIds.includes("operationalTablesTab"))
  const canSelectCommercialEntry =
    visibleCommercialOperationalEntryNavigation.length > 0
  const canSelectCommercialTable =
    visibleCommercialOperationalEntryNavigation.some(
      ({ href }) => href === "/commercial/enquiries"
    )
  const visibleOperationalEntryNavigation = operationalEntryNavigation
    .filter((item) =>
      item.id === "operationalEntryTab"
        ? canSelectProductionEntry || canSelectCommercialEntry
        : canSelectProductionTable || canSelectCommercialTable
    )
    .map((item) => ({
      dashboardTabId: item.id,
      destination: item.href,
      icon: item.icon,
      id: item.id,
      title: item.title,
    }))
  const filteredOperationalEntryNavigation =
    visibleOperationalEntryNavigation.filter(
      (item) =>
        !normalizedMenuSearch ||
        item.title.toLowerCase().includes(normalizedMenuSearch) ||
        "operational entry work orders rm inward production output enquiries purchase orders tables".includes(
          normalizedMenuSearch
        )
    )
  const filteredAdministrationNavigation = filterNavigationItems(
    visibleAdministrationNavigation,
    normalizedMenuSearch,
    "administration artifacts files access account password security"
  )
  const dashboardMatchesSearch =
    !normalizedMenuSearch ||
    "dashboard home my dashboard".includes(normalizedMenuSearch)
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
    const next = expandedSidebarSections(open ? section : undefined)
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
            placeholder="Search menu…"
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
              <X aria-hidden="true" className="size-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-sidebar-border bg-sidebar-accent/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Ctrl K
            </kbd>
          )}
        </div>
      </div>

      {dashboardMatchesSearch ? (
        <SidebarGroup className="px-3 py-0.5">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={topLevelButtonClassName}
                  isActive={pathname === personalDashboardNavigation.href}
                >
                  <a href={personalDashboardNavigation.href}>
                    <LayoutDashboard aria-hidden="true" />
                    <span>{personalDashboardNavigation.label}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}

      {filteredMasterDataNavigation.length ? (
        <NavigationSection
          icon={Database}
          isActive={
            visibleMasterDataNavigation.some(
              (item) =>
                activeDashboardTab === item.id ||
                navigationHrefMatches(pathname, searchParams, item.destination)
            ) ||
            commercialMasterDataWorkspaceNavigation.some((item) =>
              navigationHrefMatches(pathname, searchParams, item.href)
            )
          }
          label={sidebarModuleLabels.masterData}
          onOpenChange={(open) => {
            if (!normalizedMenuSearch) setSectionOpen("masterData", open)
          }}
          open={normalizedMenuSearch ? true : expandedSections.masterData}
        >
          {filteredMasterDataNavigation.map((item) => (
            <SidebarMenuSubItem key={item.id}>
              <SidebarMenuSubButton
                asChild
                className={submoduleButtonClassName}
                isActive={
                  activeDashboardTab === item.id ||
                  navigationHrefMatches(
                    pathname,
                    searchParams,
                    item.destination
                  )
                }
              >
                <a href={item.destination}>
                  <item.icon aria-hidden="true" />
                  <span>{item.title}</span>
                </a>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </NavigationSection>
      ) : null}

      {filteredOperationalEntryNavigation.length ? (
        <NavigationSection
          icon={ListChecks}
          isActive={
            onCommercialOperationalEntry ||
            visibleOperationalEntryNavigation.some(
              (item) =>
                (item.dashboardTabId !== undefined &&
                  activeDashboardTab === item.dashboardTabId) ||
                navigationHrefMatches(pathname, searchParams, item.destination)
            )
          }
          label={sidebarModuleLabels.operationalEntry}
          onOpenChange={(open) => {
            if (!normalizedMenuSearch) setSectionOpen("operationalEntry", open)
          }}
          open={normalizedMenuSearch ? true : expandedSections.operationalEntry}
        >
          {filteredOperationalEntryNavigation.map((item) => (
            <SidebarMenuSubItem key={item.id}>
              <SidebarMenuSubButton
                asChild
                className={submoduleButtonClassName}
                isActive={
                  (item.dashboardTabId === "operationalEntryTab" &&
                    onCommercialOperationalEntry) ||
                  (item.dashboardTabId !== undefined &&
                    activeDashboardTab === item.dashboardTabId) ||
                  navigationHrefMatches(
                    pathname,
                    searchParams,
                    item.destination
                  )
                }
              >
                <a href={item.destination}>
                  <item.icon aria-hidden="true" />
                  <span>{item.title}</span>
                </a>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </NavigationSection>
      ) : null}

      {filteredHrNavigation.length ? (
        <NavigationSection
          icon={BriefcaseBusiness}
          isActive={visibleHrNavigation.some((item) =>
            navigationHrefMatches(pathname, searchParams, item.href)
          )}
          label={sidebarModuleLabels.hr}
          onOpenChange={(open) => {
            if (!normalizedMenuSearch) setSectionOpen("hr", open)
          }}
          open={normalizedMenuSearch ? true : expandedSections.hr}
        >
          {filteredHrNavigation.map((item) => (
            <SidebarMenuSubItem key={item.href}>
              <SidebarMenuSubButton
                asChild
                className={submoduleButtonClassName}
                isActive={navigationHrefMatches(
                  pathname,
                  searchParams,
                  item.href
                )}
              >
                <a href={item.href}>
                  <item.icon aria-hidden="true" />
                  <span>{item.label}</span>
                </a>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </NavigationSection>
      ) : null}

      {filteredMaintenanceNavigation.length ? (
        <NavigationSection
          icon={Wrench}
          isActive={
            activeDashboardTab === "maintenanceTab" ||
            visibleMaintenanceNavigation.some((item) =>
              navigationHrefMatches(pathname, searchParams, item.href)
            )
          }
          label={sidebarModuleLabels.maintenance}
          onOpenChange={(open) => {
            if (!normalizedMenuSearch) setSectionOpen("maintenance", open)
          }}
          open={normalizedMenuSearch ? true : expandedSections.maintenance}
        >
          {filteredMaintenanceNavigation.map((item) => (
            <SidebarMenuSubItem key={item.href}>
              <SidebarMenuSubButton
                asChild
                className={submoduleButtonClassName}
                isActive={
                  (item.href.includes("maintenanceTab") &&
                    activeDashboardTab === "maintenanceTab") ||
                  navigationHrefMatches(pathname, searchParams, item.href)
                }
              >
                <a href={item.href}>
                  <item.icon aria-hidden="true" />
                  <span>{item.label}</span>
                </a>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </NavigationSection>
      ) : null}

      {filteredStoreNavigation.length ? (
        <NavigationSection
          icon={Boxes}
          isActive={visibleStoreNavigation.some((item) =>
            navigationHrefMatches(pathname, searchParams, item.href)
          )}
          label={sidebarModuleLabels.store}
          onOpenChange={(open) => {
            if (!normalizedMenuSearch) setSectionOpen("store", open)
          }}
          open={normalizedMenuSearch ? true : expandedSections.store}
        >
          {filteredStoreNavigation.map((item) => (
            <SidebarMenuSubItem key={item.href}>
              <SidebarMenuSubButton
                asChild
                className={submoduleButtonClassName}
                isActive={navigationHrefMatches(
                  pathname,
                  searchParams,
                  item.href
                )}
              >
                <a href={item.href}>
                  <item.icon aria-hidden="true" />
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
          label={sidebarModuleLabels.costing}
          onOpenChange={(open) => {
            if (!normalizedMenuSearch) setSectionOpen("costing", open)
          }}
          open={normalizedMenuSearch ? true : expandedSections.costing}
        >
          {filteredCommercialNavigation.map((item) => (
            <SidebarMenuSubItem key={item.href}>
              <SidebarMenuSubButton
                asChild
                className={submoduleButtonClassName}
                isActive={navigationHrefMatches(
                  pathname,
                  searchParams,
                  item.href
                )}
              >
                <a href={item.href}>
                  <item.icon aria-hidden="true" />
                  <span>{item.label}</span>
                </a>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </NavigationSection>
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
                  className={submoduleButtonClassName}
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
                      <item.icon aria-hidden="true" />
                      <span>{item.title}</span>
                    </button>
                  ) : (
                    <a href={productionNavigationHref(item.id, floor.code)}>
                      <item.icon aria-hidden="true" />
                      <span>{item.title}</span>
                    </a>
                  )}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </NavigationSection>
        )
      })}

      {filteredUniversalProductionNavigation.length ? (
        <SidebarGroup className="px-3 py-0.5">
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredUniversalProductionNavigation.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    asChild
                    className={topLevelButtonClassName}
                    isActive={activeDashboardTab === item.id}
                  >
                    {onDashboardTabSelect ? (
                      <button
                        onClick={() =>
                          onDashboardTabSelect(item.id, activeProductionFloor)
                        }
                        type="button"
                      >
                        <item.icon aria-hidden="true" />
                        <span>{item.title}</span>
                      </button>
                    ) : (
                      <a
                        href={universalProductionNavigationHref(
                          item.id,
                          activeProductionFloor
                        )}
                      >
                        <item.icon aria-hidden="true" />
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

      {filteredAdministrationNavigation.length ? (
        <SidebarGroup className="px-3 py-0.5">
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredAdministrationNavigation.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    className={topLevelButtonClassName}
                    isActive={navigationHrefMatches(
                      pathname,
                      searchParams,
                      item.href
                    )}
                  >
                    <a href={item.href}>
                      <item.icon aria-hidden="true" />
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
      !filteredMaintenanceNavigation.length &&
      !filteredStoreNavigation.length &&
      !filteredCommercialNavigation.length &&
      !filteredMasterDataNavigation.length &&
      !filteredOperationalEntryNavigation.length &&
      !filteredUniversalProductionNavigation.length &&
      !filteredProductionNavigation.length &&
      !dashboardMatchesSearch &&
      !filteredAdministrationNavigation.length ? (
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
  return dashboardNavigationDestination(tab, floor).href
}

function universalProductionNavigationHref(
  tab: DashboardTabId,
  floor: ProductionFloorCode
) {
  return dashboardNavigationDestination(tab, floor).href
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
  const submoduleCount = Children.count(children)

  return (
    <Collapsible
      className="group/collapsible px-3 py-0.5"
      onOpenChange={onOpenChange}
      open={open}
    >
      <SidebarGroup className="p-0">
        <SidebarMenu>
          <SidebarMenuItem className="overflow-hidden rounded-lg">
            <CollapsibleTrigger asChild>
              <SidebarMenuButton
                className={topLevelButtonClassName}
                isActive={isActive}
                title={label}
                type="button"
              >
                <Icon aria-hidden="true" className="size-[18px]" />
                <span className="truncate">{label}</span>
                <span
                  aria-hidden="true"
                  className="ml-auto min-w-5 shrink-0 rounded-full border border-sidebar-border bg-sidebar-accent px-1.5 text-center text-[10px] leading-5 font-semibold text-sidebar-foreground/70 tabular-nums group-data-[state=open]/collapsible:text-sidebar-foreground"
                >
                  {submoduleCount}
                </span>
                <span className="flex size-6 shrink-0 origin-center items-center justify-center rounded-md text-muted-foreground transition-[transform,color] duration-[var(--dur-base)] group-data-[state=open]/collapsible:rotate-90 group-data-[state=open]/collapsible:text-sidebar-foreground">
                  <ChevronRight aria-hidden="true" className="size-3.5" />
                </span>
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent className="sidebar-submenu-content">
              <SidebarMenuSub
                aria-label={`${label} submodules`}
                className="mx-5 mt-0 mb-1 gap-0 border-l-0 px-1 py-1"
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
