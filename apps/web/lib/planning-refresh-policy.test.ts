import { describe, expect, it } from "vitest";
import { productionMasterTableEntryTypes } from "./production-master-tables";

import { planningRefreshStatusMessage, shouldQueuePlanningRefresh, shouldRefreshStalePlanningSnapshot, stalePlanningRefreshKey } from "./planning-refresh-policy";

describe("planning refresh policy", () => {
  it("queues recalculation for operational planning changes", () => {
    expect(shouldQueuePlanningRefresh("planner-priority")).toBe(true);
    expect(shouldQueuePlanningRefresh("raw-material-rejection")).toBe(true);
    expect(shouldQueuePlanningRefresh("work-order-cancellation")).toBe(true);
    expect(shouldQueuePlanningRefresh("mark-complete")).toBe(true);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "software_raw" })).toBe(true);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "production_session_start" })).toBe(true);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "production_session_close" })).toBe(true);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "shop_floor_status", payload: { stage: "operator_started" } })).toBe(true);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "shop_floor_status", payload: { stage: "item_complete" } })).toBe(true);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "rm_inward" })).toBe(true);
    expect(shouldQueuePlanningRefresh("reverse-entry", { targetTable: "machineConstraints" })).toBe(true);
    expect(shouldQueuePlanningRefresh("reverse-entry", { targetTable: "plannerPriorities" })).toBe(true);
    expect(shouldQueuePlanningRefresh("reverse-entry", { targetTable: "dataEntries", entryType: "shop_floor_status", payload: { stage: "operator_started" } })).toBe(true);
    expect(shouldQueuePlanningRefresh("reverse-entry", { targetTable: "dataEntries", entryType: "shop_floor_status", payload: { stage: "item_complete" } })).toBe(true);
    expect(shouldQueuePlanningRefresh("master-delete")).toBe(true);
  });

  it("does not recalculate for workflow progress that does not move planning dates", () => {
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "shop_floor_status", payload: { stage: "raw_material_at_machine" } })).toBe(false);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "shop_floor_status", payload: { stage: "presetting" } })).toBe(false);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "shop_floor_status", payload: { stage: "setting" } })).toBe(false);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "shop_floor_status", payload: { stage: "quality_approval" } })).toBe(false);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "first_piece_inspection_report" })).toBe(false);
    expect(shouldQueuePlanningRefresh("reverse-entry", { targetTable: "dataEntries", entryType: "shop_floor_status", payload: { stage: "quality_approval" } })).toBe(false);
    expect(shouldQueuePlanningRefresh("reverse-entry", { targetTable: "dataEntries", entryType: "first_piece_inspection_report" })).toBe(false);
  });

  it("automatically refreshes every production master save and upload", () => {
    for (const entryType of productionMasterTableEntryTypes) {
      expect(shouldQueuePlanningRefresh("data-entry", { entryType })).toBe(true);
      expect(shouldQueuePlanningRefresh("data-import", { entryType })).toBe(true);
      expect(planningRefreshStatusMessage(true, "data-import", { entryType })).toBe("Master table refresh queued.");
    }
    expect(shouldQueuePlanningRefresh("data-import", { entryType: "maintenance_master" })).toBe(true);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "maintenance_master" })).toBe(true);
    expect(shouldQueuePlanningRefresh("data-import", { entryType: "maintenance_checklist_master" })).toBe(true);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "maintenance_checklist_master" })).toBe(true);
    expect(shouldQueuePlanningRefresh("data-import", { entryType: "work_order" })).toBe(true);
  });

  it("tells users whether recalculation was queued, unnecessary, or left manual", () => {
    expect(planningRefreshStatusMessage(true)).toBe("Planning recalculation queued.");
    expect(planningRefreshStatusMessage(true, "data-entry", { entryType: "maintenance_master" })).toBe("Master table refresh queued.");
    expect(planningRefreshStatusMessage(true, "data-import", { entryType: "maintenance_checklist_master" })).toBe("Master table refresh queued.");
    expect(planningRefreshStatusMessage(false)).toBe("Use Recalculate planning after master changes.");
    expect(planningRefreshStatusMessage(false, "data-entry", {
      entryType: "shop_floor_status",
      payload: { stage: "raw_material_at_machine" },
    })).toBe("Planning recalculation not required for this workflow step.");
  });

  it("refreshes ready planning snapshots from an earlier calendar day", () => {
    expect(shouldRefreshStalePlanningSnapshot(
      { cacheStatus: "ready", snapshotCacheUpdatedAt: "2026-06-29T18:30:00" },
      new Date("2026-06-30T09:00:00"),
    )).toBe(true);
    expect(shouldRefreshStalePlanningSnapshot(
      { cacheStatus: "ready", snapshotCacheUpdatedAt: "2026-06-30T01:00:00" },
      new Date("2026-06-30T09:00:00"),
    )).toBe(false);
    expect(shouldRefreshStalePlanningSnapshot({ cacheStatus: "missing" })).toBe(true);
  });
  it("uses a stable stale-planning key that ignores ordinary snapshot updates", () => {
    const now = new Date("2026-06-30T09:00:00");

    expect(stalePlanningRefreshKey({
      cacheStatus: "ready",
      snapshotCacheUpdatedAt: "2026-06-29T18:30:00",
      updatedAt: "2026-06-30T08:00:00",
    }, now)).toBe("ready:2026-06-29");
    expect(stalePlanningRefreshKey({
      cacheStatus: "ready",
      snapshotCacheUpdatedAt: "2026-06-29T18:30:00",
      updatedAt: "2026-06-30T08:30:00",
    }, now)).toBe("ready:2026-06-29");
    expect(stalePlanningRefreshKey({
      cacheStatus: "ready",
      snapshotCacheUpdatedAt: "2026-06-30T01:00:00",
      updatedAt: "2026-06-30T08:30:00",
    }, now)).toBe("");
    expect(stalePlanningRefreshKey({ cacheStatus: "missing" }, now)).toBe("missing");
  });
});
