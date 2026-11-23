import {
  parseProductionFloorCode,
  productionFloors,
  type ProductionFloorCode,
} from "@workspace/db/production-floors"

import {
  productionFloorPageSlugs,
  type ProductionFloorTabId,
} from "./production-floor-capabilities"

export const productionFloorTaskDefinitions = {
  order_acceptance: {
    label: "Save Draft / Calculate Machining Dates / Approve Reviewed Proposal",
    legacyCapability: "planning.order_acceptance.write",
    tab: "productionControlTab",
  },
  dispatch_approval: {
    label: "Dispatch Job Card",
    legacyCapability: "operations.dispatch.write",
    tab: "jobCardStatusTab",
  },
  first_piece_inspection: {
    label: "Quality approved / Save correction",
    legacyCapability: "quality.first_piece.write",
    tab: "firstPieceInspectionTab",
  },
  hourly_quality_check: {
    label: "Save Hourly Check / Save correction",
    legacyCapability: "quality.hourly.write",
    tab: "qualityControlTasksTab",
  },
  job_card_completion: {
    label: "Complete job-card setup",
    legacyCapability: "operations.shop_floor.write",
    tab: "jobCardStatusTab",
  },
  job_card_delivery_target: {
    label: "Save Target / Save Commitment",
    legacyCapability: "planning.override.write",
    tab: "jobCardStatusTab",
  },
  machine_constraint: {
    label: "Save And Replan Remaining Qty / Mark Available / Extend",
    legacyCapability: "planning.constraint.write",
    tab: "productionControlTab",
  },
  machinist_progress: {
    label: "Setting done / Start machine",
    legacyCapability: "operations.shop_floor.write",
    tab: "machinistTasksTab",
  },
  plan_override: {
    label: "Add Machine And Recalculate / Save Machine Switch / Release machine / Reopen to Planned / Accept short RM / Approve and Apply",
    legacyCapability: "planning.override.write",
    tab: "productionControlTab",
  },
  planner_priority: {
    label: "Apply priority / Approve and Apply",
    legacyCapability: "planning.priority.write",
    tab: "productionControlTab",
  },
  planner_recalculation: {
    label: "Recalculate Planning",
    legacyCapability: "planning.refresh.execute",
    tab: "productionControlTab",
  },
  raw_material_rejection: {
    label: "Save RM Rejection And Recalculate",
    legacyCapability: "planning.raw_material_rejection.write",
    tab: "productionControlTab",
  },
  planner_workflow_resolution: {
    label: "Close flag / Resolve workflow",
    legacyCapability: "operations.shop_floor.write",
    tab: "planningControlTab",
  },
  production_recording: {
    label: "Enter start details / End / Start downtime / Close downtime / Record accident / Rejection",
    legacyCapability: "operations.production.write",
    tab: "productionSessionsTab",
  },
  quality_approval: {
    label: "Quality approved",
    legacyCapability: "operations.shop_floor.write",
    tab: "qualityControlTasksTab",
  },
  route_change: {
    label: "Save Route Change Plan",
    legacyCapability: "planning.route_change.write",
    tab: "productionControlTab",
  },
  route_selection: {
    label: "Save Option / Save & Use Rework Route",
    legacyCapability: "operations.route_selection.write",
    tab: "planningControlTab",
  },
  setup_checklist: {
    label: "Save Draft / Save Completed Checklist",
    legacyCapability: "quality.setup_checklist.write",
    tab: "machinistTasksTab",
  },
  shop_floor_material: {
    label: "RM at machine / Save operators",
    legacyCapability: "operations.shop_floor.write",
    tab: "shopFloorTasksTab",
  },
} as const satisfies Record<
  string,
  {
    label: string
    legacyCapability: string
    tab: ProductionFloorTabId
  }
>

export type ProductionFloorTaskId = keyof typeof productionFloorTaskDefinitions

export const productionFloorTaskIds = Object.keys(
  productionFloorTaskDefinitions
) as ProductionFloorTaskId[]

