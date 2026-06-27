import { describe, expect, it } from "vitest";

import { priorityPlanWindow } from "./priority-plan-scenarios";

describe("priorityPlanWindow", () => {
  it("waits for running blockers when no running machine is stopped", () => {
    expect(priorityPlanWindow({
      targetStartDate: "30-June-26",
      targetEndDate: "1-July-26",
      blockers: [
        { key: "running", state: "running", startDate: "24-June-26", endDate: "28-June-26" },
        { key: "queued", state: "queued", startDate: "24-June-26", endDate: "25-June-26" },
      ],
    })).toEqual({
      startDate: "29-June-26",
      endDate: "30-June-26",
    });
  });

  it("pulls the target into the current slot when the running blocker is selected to stop", () => {
    expect(priorityPlanWindow({
      targetStartDate: "30-June-26",
      targetEndDate: "1-July-26",
      blockers: [
        { key: "running", state: "running", startDate: "24-June-26", endDate: "28-June-26" },
        { key: "queued", state: "queued", startDate: "26-June-26", endDate: "27-June-26" },
      ],
      preemptedBlockerKeys: new Set(["running"]),
    })).toEqual({
      startDate: "24-June-26",
      endDate: "25-June-26",
    });
  });

  it("only waits for running blockers that are not selected to stop", () => {
    expect(priorityPlanWindow({
      targetStartDate: "5-July-26",
      targetEndDate: "6-July-26",
      blockers: [
        { key: "stop", state: "running", startDate: "24-June-26", endDate: "28-June-26" },
        { key: "keep", state: "running", startDate: "29-June-26", endDate: "30-June-26" },
      ],
      preemptedBlockerKeys: new Set(["stop"]),
    })).toEqual({
      startDate: "1-July-26",
      endDate: "2-July-26",
    });
  });
});
