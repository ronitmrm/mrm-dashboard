import { describe, expect, it } from "vitest";

import { buildDashboardSnapshot } from "./dashboard-domain";

describe("buildDashboardSnapshot", () => {
  it("aggregates production rows into the dashboard contract", () => {
    const snapshot = buildDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [
        {
          prodDate: "2026-04-10",
          operatorId: "OP-1",
          operatorName: "Asha",
          machineType: "CNC",
          machine: "CNC-01",
          partCode: "P-100",
          jobCard: "JC-1",
          setupNo: "10",
          outputQty: 80,
          actualQty: 82,
          targetQty: 100,
          rejectQty: 2,
          rejectionType: "Burr",
          downtimeMinutes: 15,
          downtimeReason: "Tool change",
        },
        {
          prodDate: "2026-04-11",
          operatorId: "OP-2",
          operatorName: "Bimal",
          machineType: "VMC",
          machine: "VMC-02",
          partCode: "P-200",
          jobCard: "JC-2",
          setupNo: "20",
          outputQty: 40,
          actualQty: 40,
          targetQty: 50,
          rejectQty: 0,
          downtimeMinutes: 0,
        },
        {
          prodDate: "2026-05-02",
          operatorId: "OP-1",
          operatorName: "Asha",
          machineType: "CNC",
          machine: "CNC-01",
          partCode: "P-100",
          jobCard: "JC-3",
          setupNo: "10",
          outputQty: 20,
          actualQty: 20,
          targetQty: 40,
          rejectQty: 1,
          rejectionType: "Scratch",
          downtimeMinutes: 30,
          downtimeReason: "Power",
        },
      ],
      attendanceRecords: [
        {
          operatorId: "OP-1",
          operatorName: "Asha",
          monthKey: "2026-04",
          workingDays: 25,
          presentDays: 24,
          score: 96,
        },
      ],
      trainingRecords: [
        {
          operatorId: "OP-2",
          operatorName: "Bimal",
          department: "Production",
          date: "2026-04-15",
          trainingType: "CNC Safety",
          reason: "New operator",
          trainer: "Supervisor",
          status: "Pending",
        },
      ],
      filters: {
        month: "2026-04",
      },
    });

    expect(snapshot.summary).toMatchObject({
      totalOutput: 120,
      totalTarget: 150,
      avgEfficiency: 0.8,
      rejectRate: 2 / 120,
      activeOperators: 2,
      pendingTraining: 1,
      attendanceScope: "Apr 2026",
    });
    expect(snapshot.operatorPerformance).toEqual([
      expect.objectContaining({
        operatorId: "OP-1",
        name: "Asha",
        output: 80,
        target: 100,
        reject: 2,
        efficiency: 0.8,
      }),
      expect.objectContaining({
        operatorId: "OP-2",
        name: "Bimal",
        output: 40,
        target: 50,
        reject: 0,
        efficiency: 0.8,
      }),
    ]);
    expect(snapshot.machineRows).toEqual([
      expect.objectContaining({
        machineType: "CNC",
        machine: "CNC-01",
        output: 80,
        target: 100,
        downtime: 15,
      }),
      expect.objectContaining({
        machineType: "VMC",
        machine: "VMC-02",
        output: 40,
        target: 50,
        downtime: 0,
      }),
    ]);
    expect(snapshot.monthSeries).toEqual([
      expect.objectContaining({
        monthKey: "2026-04",
        month: "Apr 2026",
        output: 120,
        target: 150,
        reject: 2,
        efficiency: 0.8,
        runs: 2,
      }),
    ]);
    expect(snapshot.daySeries).toEqual([
      expect.objectContaining({ dateKey: "2026-04-10", output: 80 }),
      expect.objectContaining({ dateKey: "2026-04-11", output: 40 }),
    ]);
    expect(snapshot.rejectHotspots).toEqual([
      expect.objectContaining({
        partCode: "P-100",
        reject: 2,
        output: 80,
      }),
    ]);
    expect(snapshot.filters.months).toEqual([
      { key: "2026-04", label: "Apr 2026" },
      { key: "2026-05", label: "May 2026" },
    ]);
  });
});
