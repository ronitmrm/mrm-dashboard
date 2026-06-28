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

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim();
}
