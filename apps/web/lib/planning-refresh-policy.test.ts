import { describe, expect, it } from "vitest";

import { planningRefreshStatusMessage, shouldQueuePlanningRefresh } from "./planning-refresh-policy";

describe("planning refresh policy", () => {
  it("queues recalculation for operational planning changes", () => {
    expect(shouldQueuePlanningRefresh("planner-priority")).toBe(true);
    expect(shouldQueuePlanningRefresh("mark-complete")).toBe(true);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "software_raw" })).toBe(true);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "shop_floor_status" })).toBe(true);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "rm_inward" })).toBe(true);
  });

  it("leaves master and structural imports for manual recalculation", () => {
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "machine_master" })).toBe(false);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "route" })).toBe(false);
    expect(shouldQueuePlanningRefresh("data-entry", { entryType: "cycle" })).toBe(false);
    expect(shouldQueuePlanningRefresh("data-import", { entryType: "work_order" })).toBe(false);
  });

  it("tells users whether recalculation was queued or left manual", () => {
    expect(planningRefreshStatusMessage(true)).toBe("Planning recalculation queued.");
    expect(planningRefreshStatusMessage(false)).toBe("Use Recalculate planning after master changes.");
  });
});
