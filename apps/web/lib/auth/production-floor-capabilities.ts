import {
  productionFloors,
  type ProductionFloorCode,
} from "@workspace/db/production-floors"

import type { DashboardTabId } from "../unified-navigation"

export const productionFloorPageSlugs = {
  firstPieceInspectionTab: "first_piece_inspection",
  jobCardStatusTab: "job_cards",
  machineDetailTab: "machine_detail",
  machinistTasksTab: "machinist_tasks",
  masterGapsTab: "part_readiness",
  planningControlTab: "planning_control",
  productionControlTab: "planner_actions",
  productionSessionsTab: "production_sessions",
  qualityControlTasksTab: "quality_control_tasks",
  shopFloorStatusTab: "shop_floor_status",
  shopFloorTasksTab: "shop_floor_tasks",
} as const satisfies Partial<Record<DashboardTabId, string>>

export type ProductionFloorTabId = keyof typeof productionFloorPageSlugs

export function isProductionFloorTab(
  tab: DashboardTabId
): tab is ProductionFloorTabId {
  return tab in productionFloorPageSlugs
}

export function productionFloorPageCapability(
  floor: ProductionFloorCode,
  tab: ProductionFloorTabId
) {
  return `operations.floors.${floor}.${productionFloorPageSlugs[tab]}.read`
}

export const productionFloorPageCapabilities = Object.fromEntries(
  productionFloors.map((floor) => [
    floor.code,
    Object.fromEntries(
      (Object.keys(productionFloorPageSlugs) as ProductionFloorTabId[]).map(
        (tab) => [tab, productionFloorPageCapability(floor.code, tab)]
      )
    ) as Record<ProductionFloorTabId, string>,
  ])
) as Record<ProductionFloorCode, Record<ProductionFloorTabId, string>>

export function hasProductionFloorAccess(
  granted: ReadonlySet<string>,
  floor: ProductionFloorCode
) {
  return Object.values(productionFloorPageCapabilities[floor]).some((key) =>
    granted.has(key)
  )
}
