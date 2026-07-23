"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BriefcaseBusiness,
  Calculator,
  ChevronRight,
  Factory,
} from "lucide-react"

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
  hrNavigation,
  type DashboardTabId,
} from "@/lib/unified-navigation"

const storageKey = "mrmpl:sidebar:expanded-modules"
const stateChangedEvent = "mrmpl:sidebar:expanded-modules-changed"

type SectionId = "costing" | "hr" | "production"
type ExpandedSections = Record<SectionId, boolean>

function defaultExpandedSections(pathname: string): ExpandedSections {
  return {
    costing: pathname.startsWith("/commercial"),
    hr: pathname.startsWith("/hr"),
    production: pathname === "/" || pathname.startsWith("/dashboard"),
  }
}

function storedExpandedSections(
  value: string | null,
  fallback: ExpandedSections
): ExpandedSections {
  if (!value) return fallback

  try {
    const parsed = JSON.parse(value) as Partial<ExpandedSections>
    return {
      costing:
        typeof parsed.costing === "boolean" ? parsed.costing : fallback.costing,
      hr: typeof parsed.hr === "boolean" ? parsed.hr : fallback.hr,
      production:
        typeof parsed.production === "boolean"
          ? parsed.production
          : fallback.production,
    }
  } catch {
    return fallback
  }
}

function isNavigationItemActive(pathname: string, href: string) {
  const hrefPath = href.split("?")[0] ?? href
  return hrefPath === "/" || hrefPath === "/commercial"
    ? pathname === hrefPath
    : pathname.startsWith(hrefPath)
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
  navigationAccess,
  onDashboardTabSelect,
}: {
  activeDashboardTab?: DashboardTabId
  navigationAccess: UnifiedNavigationAccess
  onDashboardTabSelect?: (tab: DashboardTabId) => void
}) {
  const pathname = usePathname()
  const storedSections = useSyncExternalStore(
    subscribeToExpandedSections,
    expandedSectionsSnapshot,
    serverExpandedSectionsSnapshot
  )
  const expandedSections = storedExpandedSections(
    storedSections,
    defaultExpandedSections(pathname)
  )
  const visibleCommercialNavigation = commercialNavigation.filter((item) =>
    navigationAccess.commercialHrefs.includes(item.href)
  )

  function setSectionOpen(section: SectionId, open: boolean) {
    const next = { ...expandedSections, [section]: open }
    window.localStorage.setItem(storageKey, JSON.stringify(next))
    window.dispatchEvent(new Event(stateChangedEvent))
  }

  return (
    <>
      {navigationAccess.hrRecruitment ? (
        <NavigationSection
          icon={BriefcaseBusiness}
          label="HR Recruitment"
          onOpenChange={(open) => setSectionOpen("hr", open)}
          open={expandedSections.hr}
        >
          {hrNavigation.map((item) => (
            <SidebarMenuSubItem key={item.href}>
              <SidebarMenuSubButton
                asChild
                isActive={isNavigationItemActive(pathname, item.href)}
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
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
        >
          {visibleCommercialNavigation.map((item) => (
            <SidebarMenuSubItem key={item.href}>
              <SidebarMenuSubButton
                asChild
                isActive={isNavigationItemActive(pathname, item.href)}
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </NavigationSection>
      ) : null}

      {navigationAccess.operations ? (
        <NavigationSection
          icon={Factory}
          label="Production Floor"
          onOpenChange={(open) => setSectionOpen("production", open)}
          open={expandedSections.production}
        >
          {dashboardNavigation.map((item) => (
            <SidebarMenuSubItem key={item.id}>
              <SidebarMenuSubButton
                asChild
                isActive={item.id === activeDashboardTab}
              >
                {onDashboardTabSelect ? (
                  <button
                    onClick={() => onDashboardTabSelect(item.id)}
                    type="button"
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </button>
                ) : (
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                )}
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </NavigationSection>
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
                    isActive={isNavigationItemActive(pathname, item.href)}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
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
}: {
  children: React.ReactNode
  icon: typeof Factory
  label: string
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  return (
    <Collapsible
      className="group/collapsible"
      onOpenChange={onOpenChange}
      open={open}
    >
      <SidebarGroup className="py-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton
                className="font-medium"
                isActive={open}
                type="button"
              >
                <Icon />
                <span>{label}</span>
                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>{children}</SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </Collapsible>
  )
}
