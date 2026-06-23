import { describe, expect, it } from "vitest";

import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis";

describe("buildLegacyDashboardSnapshot", () => {
  it("keeps planning data visible before production rows are imported", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            jcNo: "JC-001",
            partCode: "M100",
            optionNumber: "1",
            orderPcs: 500,
          },
        },
        {
          entryType: "rm_inward",
          createdAt: "2026-06-23T01:00:00.000Z",
          payload: {
            jcNo: "JC-001",
            rmInwardDate: "2026-06-23",
            rmInwardKg: 25,
            status: "Received",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M100",
            optionNumber: "1",
            setupNo: "10",
            machineUsed: "C5",
            machineType: "AUTOMATIC",
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M100",
            optionNumber: "1",
            setupNo: "10",
            cycleTime: 12,
            loadingUnloading: 4,
          },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            machineNo: "C501",
            machineType: "AUTOMATIC",
            status: "Active",
          },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            machineNo: "C502",
            machineType: "AUTOMATIC",
            status: "Active",
          },
        },
      ],
    });

    expect(snapshot.productionControl.workOrders).toHaveLength(1);
    expect(snapshot.productionControl.workOrders[0]).toMatchObject({
      jcNo: "JC-001",
      partCode: "M100",
      rmStatus: "Received",
      rmInwardDate: "2026-06-23",
      routeStatus: "Ready",
      cycleStatus: "Ready",
    });
    expect(snapshot.productionControl.machineConstraintRows).toEqual([]);
    expect(snapshot.productionControl.planOverrideRows).toEqual([]);
    const jcMachinePlans = snapshot.productionControl.machinePlanDetailRows.filter((row) => row.jcNo === "JC-001");
    expect(jcMachinePlans).toHaveLength(1);
    expect(jcMachinePlans[0]).toMatchObject({
      machine: "C501",
      routeMachine: "C5",
      machineAssignment: "Assigned physical machine",
    });
  });

  it("splits a setup across compatible machines only when the 25-day RM target is missed", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            jcNo: "JC-002",
            partCode: "M200",
            optionNumber: "1",
            orderPcs: 200,
            rmInwardDate: "2026-06-23",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M200",
            optionNumber: "1",
            setupNo: "10",
            machineUsed: "C5",
            machineType: "AUTOMATIC",
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M200",
            optionNumber: "1",
            setupNo: "10",
            cycleTime: 3600,
            loadingUnloading: 0,
          },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            machineNo: "C501",
            machineType: "AUTOMATIC",
            status: "Active",
          },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            machineNo: "C502",
            machineType: "AUTOMATIC",
            status: "Active",
          },
        },
      ],
    });

    const jcMachinePlans = snapshot.productionControl.machinePlanDetailRows.filter((row) => row.jcNo === "JC-002");
    expect(jcMachinePlans.map((row) => row.machine)).toEqual(["C501", "C502"]);
    expect(jcMachinePlans.every((row) => row.machineAssignment === "Parallel 25-day plan")).toBe(true);
  });
});
