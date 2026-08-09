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
  LayoutDashboard,
  ListChecks,
  ListTree,
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
  | "productionControlTab"
  | "jobCardStatusTab"
  | "machineDetailTab"
  | "machineMasterTab"
  | "masterGapsTab"
  | "masterTablesTab"
  | "dataEntryTab"
  | "planningHolidayTab"
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

export function dashboardTabHref(
  tab: DashboardTabId,
  productionFloorCode?: ProductionFloorCode
) {
  const params = new URLSearchParams({ tab })
  if (productionFloorCode) params.set("floor", productionFloorCode)
  return `/?${params.toString()}`
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
    href: dashboardTabHref("productionControlTab"),
    icon: ClipboardList,
    id: "productionControlTab",
    subtitle: "priority, route, dispatch",
    title: "Planner Actions",
  },
  {
    href: dashboardTabHref("jobCardStatusTab"),
    icon: PackageCheck,
    id: "jobCardStatusTab",
    subtitle: "running and completed",
    title: "Job Cards",
  },
  {
    href: dashboardTabHref("machineDetailTab"),
    icon: Factory,
    id: "machineDetailTab",
    subtitle: "setup planning",
    title: "Machine Detail",
  },
  {
    href: dashboardTabHref("machineMasterTab"),
    icon: Factory,
    id: "machineMasterTab",
    subtitle: "schedules and history",
    title: "Machine Master",
  },
  {
    href: dashboardTabHref("masterGapsTab"),
    icon: Database,
    id: "masterGapsTab",
    subtitle: "missing planning data",
    title: "Master Readiness",
  },
  {
    href: dashboardTabHref("masterTablesTab"),
    icon: Database,
    id: "masterTablesTab",
    subtitle: "search saved masters",
    title: "Master Tables",
  },
  {
    href: dashboardTabHref("dataEntryTab"),
    icon: ListChecks,
    id: "dataEntryTab",
    subtitle: "imports and manual entry",
    title: "Data Entry",
  },
  {
    href: dashboardTabHref("planningHolidayTab"),
    icon: CalendarDays,
    id: "planningHolidayTab",
    subtitle: "Friday shutdown, holidays",
    title: "Planning Holidays",
  },
  {
    href: dashboardTabHref("maintenanceTab"),
    icon: Settings2,
    id: "maintenanceTab",
    subtitle: "machine PM schedule",
    title: "Maintenance",
  },
  {
    href: dashboardTabHref("planningControlTab"),
    icon: Route,
    id: "planningControlTab",
    subtitle: "route and plan checks",
    title: "Planning Control",
  },
  {
    href: dashboardTabHref("shopFloorStatusTab"),
    icon: Factory,
    id: "shopFloorStatusTab",
    subtitle: "machine queue",
    title: "Shop Floor Status",
  },
  {
    href: dashboardTabHref("shopFloorTasksTab"),
    icon: PackageCheck,
    id: "shopFloorTasksTab",
    subtitle: "raw material at machine",
    title: "Shop Floor Tasks",
  },
  {
    href: dashboardTabHref("machinistTasksTab"),
    icon: Wrench,
    id: "machinistTasksTab",
    subtitle: "pre setting, setting, start",
    title: "Machinist",
  },
  {
    href: dashboardTabHref("qualityControlTasksTab"),
    icon: ShieldCheck,
    id: "qualityControlTasksTab",
    subtitle: "setup approvals",
    title: "Quality Control",
  },
  {
    href: dashboardTabHref("firstPieceInspectionTab"),
    icon: Gauge,
    id: "firstPieceInspectionTab",
    subtitle: "quality readings",
    title: "First Piece Inspection",
  },
  {
    href: dashboardTabHref("correctionsTab"),
    icon: Undo2,
    id: "correctionsTab",
    subtitle: "reverse wrong entries",
    title: "Corrections",
  },
]

export const commercialNavigation = [
  {
    href: "/commercial",
    icon: LayoutDashboard,
    label: "Commercial overview",
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
    href: "/commercial/masters",
    icon: ListTree,
    label: "Pricing masters",
  },
  {
    href: "/commercial/products",
    icon: PackageSearch,
    label: "Products",
  },
  {
    href: "/commercial/assemblies",
    icon: Boxes,
    label: "Assembly / BOM",
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
    label: "Product costing",
  },
  {
    href: "/commercial/quotes",
    icon: ScrollText,
    label: "Quote register",
  },
  {
    href: "/commercial/pricing",
    icon: TableProperties,
    label: "Pricing",
  },
  {
    href: "/commercial/orders",
    icon: ShoppingCart,
    label: "Purchase orders",
  },
  {
    href: "/commercial/revisions",
    icon: RefreshCcw,
    label: "Price revisions",
  },
  {
    href: "/commercial/corrections",
    icon: Undo2,
    label: "Corrections",
  },
] as const

export const hrNavigation = [
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
    label: "Conversation Logs",
    panelId: "conversationLogsPanel",
    requiredCapability: "hr.recruitment.read",
  },
  {
    href: "/hr?panel=interviewsPanel",
    icon: MessageSquareText,
    label: "Interviews",
    panelId: "interviewsPanel",
    requiredCapability: "hr.recruitment.read",
  },
] as const

export const administrationNavigation = [
  {
    href: "/administration/access",
    icon: ShieldCheck,
    label: "Access administration",
  },
] as const
