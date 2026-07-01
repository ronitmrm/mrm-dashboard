const autoRefreshActionPaths = new Set([
  "planner-priority",
  "machine-constraint",
  "plan-override",
  "route-change",
  "route-selection",
  "mark-complete",
]);

const autoRefreshDataEntryTypes = new Set([
  "rm_inward",
  "software_raw",
]);

const autoRefreshShopFloorStages = new Set([
  "operator_started",
  "item_complete",
]);

const autoRefreshTargetTables = new Set([
  "productionEntries",
]);

export function shouldQueuePlanningRefresh(path: string, body: Record<string, unknown> = {}) {
  if (autoRefreshActionPaths.has(path)) return true;
  if (path === "data-entry" || path === "data-import") {
    return shouldQueueDataEntryPlanningRefresh(body);
  }
  if (path === "reverse-entry") {
    return autoRefreshTargetTables.has(text(body.targetTable)) || shouldQueueDataEntryPlanningRefresh(body);
  }
  return false;
}

export function planningRefreshStatusMessage(autoRefresh: boolean, path = "", body: Record<string, unknown> = {}) {
  if (autoRefresh) return "Planning recalculation queued.";
  if (isWorkflowProgressChange(path, body)) return "Planning recalculation not required for this workflow step.";
  return "Use Recalculate planning after master changes.";
}

export function shouldRefreshStalePlanningSnapshot(payload: unknown, now = new Date()) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  if (text(record.cacheStatus) === "missing") return true;
  if (text(record.cacheStatus) !== "ready") return false;

  const snapshotCacheDate = localDateKey(record.snapshotCacheUpdatedAt);
  const today = localDateKey(now);
  return Boolean(snapshotCacheDate && today && snapshotCacheDate < today);
}

function shouldQueueDataEntryPlanningRefresh(body: Record<string, unknown>) {
  const entryType = text(body.entryType);
  if (entryType === "shop_floor_status") {
    const payload = record(body.payload);
    return autoRefreshShopFloorStages.has(normalizeShopFloorStage(payload.stage ?? payload.shopFloorStage));
  }
  return autoRefreshDataEntryTypes.has(entryType);
}

function isWorkflowProgressChange(path: string, body: Record<string, unknown>) {
  if (path !== "data-entry" && path !== "reverse-entry") return false;
  const entryType = text(body.entryType);
  return entryType === "shop_floor_status" || entryType === "first_piece_inspection_report";
}

function normalizeShopFloorStage(value: unknown) {
  const stage = text(value).toLowerCase().replace(/\s+/g, "_");
  const aliases: Record<string, string> = {
    shop_floor_rm: "raw_material_at_machine",
    rawmaterialatmachine: "raw_material_at_machine",
    raw_material_at_machine: "raw_material_at_machine",
    tools_drawing: "presetting",
    presetting: "presetting",
    setting: "setting",
    qc_approval: "quality_approval",
    quality_approval: "quality_approval",
    worker_start: "operator_started",
    operator_started: "operator_started",
    item_complete: "item_complete",
  };
  return aliases[stage] ?? stage;
}

function record(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim();
}

function localDateKey(value: unknown) {
  const date = value instanceof Date ? value : new Date(text(value));
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
