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

export function nextShopFloorStageId(stage: unknown, productionFloorCode: string) {
  const stages = ["raw_material_at_machine", "presetting", "setting", "quality_approval", "operator_started", "item_complete"]
  const current = stages.indexOf(normalizeShopFloorStage(stage))
  return stages.slice(current + 1).find((candidate) =>
    candidate !== "item_complete" && !(productionFloorCode === "cnc" && candidate === "presetting")
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

export function setupChecklistItemAppliesToPhase(
  section: unknown,
  phase: "end" | "start"
) {
  const normalizedSection = String(section ?? "")
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")

  const includesPreSetting = normalizedSection.includes("pre setting")
  const includesSetting = normalizedSection
    .replace("pre setting", "")
    .includes("setting")
  if (includesPreSetting && includesSetting) return true
  if (includesPreSetting) return phase === "start"
  if (includesSetting) return phase === "end"
  return true
}