export const productionFloorLegacyTaskCapabilities = new Set<string>(
  productionFloorTaskIds.map(
    (taskId) => productionFloorTaskDefinitions[taskId].legacyCapability
  )
)

export function productionFloorTaskCapability(
  floor: ProductionFloorCode,
  taskId: ProductionFloorTaskId
) {
  const definition = productionFloorTaskDefinitions[taskId]
  return `operations.floors.${floor}.${productionFloorPageSlugs[definition.tab]}.${taskId}.write`
}

export const productionFloorTaskCapabilities = Object.fromEntries(
  productionFloors.map((floor) => [
    floor.code,
    Object.fromEntries(
      productionFloorTaskIds.map((taskId) => [
        taskId,
        productionFloorTaskCapability(floor.code, taskId),
      ])
    ) as Record<ProductionFloorTaskId, string>,
  ])
) as Record<
  ProductionFloorCode,
  Record<ProductionFloorTaskId, string>
>

const directMutationTasks = {
  "dashboard-refresh": "planner_recalculation",
  "dispatch-approval": "dispatch_approval",
  "job-card-delivery-target": "job_card_delivery_target",
  "job-card-dispatch-commitment": "job_card_delivery_target",
  "machine-constraint": "machine_constraint",
  "machine-constraint-review": "machine_constraint",
  "mark-complete": "job_card_completion",
  "plan-override": "plan_override",
  "setup-reopen": "plan_override",
  "setup-release": "plan_override",
  "raw-material-short-accept": "plan_override",
  "production-session-efficiency-flag-close": "planner_workflow_resolution",
  "planner-priority": "planner_priority",
  "raw-material-rejection": "raw_material_rejection",
  reschedule: "planner_recalculation",
  "route-change": "route_change",
  "route-selection": "route_selection",
  "rework-route": "route_selection",
} as const satisfies Partial<Record<string, ProductionFloorTaskId>>

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function dataEntryTask(body: Record<string, unknown>) {
  const entryType = String(body.entryType ?? "")
  if (
    entryType === "production_card" ||
    entryType.startsWith("production_session_")
  ) {
    return "production_recording"
  }
  if (entryType === "first_piece_inspection_report") {
    return "first_piece_inspection"
  }
  if (entryType === "hourly_quality_check") return "hourly_quality_check"
  if (["setup_checklist", "setup_checklist_session"].includes(entryType)) {
    return "setup_checklist"
  }
  if (entryType !== "shop_floor_status") return null

  const payload = record(body.payload)
  if (String(payload.role ?? "").toLowerCase() === "planner") {
    return "planner_workflow_resolution"
  }
  switch (String(payload.stage ?? "")) {
    case "raw_material_at_machine":
      return "shop_floor_material"
    case "quality_approval":
      return "quality_approval"
    case "presetting":
    case "setting":
    case "operator_started":
      return "machinist_progress"
    default:
      return null
  }
}

export function productionFloorTaskForMutation(
  path: string,
  body: Record<string, unknown>
) {
  const taskId =
    directMutationTasks[path as keyof typeof directMutationTasks] ??
    (["data-entry", "data-import"].includes(path)
      ? dataEntryTask(body)
      : null)
  if (!taskId) return null

  const payload = record(body.payload)
  const floor = parseProductionFloorCode(
    body.productionFloorCode ?? body.floor ?? payload.productionFloorCode
  )
  const definition = productionFloorTaskDefinitions[taskId]
  return {
    capability: floor
      ? productionFloorTaskCapabilities[floor][taskId]
      : null,
    floor,
    legacyCapability: definition.legacyCapability,
    taskId,
  }
}

export function hasProductionFloorTaskCapability(
  granted: ReadonlySet<string>,
  path: string,
  body: Record<string, unknown>
) {
  const floorTask = productionFloorTaskForMutation(path, body)
  return (
    !floorTask ||
    (floorTask.capability !== null && granted.has(floorTask.capability))
  )
}
