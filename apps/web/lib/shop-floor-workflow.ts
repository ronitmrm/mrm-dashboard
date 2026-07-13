const stageAliases: Record<string, string> = {
  shop_floor_rm: "raw_material_at_machine",
  tools_drawing: "presetting",
  qc_approval: "quality_approval",
  worker_start: "operator_started",
};

export function normalizeShopFloorStage(stage: unknown) {
  const text = String(stage ?? "").trim();
  return stageAliases[text] ?? text;
}

export function shopFloorNoPendingActionLabel(stage: unknown) {
  const normalizedStage = normalizeShopFloorStage(stage);
  if (normalizedStage === "operator_started") return "Machine already started";
  if (normalizedStage === "item_complete") return "Item complete";
  return "No pending workflow task";
}