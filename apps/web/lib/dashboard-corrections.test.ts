import { describe, expect, it } from "vitest";

import { activeCorrectionTargetKeys, latestUncorrectedRow } from "./dashboard-corrections";

describe("dashboard corrections", () => {
  it("marks only active correction actions as target blockers", () => {
    expect(activeCorrectionTargetKeys([
      { targetTable: "dataEntries", targetId: "a", action: "reverse" },
      { targetTable: "dataEntries", targetId: "b", action: "replace" },
      { targetTable: "routeChanges", targetId: "c", action: "close" },
      { targetTable: "dataEntries", targetId: "d", action: "note" },
    ])).toEqual(new Set(["dataEntries:a", "dataEntries:b", "routeChanges:c"]));
  });

  it("selects the latest data-entry row that was not corrected", () => {
    const correctionTargets = new Set(["dataEntries:newer"]);
    expect(latestUncorrectedRow([
      { _id: "older", createdAt: "2026-06-26T00:00:00.000Z" },
      { _id: "newer", createdAt: "2026-06-27T00:00:00.000Z" },
    ], "dataEntries", correctionTargets)).toEqual({
      _id: "older",
      createdAt: "2026-06-26T00:00:00.000Z",
    });
  });
});
