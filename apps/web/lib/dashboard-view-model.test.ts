import { describe, expect, it } from "vitest";

import {
  dashboardCoverageFromState,
  dashboardPayloadFromState,
  dashboardPayloadForProductionFloor,
  dashboardRefreshStatusFromState,
  jobCardScheduleSummary,
  mergeDashboardStateResponse,
  toDashboardViewModel,
  universalProductionDashboardRows,
} from "./dashboard-view-model";

describe("dashboard state normalization", () => {
  it("retains the floor payload when only refresh status changed", () => {
    const merged = mergeDashboardStateResponse(
      {
        dashboard: {
          marker: "cnc-only",
          productionFloorCode: "cnc",
          readModelVersion: 42,
        },
        productionFloorCode: "cnc",
        status: { isRefreshing: true },
        version: 42,
      },
      {
        dashboard: null,
        notModified: true,
        productionFloorCode: "cnc",
        status: { isRefreshing: false },
        version: 42,
      },
      "cnc",
    );

    expect(dashboardPayloadFromState(merged)).toEqual({
      marker: "cnc-only",
      productionFloorCode: "cnc",
      readModelVersion: 42,
    });
    expect(dashboardRefreshStatusFromState(merged)).toEqual({
      isRefreshing: false,
    });
  });

  it("rejects unchanged, cross-floor, and regressive canonical responses", () => {
    const current = {
      dashboard: {
        marker: "cnc-current",
        productionFloorCode: "cnc",
        readModelVersion: 42,
      },
      productionFloorCode: "cnc",
      status: { status: "complete" },
      version: 42,
    };

    expect(() =>
      mergeDashboardStateResponse(undefined, {
        dashboard: null,
        notModified: true,
        productionFloorCode: "cnc",
        status: { status: "complete" },
        version: 42,
      }, "cnc"),
    ).toThrow(/retained same-floor payload/i);
    expect(() =>
      mergeDashboardStateResponse(current, {
        dashboard: { productionFloorCode: "forging", readModelVersion: 43 },
        notModified: false,
        productionFloorCode: "forging",
        status: { status: "complete" },
        version: 43,
      }, "cnc"),
    ).toThrow(/requested floor/i);
    expect(() =>
      mergeDashboardStateResponse(current, {
        dashboard: { productionFloorCode: "cnc", readModelVersion: 41 },
        notModified: false,
        productionFloorCode: "cnc",
        status: { status: "complete" },
        version: 41,
      }, "cnc"),
    ).toThrow(/regressive/i);
  });

  it("accepts a newer same-floor version with normalized typed coverage", () => {
    const coverage = {
      corrections: {
        available: 0,
        limit: 5_000,
        returned: 0,
        truncated: false,
        truncatedGroups: [],
      },
      dataEntries: {
        available: 1_001,
        groups: {
          machine_master: {
            available: 1_001,
            limit: 1_000,
            returned: 1_000,
            truncated: true,
          },
        },
        limit: 1_000,
        returned: 1_000,
        truncated: true,
        truncatedGroups: ["machine_master"],
      },
      physicalRows: {
        available: 0,
        groups: {},
        limit: 0,
        returned: 0,
        truncated: false,
        truncatedGroups: [],
      },
    };
    const merged = mergeDashboardStateResponse(
      {
        dashboard: { productionFloorCode: "cnc", readModelVersion: 42 },
        productionFloorCode: "cnc",
        version: 42,
      },
      {
        coverage,
        dashboard: {
          marker: "cnc-next",
          productionFloorCode: "cnc",
          readModelVersion: 43,
        },
        notModified: false,
        productionFloorCode: "cnc",
        status: { status: "complete" },
        version: 43,
      },
      "cnc",
    );

    expect(dashboardPayloadFromState(merged)).toMatchObject({
      marker: "cnc-next",
      readModelVersion: 43,
    });
    expect(dashboardCoverageFromState(merged)).toEqual(coverage);
  });
});

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
      label: "Total Output",
      value: "1,500",
      detail: "2,000 Target",
    });
    expect(view.metrics.find((metric) => metric.label === "Target")?.value).toBe("2,000");
    expect(view.metrics.find((metric) => metric.label === "Efficiency")?.value).toBe("75%");
    expect(view.metrics.find((metric) => metric.label === "Reject Pcs / Rate")?.value).toBe("30 | 2%");
    expect(view.metrics.find((metric) => metric.label === "Attendance")?.value).toBe("No Data");
    expect(view.trend).toHaveLength(2);
    expect(view.machines[0]!.label).toBe("CNC-1");
  });

  it("sorts dashboard date labels chronologically for job-card schedule summaries", () => {
    const summary = jobCardScheduleSummary(
      { deliveryDate: "15-August-26" },
      [
        { plannedProductionStartDate: "27-June-26", plannedProductionEndDate: "7-July-26" },
        { plannedProductionStartDate: "7-July-26", plannedProductionEndDate: "29-July-26" },
        { plannedProductionStartDate: "28-June-26", plannedProductionEndDate: "26-July-26" },
        { plannedProductionStartDate: "30-June-26", plannedProductionEndDate: "28-July-26" },
      ],
    );

    expect(summary.plannedStart).toBe("27-June-26");
    expect(summary.plannedEnd).toBe("29-July-26");
  });

  it("selects one isolated production-floor snapshot", () => {
    const selected = dashboardPayloadForProductionFloor(
      {
        productionFloorSnapshots: {
          conventional: { productionControl: { machineRows: [{ machine: "C1" }] } },
          cnc: { productionControl: { machineRows: [{ machine: "N1" }] } },
          forging: { productionControl: { machineRows: [{ machine: "F1" }] } },
        },
      },
      "cnc",
    );

    expect(selected.productionFloorCode).toBe("cnc");
    expect(selected.productionControl).toEqual({
      machineRows: [{ machine: "N1" }],
    });
  });

  it("does not retain every production-floor snapshot after selecting one floor", () => {
    const rows = Array.from({ length: 1_000 }, (_, index) => ({
      machine: `M-${index}`,
      output: index,
    }));
    const payload = {
      productionFloorSnapshots: {
        conventional: { productionControl: { machineRows: rows } },
        cnc: { productionControl: { machineRows: rows } },
        forging: { productionControl: { machineRows: rows } },
      },
    };

    const selected = dashboardPayloadForProductionFloor(payload, "cnc");

    expect(selected.productionFloorSnapshots).toBeUndefined();
    expect(JSON.stringify(selected).length).toBeLessThan(
      JSON.stringify(payload).length / 2,
    );
  });

  it("accepts a payload that the server already scoped to one floor", () => {
    const selected = dashboardPayloadForProductionFloor(
      {
        productionFloorCode: "forging",
        productionControl: { machineRows: [{ machine: "F1" }] },
      },
      "forging",
    );

    expect(selected.productionFloorCode).toBe("forging");
    expect(selected.productionControl).toEqual({
      machineRows: [{ machine: "F1" }],
    });
  });

  it("combines Production Dashboard rows from every production unit", () => {
    const rows = universalProductionDashboardRows([
      {
        productionFloorCode: "cnc",
        productionControl: {
          productionDashboardRows: [
            {
              jcNo: "JC-CNC",
              status: "Pending",
              currentProbableDispatchDate: "20-Aug-26",
            },
          ],
        },
      },
      {
        productionFloorCode: "conventional",
        productionControl: {
          productionDashboardRows: [
            {
              jcNo: "JC-CONV",
              status: "Pending",
              currentProbableDispatchDate: "18-Aug-26",
            },
          ],
        },
      },
      {
        productionFloorCode: "forging",
        productionControl: {
          productionDashboardRows: [
            {
              jcNo: "JC-FORGING",
              status: "Dispatched",
              currentProbableDispatchDate: "17-Aug-26",
            },
          ],
        },
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        jcNo: "JC-CONV",
        productionFloorCode: "conventional",
        productionUnit: "Conventional-01",
      }),
      expect.objectContaining({
        jcNo: "JC-CNC",
        productionFloorCode: "cnc",
        productionUnit: "CNC-01",
      }),
      expect.objectContaining({
        jcNo: "JC-FORGING",
        productionFloorCode: "forging",
        productionUnit: "Forging",
      }),
    ]);
  });
});
