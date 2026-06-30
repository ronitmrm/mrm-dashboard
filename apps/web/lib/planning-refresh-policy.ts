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
  "shop_floor_status",
  "first_piece_inspection_report",
  "software_raw",
]);

const autoRefreshTargetTables = new Set([
  "productionEntries",
]);

export function shouldQueuePlanningRefresh(path: string, body: Record<string, unknown> = {}) {
  if (autoRefreshActionPaths.has(path)) return true;
  if (path === "data-entry" || path === "data-import") {
    return autoRefreshDataEntryTypes.has(text(body.entryType));
  }
  if (path === "reverse-entry") {
    return autoRefreshTargetTables.has(text(body.targetTable)) || autoRefreshDataEntryTypes.has(text(body.entryType));
  }
  return false;
}

export function planningRefreshStatusMessage(autoRefresh: boolean) {
  return autoRefresh
    ? "Planning recalculation queued."
    : "Use Recalculate planning after master changes.";
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

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim();
}

function localDateKey(value: unknown) {
  const date = value instanceof Date ? value : new Date(text(value));
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
