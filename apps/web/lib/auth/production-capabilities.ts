import type { PageAccessDefinition } from "./page-access-types"
import type { DashboardTabId } from "../unified-navigation"

export const productionPageCapabilities = {
  dataEntryTab: "operations.master_data_entry.read",
  firstPieceInspectionTab: "quality.first_piece_page.read",
  jobCardStatusTab: "operations.job_cards.read",
  machineDetailTab: "planning.machine_detail.read",
  machineMasterTab: "operations.machines.read",
  machinistTasksTab: "operations.machinist_tasks.read",
  maintenanceTab: "maintenance.workspace.read",
  masterGapsTab: "planning.part_readiness.read",
  masterTablesTab: "operations.master_tables.read",
  operationalEntryTab: "operations.operational_entry.read",
  operationalTablesTab: "operations.operational_entry.read",
  planningControlTab: "planning.control.read",
  productionControlTab: "planning.planner_actions.read",
  productionDashboardTab: "operations.production_dashboard.read",
  productionSessionsTab: "operations.production_sessions.read",
  qualityControlTasksTab: "quality.control_tasks.read",
  shopFloorStatusTab: "operations.shop_floor_status.read",
  shopFloorTasksTab: "operations.shop_floor_tasks.read",
} as const satisfies Partial<Record<DashboardTabId, string>>

const labels: Record<keyof typeof productionPageCapabilities, string> = {
  dataEntryTab: "Master Data Entry",
  firstPieceInspectionTab: "First Piece Inspection",
  jobCardStatusTab: "Job Cards",
  machineDetailTab: "Machine Detail",
  machineMasterTab: "Machines",
  machinistTasksTab: "Machinist Tasks",
  maintenanceTab: "Mechanical Maintenance",
  masterGapsTab: "Part Readiness",
  masterTablesTab: "Master Tables",
  operationalEntryTab: "Operational Entry",
  operationalTablesTab: "Operational Entry Master Tables",
  planningControlTab: "Planning Control",
  productionControlTab: "Planner Actions",
  productionDashboardTab: "Production Dashboard",
  productionSessionsTab: "Production Sessions",
  qualityControlTasksTab: "Quality Control Tasks",
  shopFloorStatusTab: "Shop Floor Status",
  shopFloorTasksTab: "Shop Floor Tasks",
}

export const productionPageAccess = Object.entries(
  productionPageCapabilities
).map(([id, readPermissionKey]) => ({
  href: `/?tab=${id}`,
  id: `production.${id}`,
  label: labels[id as keyof typeof labels],
  module: "Production",
  navigation: true,
  readPermissionKey,
})) satisfies PageAccessDefinition[]

export function productionCapabilityForTab(tab: DashboardTabId) {
  return productionPageCapabilities[
    tab as keyof typeof productionPageCapabilities
  ]
}
