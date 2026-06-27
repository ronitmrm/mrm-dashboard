import { describe, expect, it } from "vitest";

import { shouldAutoRefreshPlanning } from "./planning-refresh-policy";

describe("shouldAutoRefreshPlanning", () => {
  it("auto-refreshes operational planning changes", () => {
    expect(shouldAutoRefreshPlanning("planner-priority")).toBe(true);
    expect(shouldAutoRefreshPlanning("mark-complete")).toBe(true);
    expect(shouldAutoRefreshPlanning("data-entry", { entryType: "software_raw" })).toBe(true);
    expect(shouldAutoRefreshPlanning("data-entry", { entryType: "shop_floor_status" })).toBe(true);
    expect(shouldAutoRefreshPlanning("data-entry", { entryType: "rm_inward" })).toBe(true);
  });

  it("leaves master and structural imports for manual recalculation", () => {
    expect(shouldAutoRefreshPlanning("data-entry", { entryType: "machine_master" })).toBe(false);
    expect(shouldAutoRefreshPlanning("data-entry", { entryType: "route" })).toBe(false);
    expect(shouldAutoRefreshPlanning("data-entry", { entryType: "cycle" })).toBe(false);
    expect(shouldAutoRefreshPlanning("data-import", { entryType: "work_order" })).toBe(false);
  });
});
