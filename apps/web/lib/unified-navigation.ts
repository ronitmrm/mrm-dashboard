import {
  Boxes,
  BriefcaseBusiness,
  Calculator,
  CalendarDays,
  ClipboardList,
  Database,
  Factory,
  FileClock,
  Gauge,
  Globe2,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  PackageCheck,
  PackageSearch,
  RefreshCcw,
  Route,
  ScrollText,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  TableProperties,
  Undo2,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import type { ProductionFloorCode } from "@workspace/db/production-floors"

export type DashboardTabId =
  | "productionDashboardTab"
  | "productionSessionsTab"
  | "productionControlTab"
  | "jobCardStatusTab"
  | "machineDetailTab"
  | "machineMasterTab"
  | "masterGapsTab"
  | "masterTablesTab"
  | "dataEntryTab"
  | "operationalEntryTab"
  | "planningHolidayTab"
  | "setupChecklistMasterTab"
  | "maintenanceMastersTab"
  | "qualityMastersTab"
  | "maintenanceTab"
  | "planningControlTab"
  | "shopFloorStatusTab"
  | "shopFloorTasksTab"
  | "machinistTasksTab"
  | "qualityControlTasksTab"
  | "firstPieceInspectionTab"
  | "correctionsTab"

type DashboardNavigationItem = {
  href: string
  icon: LucideIcon
  id: DashboardTabId
  subtitle: string
  title: string
}

export const personalDashboardNavigation = {
  href: "/home",
  icon: LayoutDashboard,
  label: "Dashboard",
} as const

export function dashboardTabHref(
  tab: DashboardTabId,
  productionFloorCode?: ProductionFloorCode
) {
  const params = new URLSearchParams({ tab })
  if (productionFloorCode) params.set("floor", productionFloorCode)
  return `/?${params.toString()}`
}

const legacyMasterEntryByDashboardTab: Partial<
  Record<DashboardTabId, string>
> = {
  maintenanceMastersTab: "maintenance_master",
  planningHolidayTab: "planning_holiday",
  qualityMastersTab: "quality_parameter_master",
  setupChecklistMasterTab: "setup_checklist_master",
}

export function legacyMasterEntryForDashboardTab(tab?: string) {
  return tab
    ? legacyMasterEntryByDashboardTab[tab as DashboardTabId]
    : undefined
}

export function jobCardWorkspaceHref(
  jobCardNumber: string,
  productionFloorCode: ProductionFloorCode
) {
  return `/dashboard/job-cards/${encodeURIComponent(jobCardNumber)}?${new URLSearchParams(
    {
      floor: productionFloorCode,
    }
  ).toString()}`
}

export function dashboardNavigationDestination(
  tab: DashboardTabId,
  productionFloorCode: ProductionFloorCode
): { href: string; interaction: "dashboard" | "route" } {
  if (tab === "productionSessionsTab") {
    return {
      href: `/dashboard/production-sessions?${new URLSearchParams({
        floor: productionFloorCode,
      }).toString()}`,
      interaction: "route",
    }
  }
  if (tab === "firstPieceInspectionTab") {
    return {
      href: `/dashboard/first-piece-inspection?${new URLSearchParams({
        floor: productionFloorCode,
      }).toString()}`,
      interaction: "route",
    }
  }
  const isCompanyWide = [
    "machineMasterTab",
    "maintenanceTab",
    "correctionsTab",
    "productionDashboardTab",
  ].includes(tab)
  return {
    href: dashboardTabHref(
      tab,
      isCompanyWide ? undefined : productionFloorCode
    ),
    interaction: "dashboard",
  }
}

export function navigationHrefMatches(
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
  href: string
) {
  const destination = new URL(href, "http://mrmpl.local")
  if (
    pathname.startsWith("/hr/jobs/") &&
    destination.pathname === "/hr" &&
    destination.searchParams.get("panel") === "jobsPanel"
  ) {
    return true
  }
  if (
    pathname.startsWith("/hr/candidates/") &&
    destination.pathname === "/hr" &&
    destination.searchParams.get("panel") === "candidatesPanel"
  ) {
    return true
  }
  const pathMatches =
    destination.pathname === "/" || destination.pathname === "/commercial"
      ? pathname === destination.pathname
      : pathname.startsWith(destination.pathname)

  return (
    pathMatches &&
    [...destination.searchParams.entries()].every(
      ([key, value]) => searchParams.get(key) === value
    )
  )
}

export const dashboardNavigation: readonly DashboardNavigationItem[] = [
  {
    href: dashboardTabHref("productionDashboardTab"),
    icon: LayoutDashboard,
    id: "productionDashboardTab",
    subtitle: "Orders And Dispatch Dates",
    title: "Production Dashboard",
  },
  {
    href: "/dashboard/production-sessions",
    icon: FileClock,
    id: "productionSessionsTab",
    subtitle: "Start, Register, Events",
    title: "Production Sessions",
  },
  {
    href: dashboardTabHref("productionControlTab"),
    icon: ClipboardList,
    id: "productionControlTab",
    subtitle: "Priority, Route, Dispatch",
    title: "Planner Actions",
  },
  {
    href: dashboardTabHref("planningControlTab"),
    icon: Route,
    id: "planningControlTab",
    subtitle: "Route And Plan Checks",
    title: "Planning Control",
  },
  {
    href: dashboardTabHref("jobCardStatusTab"),
    icon: PackageCheck,
    id: "jobCardStatusTab",
    subtitle: "Running And Completed",
    title: "Job Cards",
  },
  {
    href: dashboardTabHref("machineDetailTab"),
    icon: Factory,
    id: "machineDetailTab",
    subtitle: "Setup Planning",
    title: "Machine Detail",
  },
  {
    href: dashboardTabHref("shopFloorStatusTab"),
    icon: Factory,
    id: "shopFloorStatusTab",
    subtitle: "Machine Queue",
    title: "Shop Floor Status",
  },
  {
    href: dashboardTabHref("shopFloorTasksTab"),
    icon: PackageCheck,
    id: "shopFloorTasksTab",
    subtitle: "Raw Material At Machine",
    title: "Shop Floor Tasks",
  },
  {
    href: dashboardTabHref("machinistTasksTab"),
    icon: Wrench,
    id: "machinistTasksTab",
    subtitle: "Pre Setting, Setting, Start",
    title: "Machinist",
  },
  {
    href: dashboardTabHref("qualityControlTasksTab"),
    icon: ShieldCheck,
    id: "qualityControlTasksTab",
    subtitle: "Setup Approvals",
    title: "Quality Control",
  },
  {
    href: dashboardTabHref("firstPieceInspectionTab"),
    icon: Gauge,
    id: "firstPieceInspectionTab",
    subtitle: "Quality Readings",
    title: "First Piece Inspection",
  },
  {
    href: dashboardTabHref("maintenanceTab"),
    icon: Settings2,
    id: "maintenanceTab",
    subtitle: "Machine Pm Schedule",
    title: "Mechanical Maintenance",
  },
  {
    href: dashboardTabHref("correctionsTab"),
    icon: Undo2,
    id: "correctionsTab",
    subtitle: "Reverse Wrong Entries",
    title: "Corrections",
  },
  {
    href: dashboardTabHref("dataEntryTab"),
    icon: ListChecks,
    id: "dataEntryTab",
    subtitle: "Imports And Manual Entry",
    title: "Data Entry",
  },
  {
    href: dashboardTabHref("masterTablesTab"),
    icon: Database,
    id: "masterTablesTab",
    subtitle: "Search Saved Masters",
    title: "Master Tables",
  },
  {
    href: dashboardTabHref("operationalEntryTab"),
    icon: ClipboardList,
    id: "operationalEntryTab",
    subtitle: "Work Orders, Inward, Output",
    title: "Data Entry",
  },
  {
    href: dashboardTabHref("masterGapsTab"),
    icon: Database,
    id: "masterGapsTab",
    subtitle: "Missing Planning Data",
    title: "Part Readiness",
  },
  {
    href: dashboardTabHref("machineMasterTab"),
    icon: Factory,
    id: "machineMasterTab",
    subtitle: "History And Maintenance",
    title: "Machines",
  },
  {
    href: dashboardTabHref("planningHolidayTab"),
    icon: CalendarDays,
    id: "planningHolidayTab",
    subtitle: "Friday Shutdown, Holidays",
    title: "Planning Holidays",
  },
  {
    href: dashboardTabHref("setupChecklistMasterTab"),
    icon: ListChecks,
    id: "setupChecklistMasterTab",
    subtitle: "Setup And Maintenance",
    title: "Checklists",
  },
  {
    href: dashboardTabHref("maintenanceMastersTab"),
    icon: Settings2,
    id: "maintenanceMastersTab",
    subtitle: "Maintenance Schedules",
    title: "Maintenance Masters",
  },
  {
    href: dashboardTabHref("qualityMastersTab"),
    icon: ShieldCheck,
    id: "qualityMastersTab",
    subtitle: "Inspection Lines And Codes",
    title: "Quality Masters",
  },
]

export const planningHolidayNavigation = dashboardNavigation.find(
  (item) => item.id === "planningHolidayTab"
)!

export const machineMasterNavigation = dashboardNavigation.find(
  (item) => item.id === "machineMasterTab"
)!

const universalProductionNavigationOrder: DashboardTabId[] = [
  "productionDashboardTab",
  "machineMasterTab",
  "maintenanceTab",
  "correctionsTab",
]
const universalProductionNavigationIds = new Set(
  universalProductionNavigationOrder
)

export const consolidatedProductionNavigation = [] as const

export const universalProductionNavigation = dashboardNavigation.filter(
  (item) => universalProductionNavigationIds.has(item.id)
).sort(
  (left, right) =>
    universalProductionNavigationOrder.indexOf(left.id) -
    universalProductionNavigationOrder.indexOf(right.id)
)

const masterDataNavigationIds = new Set<DashboardTabId>([
  "dataEntryTab",
  "masterTablesTab",
])

export const masterDataNavigation = dashboardNavigation.filter((item) =>
  masterDataNavigationIds.has(item.id)
)

export const operationalEntryNavigation = dashboardNavigation.filter(
  (item) => item.id === "operationalEntryTab"
)

export const productionFloorNavigation = dashboardNavigation
  .filter(
    (item) =>
      item.id !== planningHolidayNavigation.id &&
      !universalProductionNavigationIds.has(item.id) &&
      ![
        "dataEntryTab",
        "masterTablesTab",
        "operationalEntryTab",
        "machineMasterTab",
        "setupChecklistMasterTab",
        "maintenanceMastersTab",
        "qualityMastersTab",
      ].includes(item.id)
  )
  .sort(
    (left, right) =>
      Number(right.id === "masterGapsTab") - Number(left.id === "masterGapsTab")
  )

export const commercialNavigation = [
  {
    href: "/commercial",
    icon: LayoutDashboard,
    label: "Commercial Overview",
  },
  {
    href: "/commercial/customers",
    icon: UsersRound,
    label: "Customers",
  },
  {
    href: "/commercial/enquiries",
    icon: ClipboardList,
    label: "Enquiries",
  },
  {
    href: "/commercial/sales",
    icon: MessageSquareText,
    label: "Sales",
  },
  {
    href: "/commercial/technical-review",
    icon: Wrench,
    label: "Technical Review",
  },
  {
    href: "/commercial/design",
    icon: Factory,
    label: "Design",
  },
  {
    href: "/commercial/products",
    icon: PackageSearch,
    label: "Products",
  },
  {
    href: "/commercial/assemblies",
    icon: Boxes,
    label: "Assembly / Bom",
  },
  {
    href: "/commercial/drawing-history",
    icon: FileClock,
    label: "Drawing History",
  },
  {
    href: "/commercial/website-products",
    icon: Globe2,
    label: "Website Products",
  },
  {
    href: "/commercial/costing",
    icon: Calculator,
    label: "Product Costing",
  },
  {
    href: "/commercial/quotes",
    icon: ScrollText,
    label: "Quote Register",
  },
  {
    href: "/commercial/pricing",
    icon: TableProperties,
    label: "Pricing",
  },
  {
    href: "/commercial/orders",
    icon: ShoppingCart,
    label: "Purchase Orders",
  },
  {
    href: "/commercial/revisions",
    icon: RefreshCcw,
    label: "Price Revisions",
  },
  {
    href: "/commercial/corrections",
    icon: Undo2,
    label: "Corrections",
  },
] as const

export const commercialMasterDataNavigation = commercialNavigation.filter(
  ({ href }) =>
    href === "/commercial/customers" ||
    href === "/commercial/website-products"
)

export const commercialOperationalEntryNavigation =
  commercialNavigation.filter(({ href }) => href === "/commercial/enquiries")

export const commercialCostingNavigation = commercialNavigation.filter(
  ({ href }) =>
    !commercialMasterDataNavigation.some((item) => item.href === href) &&
    !commercialOperationalEntryNavigation.some((item) => item.href === href)
)

export const commercialMasterNavigation = {
  href: "/commercial/masters",
  icon: Database,
  label: "Pricing Masters",
} as const

export const storeNavigation = [
  {
    href: "/store",
    icon: LayoutDashboard,
    label: "Store Overview",
  },
  {
    href: "/store/requests",
    icon: ClipboardList,
    label: "Requests & Issues",
  },
  {
    href: "/store/new-item-requests",
    icon: PackageSearch,
    label: "New Item Requests",
  },
  {
    href: "/store/orders",
    icon: ShoppingCart,
    label: "Purchase Register",
  },
  {
    href: "/store/stock",
    icon: Boxes,
    label: "Stock",
  },
] as const

export function storePurchaseOrderHref(input: {
  itemTypeId: string
  quantity: string
  requestNumber: string
}) {
  return `/store/stock?${new URLSearchParams({
    mode: "order",
    orderItemId: input.itemTypeId,
    orderQuantity: input.quantity,
    requestNumber: input.requestNumber,
  }).toString()}`
}

export const hrMasterNavigation = [
  {
    href: "/hr?panel=mastersPanel",
    icon: Database,
    label: "Masters",
    panelId: "mastersPanel",
    requiredCapability: "hr.recruitment.read",
  },
  {
    href: "/hr?panel=postMasterPanel",
    icon: ClipboardList,
    label: "Job Templates",
    panelId: "postMasterPanel",
    requiredCapability: "hr.recruitment.read",
  },
] as const

export const hrNavigation = [
  {
    href: "/hr?panel=approvedPostPanel",
    icon: ListChecks,
    label: "Approved Post Form",
    panelId: "approvedPostPanel",
    requiredCapability: "hr.recruitment.read",
  },
  {
    href: "/hr?panel=employeeMasterPanel",
    icon: UsersRound,
    label: "Employee Master",
    panelId: "employeeMasterPanel",
    requiredCapability: "hr.employees.read",
  },
  {
    href: "/hr?panel=jobsPanel",
    icon: BriefcaseBusiness,
    label: "Job Posts",
    panelId: "jobsPanel",
    requiredCapability: "hr.recruitment.read",
  },
  {
    href: "/hr?panel=candidatesPanel",
    icon: UsersRound,
    label: "Log Candidate",
    panelId: "candidatesPanel",
    requiredCapability: "hr.recruitment.read",
  },
  {
    href: "/hr?panel=candidateSearchPanel",
    icon: PackageSearch,
    label: "Search Candidate",
    panelId: "candidateSearchPanel",
    requiredCapability: "hr.recruitment.read",
  },
  {
    href: "/hr?panel=conversationLogsPanel",
    icon: MessageSquareText,
    label: "Conversation History",
    panelId: "conversationLogsPanel",
    requiredCapability: "hr.recruitment.read",
  },
  {
    href: "/hr?panel=interviewsPanel",
    icon: CalendarDays,
    label: "Interview Schedule",
    panelId: "interviewsPanel",
    requiredCapability: "hr.recruitment.read",
  },
  {
    href: "/hr?panel=interviewWorkspacePanel",
    icon: ClipboardList,
    label: "Interview Workspace",
    panelId: "interviewWorkspacePanel",
    requiredCapability: "hr.recruitment.read",
  },
] as const

export const administrationNavigation = [
  {
    href: "/administration/access",
    icon: ShieldCheck,
    label: "Access Administration",
  },
  {
    href: "/account/password",
    icon: KeyRound,
    label: "Password & Security",
  },
] as const
