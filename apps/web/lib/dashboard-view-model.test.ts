import { describe, expect, it } from "vitest";

import { toDashboardViewModel } from "./dashboard-view-model";

describe("toDashboardViewModel", () => {
  it("normalizes the legacy dashboard payload for the shadcn dashboard", () => {
    const view = toDashboardViewModel({
      workbook: "MRMPL.xlsx",
      updatedAt: "2026-06-22T09:00:00.000Z",
      summary: {
        totalOutput: 1500,
        totalTarget: 2000,
        totalReject: 30,
        activeMachines: 2,
        activeOperators: 3,
      },
      monthSeries: [
        { month: "Apr 2026", output: 600, target: 800, reject: 12 },
        { month: "May 2026", output: 900, target: 1200, reject: 18 },
      ],
      machineSummary: [
        { machine: "CNC-2", machineType: "Turning", output: 400, target: 500 },
        { machine: "CNC-1", machineType: "Turning", output: 700, target: 900 },
      ],
    });

    expect(view.workbook).toBe("MRMPL.xlsx");
    expect(view.metrics[0]).toMatchObject({
      label: "Total output",
      value: "1,500",
      detail: "2,000 target",
    });
    expect(view.metrics.find((metric) => metric.label === "Target")?.value).toBe("2,000");
    expect(view.metrics.find((metric) => metric.label === "Efficiency")?.value).toBe("75%");
    expect(view.metrics.find((metric) => metric.label === "Reject pcs / rate")?.value).toBe("30 | 2%");
    expect(view.metrics.find((metric) => metric.label === "Attendance")?.value).toBe("No data");
    expect(view.trend).toHaveLength(2);
    expect(view.machines[0]!.label).toBe("CNC-1");
  });
});
