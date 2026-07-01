import { describe, expect, it } from "vitest";

import { priorityChangePlan, priorityPlanStepWindows } from "./priority-change-plan";

function row(overrides: Record<string, unknown>) {
  return {
    optionNumber: "1",
    setupPlannedDate: "5-July-26",
    plannedProductionStartDate: "5-July-26",
    plannedProductionEndDate: "5-July-26",
    runningStatus: "Planned",
    shopFloorStage: "",
    ...overrides,
  };
}

describe("priorityChangePlan", () => {
  it("keeps downstream setup preview behind the previous setup when setup 1 waits for a running machine", () => {
    const productionControl = {
      machinePlanDetailRows: [
        row({
          jcNo: "JC-M8",
          partCode: "M8",
          setupNo: "1",
          machine: "AC701",
          plannedProductionStartDate: "1-July-26",
          plannedProductionEndDate: "15-July-26",
          runningStatus: "Running",
          shopFloorStage: "operator_started",
        }),
        row({ jcNo: "JC-046", partCode: "M62", setupNo: "1", machine: "AC701" }),
        row({ jcNo: "JC-046", partCode: "M62", setupNo: "2", machine: "SA705" }),
        row({ jcNo: "JC-046", partCode: "M62", setupNo: "3", machine: "SA705" }),
      ],
    };

    const plan = priorityChangePlan(productionControl, "M62", "JC-046");
    const windows = priorityPlanStepWindows(plan.steps, {});

    expect(plan.steps.map((step) => [step.setupNo, step.machine])).toEqual([
      ["1", "AC701"],
      ["2", "SA705"],
      ["3", "SA705"],
    ]);
    expect(windows.get(plan.steps[0]!.key)).toMatchObject({ startDate: "16-July-26", endDate: "16-July-26" });
    expect(windows.get(plan.steps[1]!.key)?.startDate).toBe("17-July-26");
    expect(windows.get(plan.steps[2]!.key)?.startDate).toBe("18-July-26");
  });
});
