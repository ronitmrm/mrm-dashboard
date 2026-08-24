import type { PageAccessDefinition } from "./page-access-types"
import {
  productionFloors,
  type ProductionFloorCode,
} from "@workspace/db/production-floors"

import {
  isProductionFloorTab,
  productionFloorPageCapabilities,
  productionFloorPageSlugs,
} from "./production-floor-capabilities"
import type { DashboardTabId } from "../unified-navigation"
import { sidebarModuleLabels } from "../sidebar-module-labels"

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

export const productionPageLabels: Record<
  keyof typeof productionPageCapabilities,
  string
> = {
  dataEntryTab: "Data Entry",
  firstPieceInspectionTab: "First Piece Inspection",
  jobCardStatusTab: "Job Cards",
  machineDetailTab: "Machine Detail",
  machineMasterTab: "Machines",
  machinistTasksTab: "Machinist",
  maintenanceTab: "Mechanical Maintenance",
  masterGapsTab: "Part Readiness",
  masterTablesTab: "Master Table",
  operationalEntryTab: "Data Entry",
  operationalTablesTab: "Entry Tables",
  planningControlTab: "Planning Control",
  productionControlTab: "Planner Actions",
  productionDashboardTab: "Production Dashboard",
  productionSessionsTab: "Production Sessions",
  qualityControlTasksTab: "Quality Control",
  shopFloorStatusTab: "Shop Floor Status",
  shopFloorTasksTab: "Shop Floor Tasks",
}

const modules: Record<keyof typeof productionPageCapabilities, string> = {
  dataEntryTab: sidebarModuleLabels.masterData,
  firstPieceInspectionTab: sidebarModuleLabels.productionDashboard,
  jobCardStatusTab: sidebarModuleLabels.productionDashboard,
  machineDetailTab: sidebarModuleLabels.productionDashboard,
  machineMasterTab: sidebarModuleLabels.machines,
  machinistTasksTab: sidebarModuleLabels.productionDashboard,
  maintenanceTab: sidebarModuleLabels.mechanicalMaintenance,
  masterGapsTab: sidebarModuleLabels.productionDashboard,
  masterTablesTab: sidebarModuleLabels.masterData,
  operationalEntryTab: sidebarModuleLabels.operationalEntry,
  operationalTablesTab: sidebarModuleLabels.operationalEntry,
  planningControlTab: sidebarModuleLabels.productionDashboard,
  productionControlTab: sidebarModuleLabels.productionDashboard,
  productionDashboardTab: sidebarModuleLabels.productionDashboard,
  productionSessionsTab: sidebarModuleLabels.productionDashboard,
  qualityControlTasksTab: sidebarModuleLabels.productionDashboard,
  shopFloorStatusTab: sidebarModuleLabels.productionDashboard,
  shopFloorTasksTab: sidebarModuleLabels.productionDashboard,
}

const universalSubmodules: Partial<
  Record<keyof typeof productionPageCapabilities, string>
> = {
  dataEntryTab: "Master Selection",
  machineMasterTab: sidebarModuleLabels.machines,
  maintenanceTab: sidebarModuleLabels.mechanicalMaintenance,
  masterTablesTab: "Master Tables",
  operationalEntryTab: "Entry Selection",
  operationalTablesTab: "Entry Tables",
  productionDashboardTab: sidebarModuleLabels.productionDashboard,
}

const universalProductionPageAccess = Object.entries(productionPageCapabilities)
  .filter(([id]) => !(id in productionFloorPageSlugs))
  .map(([id, readPermissionKey]) => ({
    href: `/?tab=${id}`,
    id: `production.${id}`,
    label: productionPageLabels[id as keyof typeof productionPageLabels],
    module: modules[id as keyof typeof modules],
    navigation: true,
    readPermissionKey,
    submodule:
      universalSubmodules[id as keyof typeof universalSubmodules] ??
      productionPageLabels[id as keyof typeof productionPageLabels],
  }))

const floorProductionPageAccess = productionFloors.flatMap((floor) =>
  (
    Object.keys(productionFloorPageSlugs) as Array<
      keyof typeof productionFloorPageSlugs
    >
  ).map((id) => ({
    href: `/?tab=${id}&floor=${floor.code}`,
    id: `production.${floor.code}.${id}`,
    label: productionPageLabels[id],
    module: floor.label,
    navigation: true,
    readPermissionKey: productionFloorPageCapabilities[floor.code][id],
    submodule: productionPageLabels[id],
  }))
)

export const productionPageAccess = [
  ...universalProductionPageAccess,
  ...floorProductionPageAccess,
] satisfies PageAccessDefinition[]

export function productionCapabilityForTab(
  tab: DashboardTabId,
  floor?: ProductionFloorCode
) {
  if (floor && isProductionFloorTab(tab)) {
    return productionFloorPageCapabilities[floor][tab]
  }
  return productionPageCapabilities[
    tab as keyof typeof productionPageCapabilities
  ]
}
