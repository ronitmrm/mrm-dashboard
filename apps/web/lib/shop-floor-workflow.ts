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

export function shopFloorNoPendingActionLabel(stage: unknown) {
  const normalizedStage = normalizeShopFloorStage(stage);
  if (normalizedStage === "operator_started") return "Machine already started";
  if (normalizedStage === "item_complete") return "Item complete";
  return "No pending workflow task";
}
