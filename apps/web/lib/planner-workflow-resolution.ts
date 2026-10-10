import type { ProductionFloorCode } from "@workspace/db/production-floors"

export function plannerWorkflowResolutionPayload(
  row: Record<string, unknown>,
  productionFloorCode: ProductionFloorCode
) {
  return {
    productionFloorCode,
    jcNo: String(row.jcNo ?? ""),
    partCode: String(row.partCode ?? ""),
    optionNumber: String(row.optionNumber ?? ""),
    setupNo: String(row.setupNo ?? ""),
    setupName: String(row.setupName ?? ""),
    machine: String(row.machine ?? ""),
    machineType: String(row.machineType ?? ""),
    stage: "operator_started",
    stageLabel: "Operator assigned and machine started",
    role: "Planner",
    worker: row.shopFloorWorker === "-" ? "" : String(row.shopFloorWorker ?? ""),
    remark: "Resolved from raw production entry.",
    completedAt: new Date().toISOString(),
  }
}
