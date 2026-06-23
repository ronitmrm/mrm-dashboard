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

  it("does not plan waiting RM work orders on machines", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            jcNo: "JC-023",
            partCode: "M32",
            optionNumber: "1",
            orderPcs: 500,
          },
        },
        {
          entryType: "rm_inward",
          createdAt: "2026-06-23T01:00:00.000Z",
          payload: {
            jcNo: "JC-023",
            rmInwardDate: "",
            rmInwardKg: "",
            status: "",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M32",
            optionNumber: "1",
            setupNo: "1",
            machineUsed: "C5",
            machineType: "AUTOMATIC",
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M32",
            optionNumber: "1",
            setupNo: "1",
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
      ],
    });

    expect(snapshot.productionControl.workOrders[0]).toMatchObject({
      jcNo: "JC-023",
      partCode: "M32",
      rmStatus: "Waiting",
    });
    expect(snapshot.productionControl.machinePlanDetailRows.filter((row) => row.jcNo === "JC-023")).toEqual([]);
  });

  it("uses day-first RM inward dates for setup planned dates", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            jcNo: "JC-002",
            partCode: "M5",
            optionNumber: "1",
            orderPcs: 5000,
          },
        },
        {
          entryType: "rm_inward",
          createdAt: "2026-06-23T01:00:00.000Z",
          payload: {
            jcNo: "JC-002",
            rmInwardDate: "23/06/2026",
            rmInwardKg: 200,
            status: "",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M5",
            optionNumber: "1",
            setupNo: "1.1",
            machineUsed: "C5",
            machineType: "MANUAL",
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M5",
            optionNumber: "1",
            setupNo: "1.1",
            cycleTime: 12,
            loadingUnloading: 4,
          },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            machineNo: "C501",
            machineType: "MANUAL",
            status: "Active",
          },
        },
      ],
    });

    expect(snapshot.productionControl.workOrders[0]).toMatchObject({
      jcNo: "JC-002",
      rmStatus: "Received",
      rmInwardDate: "23/06/2026",
    });
    expect(snapshot.productionControl.machinePlanDetailRows[0]).toMatchObject({
      jcNo: "JC-002",
      setupNo: "1",
      setupPlannedDate: "23-June-26",
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

  it("marks setup complete only when job card, part, option, setup, and machine all match", () => {
    const baseDataEntries = [
      {
        entryType: "work_order",
        createdAt: "2026-06-23T00:00:00.000Z",
        payload: {
          jcNo: "JC-001",
          partCode: "M4",
          optionNumber: "1",
          orderPcs: 1000,
          rmInwardDate: "2026-06-23",
        },
      },
      {
        entryType: "route",
        createdAt: "2026-06-23T00:00:00.000Z",
        payload: {
          partNo: "M4",
          optionNumber: "1",
          setupNo: "1",
          machineUsed: "C5",
          machineType: "AUTOMATIC",
        },
      },
      {
        entryType: "cycle",
        createdAt: "2026-06-23T00:00:00.000Z",
        payload: {
          partNo: "M4",
          optionNumber: "1",
          setupNo: "1",
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
    ];

    const incompleteMatch = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        ...baseDataEntries,
        {
          entryType: "setup_checklist",
          createdAt: "2026-06-23T01:00:00.000Z",
          payload: {
            jcNo: "JC-001",
            partNo: "M4",
            setupNo: "1",
            machineNo: "C501",
          },
        },
      ],
    });
    expect(incompleteMatch.productionControl.machinePlanDetailRows[0]).toMatchObject({
      runningStatus: "Planned",
    });
    expect(incompleteMatch.productionControl.setupChecklistMismatchRows).toHaveLength(1);
    expect(incompleteMatch.productionControl.setupChecklistMismatchRows[0]).toMatchObject({
      jcNo: "JC-001",
      partCode: "M4",
      setupNo: "1",
      machine: "C501",
      missingFields: "Option number",
      status: "Needs planner review",
    });

    const strictMatch = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        ...baseDataEntries,
        {
          entryType: "setup_checklist",
          createdAt: "2026-06-23T01:00:00.000Z",
          payload: {
            jcNo: "JC-001",
            partNo: "M4",
            optionNumber: "1",
            setupNo: "1",
            machineNo: "C501",
          },
        },
      ],
    });
    expect(strictMatch.productionControl.machinePlanDetailRows[0]).toMatchObject({
      runningStatus: "Setup complete",
    });
    expect(strictMatch.productionControl.setupChecklistMismatchRows).toHaveLength(0);
  });

  it("matches setup checklist step number against option-prefixed route setup numbers", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            jcNo: "JC-001",
            partCode: "M4",
            optionNumber: "1",
            orderPcs: 1000,
            rmInwardDate: "2026-06-23",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M4",
            optionNumber: "1",
            setupNo: "1.1",
            machineUsed: "C5",
            machineType: "AUTOMATIC",
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M4",
            optionNumber: "1",
            setupNo: "1.1",
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
          entryType: "setup_checklist",
          createdAt: "2026-06-23T01:00:00.000Z",
          payload: {
            jcNo: "JC-001",
            partNo: "M4",
            optionNumber: "1",
            setupNo: "1",
            machineNo: "C501",
          },
        },
      ],
    });

    expect(snapshot.productionControl.machinePlanDetailRows[0]).toMatchObject({
      optionNumber: "1",
      setupNo: "1",
      routeSetupNo: "1.1",
      runningStatus: "Setup complete",
    });
    expect(snapshot.productionControl.setupChecklistMismatchRows).toHaveLength(0);
  });

  it("plans the next setup on a machine from the current job planned production end date", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            jcNo: "JC-001",
            partCode: "M4",
            optionNumber: "1",
            orderPcs: 2880,
            rmInwardDate: "2026-06-23",
          },
        },
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            jcNo: "JC-002",
            partCode: "M5",
            optionNumber: "1",
            orderPcs: 100,
            rmInwardDate: "2026-06-23",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M4",
            optionNumber: "1",
            setupNo: "1",
            machineUsed: "C5",
            machineType: "AUTOMATIC",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M5",
            optionNumber: "1",
            setupNo: "1",
            machineUsed: "C5",
            machineType: "AUTOMATIC",
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M4",
            optionNumber: "1",
            setupNo: "1",
            cycleTime: 10,
            loadingUnloading: 0,
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M5",
            optionNumber: "1",
            setupNo: "1",
            cycleTime: 10,
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
      ],
    });

    const c501Rows = snapshot.productionControl.machinePlanDetailRows.filter((row) => row.machine === "C501");
    expect(c501Rows).toHaveLength(2);
    expect(c501Rows[0]).toMatchObject({
      jcNo: "JC-001",
      plannedProductionEndDate: "24-June-26",
    });
    expect(c501Rows[1]).toMatchObject({
      jcNo: "JC-002",
      setupPlannedDate: "24-June-26",
    });
  });
});
