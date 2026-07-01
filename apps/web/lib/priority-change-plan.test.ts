import { describe, expect, it } from "vitest";

import { priorityChangePlan, priorityPlanQueueBeforeSetups, priorityPlanStepWindows } from "./priority-change-plan";

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

  it("lets the planner choose first, second, or current position on a downstream queue", () => {
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
        row({
          jcNo: "JC-077",
          partCode: "M108",
          setupNo: "2",
          machine: "SA705",
          plannedProductionStartDate: "5-July-26",
          plannedProductionEndDate: "25-July-26",
        }),
        row({
          jcNo: "JC-045",
          partCode: "M61",
          setupNo: "2",
          machine: "SA705",
          plannedProductionStartDate: "26-July-26",
          plannedProductionEndDate: "26-July-26",
        }),
        row({
          jcNo: "JC-046",
          partCode: "M62",
          setupNo: "2",
          machine: "SA705",
          plannedProductionStartDate: "27-July-26",
          plannedProductionEndDate: "27-July-26",
        }),
        row({
          jcNo: "JC-045",
          partCode: "M61",
          setupNo: "3",
          machine: "SA705",
          plannedProductionStartDate: "28-July-26",
          plannedProductionEndDate: "28-July-26",
        }),
        row({
          jcNo: "JC-046",
          partCode: "M62",
          setupNo: "3",
          machine: "SA705",
          plannedProductionStartDate: "29-July-26",
          plannedProductionEndDate: "29-July-26",
        }),
      ],
    };

    const plan = priorityChangePlan(productionControl, "M62", "JC-046");
    const setupTwo = plan.steps.find((step) => step.setupNo === "2")!;
    const setupThree = plan.steps.find((step) => step.setupNo === "3")!;
    const m108 = setupTwo.blockers.find((blocker) => blocker.itemCode === "M108")!;
    const m61SetupTwo = setupTwo.blockers.find((blocker) => blocker.itemCode === "M61" && blocker.setupNo === "2")!;
    const m61SetupThree = setupThree.blockers.find((blocker) => blocker.itemCode === "M61" && blocker.setupNo === "3")!;

    const firstPosition = priorityPlanStepWindows(plan.steps, {});
    const secondPosition = priorityPlanStepWindows(plan.steps, {}, { [setupTwo.key]: m108.key });
    const currentPosition = priorityPlanStepWindows(plan.steps, {}, {
      [setupTwo.key]: m61SetupTwo.key,
      [setupThree.key]: m61SetupThree.key,
    });

    expect(firstPosition.get(setupTwo.key)?.startDate).toBe("17-July-26");
    expect(secondPosition.get(setupTwo.key)?.startDate).toBe("26-July-26");
    expect(currentPosition.get(setupTwo.key)?.startDate).toBe("27-July-26");
    expect(currentPosition.get(setupThree.key)?.startDate).toBe("29-July-26");
    expect(priorityPlanQueueBeforeSetups(plan.steps, { [setupTwo.key]: m108.key })).toEqual([
      { targetSetupNo: "2", jcNo: "JC-077", setupNo: "2", machine: "SA705" },
    ]);
  });
});