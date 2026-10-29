const stageAliases: Record<string, string> = {
  rawmaterialatmachine: "raw_material_at_machine",
  raw_material_at_machine: "raw_material_at_machine",
  shop_floor_rm: "raw_material_at_machine",
  presetting: "presetting",
  setting: "setting",
  tools_drawing: "presetting",
  quality_approval: "quality_approval",
  qc_approval: "quality_approval",
  operator_started: "operator_started",
  worker_start: "operator_started",
  item_complete: "item_complete",
};

export function normalizeShopFloorStage(stage: unknown) {
  const text = String(stage ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return stageAliases[text] ?? text;
}

const stages = [
  "raw_material_at_machine",
  "setting",
  "quality_approval",
  "operator_started",
  "item_complete",
] as const

export function shopFloorStageIdsForMachine(machineType: unknown) {
  const blasting = /\bblasting\s+machine\b/i.test(String(machineType ?? ""))
  return stages.filter(
    (stage) => stage !== "item_complete" &&
      (!blasting || stage === "raw_material_at_machine" || stage === "operator_started")
  )
}

export function nextShopFloorStageId(stage: unknown, machineType?: unknown) {
  const normalizedStage = normalizeShopFloorStage(stage)
  const current = stages.findIndex(
    (candidate) => candidate === (
      normalizedStage === "presetting" ? "raw_material_at_machine" : normalizedStage
    )
  )
  return shopFloorStageIdsForMachine(machineType).find(
    (candidate) => stages.indexOf(candidate) > current
  )
}

export function shopFloorNoPendingActionLabel(stage: unknown) {
  const normalizedStage = normalizeShopFloorStage(stage);
  if (normalizedStage === "operator_started") return "Machine already started";
  if (normalizedStage === "item_complete") return "Item complete";
  return "No pending workflow task";
}

export function shopFloorRowIsExplicitlyStopped(row: Record<string, unknown>) {
  return (
    normalizeShopFloorStage(row.shopFloorStage) === "planned" &&
    String(row.runningStatus ?? "").trim().toLowerCase() === "planner stopped"
  )
}

export function shopFloorRowIsProducedHistory(row: Record<string, unknown>) {
  return row.machineUnavailableSplitRole === "produced_on_unavailable_machine" &&
    Number(row.pendingGoodQty) === 0
}

export function shopFloorRowIsProductionCurrent(row: Record<string, unknown>) {
  const stage = normalizeShopFloorStage(row.shopFloorStage)
  if (stage) return stage === "operator_started"
  return (
    String(row.runningStatus ?? "").trim().toLowerCase() === "running" ||
    Number(row.rawRows) > 0 ||
    Number(row.rawOutputQty) > 0 ||
    Number(row.rawActualQty) > 0
  )
}

function rowText(row: Record<string, unknown>, keys: string[]) {
  return keys
    .map((key) => String(row[key] ?? "").trim().toLowerCase())
    .find(Boolean) ?? ""
}

export function openProductionSessionForShopFloorItem(
  sessions: Array<Record<string, unknown>>,
  item: Record<string, unknown>
) {
  const itemIdentity = {
    machine: rowText(item, ["machineNumber", "machineNo", "machine"]),
    job: rowText(item, ["jobCardNumber", "jobCard", "jcNo"]),
    part: rowText(item, ["partCode", "partNo", "itemCode"]),
    option: rowText(item, ["optionNumber", "optionNo"]),
    setup: rowText(item, ["setupNumber", "setupNo"]),
  }

  return sessions.find((session) =>
    rowText(session, ["status"]) === "open" &&
    rowText(session, ["machineNumber", "machineNo", "machine"]) === itemIdentity.machine &&
    rowText(session, ["jobCardNumber", "jobCard", "jcNo"]) === itemIdentity.job &&
    rowText(session, ["partCode", "partNo", "itemCode"]) === itemIdentity.part &&
    rowText(session, ["optionNumber", "optionNo"]) === itemIdentity.option &&
    rowText(session, ["setupNumber", "setupNo"]) === itemIdentity.setup
  )
}

export function productionSessionDetailHref(floor: string, sessionId: string) {
  return `/dashboard/production-sessions?${new URLSearchParams({
    floor,
    session: sessionId,
  }).toString()}`
}
