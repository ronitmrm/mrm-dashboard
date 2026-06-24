import { describe, expect, it } from "vitest";

import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis";

describe("buildLegacyDashboardSnapshot", () => {
  it("uses the latest canonical route row when old imports use option-prefixed setup numbers", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            jcNo: "JC-001",
            partCode: "M4",
            optionNumber: "1",
            orderPcs: 1000,
            rmInwardDate: "2026-06-24",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-17T00:00:00.000Z",
          payload: {
            partNo: "M4",
            optionNumber: 1,
            setupNo: 1.2,
            machineUsed: "D5",
            machineType: "MANUAL",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M4",
            optionNumber: "1",
            setupNo: "2",
            machineUsed: "D3",
            machineType: "MANUAL",
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-17T00:00:00.000Z",
          payload: {
            partNo: "M4",
            optionNumber: 1,
            setupNo: 1.2,
            cycleTime: 7,
            loadingUnloading: 9,
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M4",
            optionNumber: "1",
            setupNo: "2",
            cycleTime: 7,
            loadingUnloading: 25,
          },
        },
        {
          entryType: "tooling",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M4",
            optionNumber: "1",
            setupNo: "2",
            machineUsed: "D3",
            tooling: "G1",
          },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            machineNo: "D301",
            machineType: "MANUAL",
            status: "Active",
          },
        },
      ],
    });

    const productionControl = snapshot.productionControl as typeof snapshot.productionControl & {
      routeMasterRows: Array<Record<string, unknown>>;
      machinePlanDetailRows: Array<Record<string, unknown>>;
    };

    expect(productionControl.routeMasterRows).toContainEqual(expect.objectContaining({
      partNo: "M4",
      displaySetupNo: "2",
      machineUsed: "D3",
    }));
    expect(productionControl.routeMasterRows).not.toContainEqual(expect.objectContaining({
      partNo: "M4",
      displaySetupNo: "2",
      machineUsed: "D5",
    }));
    expect(productionControl.machinePlanDetailRows[0]).toMatchObject({
      jcNo: "JC-001",
      partCode: "M4",
      setupNo: "2",
      routeMachine: "D3",
      machine: "D301",
    });
  });

  it("counts WIP from the actual production machine before releasing the next setup", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [
        {
          prodDate: "2026-06-24",
          jobCard: "JC-001",
          partCode: "M4",
          setupNo: "1",
          machine: "C501",
          machineType: "AUTOMATIC",
          operatorId: "OP-1",
          outputQty: 1000,
          actualQty: 1000,
          targetQty: 0,
          rejectQty: 0,
        },
      ],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            jcNo: "JC-001",
            partCode: "M4",
            optionNumber: "1",
            orderPcs: 1000,
            rmInwardDate: "2026-06-24",
          },
        },
        ...[
          ["1", "C5", "AUTOMATIC"],
          ["2", "D3", "MANUAL"],
        ].map(([setupNo, machineUsed, machineType]) => ({
          entryType: "route",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M4",
            optionNumber: "1",
            setupNo,
            machineUsed,
            machineType,
          },
        })),
        ...[
          ["1", 28.8],
          ["2", 32],
        ].map(([setupNo, cycleTime]) => ({
          entryType: "cycle",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M4",
            optionNumber: "1",
            setupNo,
            cycleTime,
            loadingUnloading: 0,
          },
        })),
        {
          entryType: "tooling",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M4",
            optionNumber: "1",
            setupNo: "1",
            tooling: "T1",
          },
        },
        {
          entryType: "tooling",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M4",
            optionNumber: "1",
            setupNo: "2",
            tooling: "T2",
          },
        },
        ...[
          ["C501", "AUTOMATIC"],
          ["C502", "AUTOMATIC"],
          ["D301", "MANUAL"],
        ].map(([machineNo, machineType]) => ({
          entryType: "machine_master",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            machineNo,
            machineType,
            status: "Active",
          },
        })),
      ],
    });

    const setupOne = snapshot.productionControl.machinePlanDetailRows.find((row) => row.jcNo === "JC-001" && row.setupNo === "1");
    const setupTwo = snapshot.productionControl.machinePlanDetailRows.find((row) => row.jcNo === "JC-001" && row.setupNo === "2");

    expect(setupOne).toMatchObject({
      machine: "C501",
      rawActualQty: 1000,
      runningStatus: "Running",
      actualCompletionDate: "",
      actualProductionEndDate: "",
    });
    expect(setupTwo).toMatchObject({
      machine: "D301",
      shopFloorTaskReady: true,
      shopFloorTaskBlocker: "",
    });
  });

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

  it("marks setup complete only from matching shop floor workflow status", () => {
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
          entryType: "shop_floor_status",
          createdAt: "2026-06-23T01:00:00.000Z",
          payload: {
            jcNo: "JC-001",
            partNo: "M4",
            setupNo: "1",
            machineNo: "C501",
            stage: "setting",
          },
        },
      ],
    });
    expect(incompleteMatch.productionControl.machinePlanDetailRows[0]).toMatchObject({
      runningStatus: "Planned",
    });

    const strictMatch = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        ...baseDataEntries,
        {
          entryType: "shop_floor_status",
          createdAt: "2026-06-23T01:00:00.000Z",
          payload: {
            jcNo: "JC-001",
            partNo: "M4",
            optionNumber: "1",
            setupNo: "1",
            machineNo: "C501",
            stage: "setting",
            completedAt: "2026-06-23T01:00:00.000Z",
          },
        },
      ],
    });
    expect(strictMatch.productionControl.machinePlanDetailRows[0]).toMatchObject({
      runningStatus: "Setup complete",
    });
    expect(strictMatch.productionControl.setupChecklistMismatchRows).toHaveLength(0);
  });

  it("matches shop floor workflow step number against option-prefixed route setup numbers", () => {
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
          entryType: "shop_floor_status",
          createdAt: "2026-06-23T01:00:00.000Z",
          payload: {
            jcNo: "JC-001",
            partNo: "M4",
            optionNumber: "1",
            setupNo: "1",
            machineNo: "C501",
            stage: "setting",
            completedAt: "2026-06-23T01:00:00.000Z",
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

  it("does not plan a later setup before the previous setup can produce material", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            jcNo: "JC-003",
            partCode: "M6",
            optionNumber: "1",
            orderPcs: 2880,
            rmInwardDate: "2026-06-24",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M6",
            optionNumber: "1",
            setupNo: "1",
            machineUsed: "C501",
            machineType: "AUTOMATIC",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M6",
            optionNumber: "1",
            setupNo: "2",
            machineUsed: "C502",
            machineType: "AUTOMATIC",
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M6",
            optionNumber: "1",
            setupNo: "1",
            cycleTime: 30,
            loadingUnloading: 0,
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M6",
            optionNumber: "1",
            setupNo: "2",
            cycleTime: 10,
            loadingUnloading: 0,
          },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            machineNo: "C501",
            machineType: "AUTOMATIC",
            status: "Active",
          },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            machineNo: "C502",
            machineType: "AUTOMATIC",
            status: "Active",
          },
        },
      ],
    });

    const jcRows = snapshot.productionControl.machinePlanDetailRows.filter((row) => row.jcNo === "JC-003");
    expect(jcRows).toHaveLength(2);
    expect(jcRows.find((row) => row.setupNo === "1")).toMatchObject({
      setupPlannedDate: "24-June-26",
      plannedProductionStartDate: "24-June-26",
      plannedProductionEndDate: "26-June-26",
    });
    expect(jcRows.find((row) => row.setupNo === "2")).toMatchObject({
      setupPlannedDate: "26-June-26",
    });
  });

  it("moves a later setup when actual previous setup output is below cycle plan", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [
        {
          prodDate: "2026-06-24",
          operatorId: "OP-1",
          machineType: "AUTOMATIC",
          machine: "C501",
          partCode: "M6",
          jobCard: "JC-003",
          setupNo: "1",
          outputQty: 100,
          actualQty: 100,
          targetQty: 960,
          rejectQty: 0,
        },
      ],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            jcNo: "JC-003",
            partCode: "M6",
            optionNumber: "1",
            orderPcs: 2880,
            rmInwardDate: "2026-06-24",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M6",
            optionNumber: "1",
            setupNo: "1",
            machineUsed: "C501",
            machineType: "AUTOMATIC",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M6",
            optionNumber: "1",
            setupNo: "2",
            machineUsed: "C502",
            machineType: "AUTOMATIC",
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M6",
            optionNumber: "1",
            setupNo: "1",
            cycleTime: 30,
            loadingUnloading: 0,
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M6",
            optionNumber: "1",
            setupNo: "2",
            cycleTime: 10,
            loadingUnloading: 0,
          },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            machineNo: "C501",
            machineType: "AUTOMATIC",
            status: "Active",
          },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            machineNo: "C502",
            machineType: "AUTOMATIC",
            status: "Active",
          },
        },
      ],
    });

    expect(snapshot.productionControl.machinePlanDetailRows.find((row) => row.jcNo === "JC-003" && row.setupNo === "2")).toMatchObject({
      setupPlannedDate: "22-July-26",
    });
  });

  it("moves a ready setup ahead when an earlier machine slot is delayed by WIP shortage", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [
        {
          prodDate: "2026-06-30",
          operatorId: "OP-1",
          machineType: "AUTOMATIC",
          machine: "C500",
          partCode: "MA",
          jobCard: "JC-A",
          setupNo: "1",
          outputQty: 100,
          actualQty: 100,
          targetQty: 100,
          rejectQty: 0,
        },
      ],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-25T00:00:00.000Z",
          payload: {
            jcNo: "JC-A",
            partCode: "MA",
            optionNumber: "1",
            orderPcs: 1000,
            rmInwardDate: "2026-06-25",
          },
        },
        {
          entryType: "work_order",
          createdAt: "2026-06-25T00:00:00.000Z",
          payload: {
            jcNo: "JC-B",
            partCode: "MB",
            optionNumber: "1",
            orderPcs: 100,
            rmInwardDate: "2026-07-04",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-25T00:00:00.000Z",
          payload: {
            partNo: "MA",
            optionNumber: "1",
            setupNo: "1",
            machineUsed: "C500",
            machineType: "TURNING",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-25T00:00:00.000Z",
          payload: {
            partNo: "MA",
            optionNumber: "1",
            setupNo: "2",
            machineUsed: "C501",
            machineType: "GRINDING",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-25T00:00:00.000Z",
          payload: {
            partNo: "MB",
            optionNumber: "1",
            setupNo: "1",
            machineUsed: "C501",
            machineType: "GRINDING",
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-25T00:00:00.000Z",
          payload: {
            partNo: "MA",
            optionNumber: "1",
            setupNo: "1",
            cycleTime: 288,
            loadingUnloading: 0,
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-25T00:00:00.000Z",
          payload: {
            partNo: "MA",
            optionNumber: "1",
            setupNo: "2",
            cycleTime: 28.8,
            loadingUnloading: 0,
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-25T00:00:00.000Z",
          payload: {
            partNo: "MB",
            optionNumber: "1",
            setupNo: "1",
            cycleTime: 288,
            loadingUnloading: 0,
          },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-25T00:00:00.000Z",
          payload: {
            machineNo: "C500",
            machineType: "TURNING",
            status: "Active",
          },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-25T00:00:00.000Z",
          payload: {
            machineNo: "C501",
            machineType: "GRINDING",
            status: "Active",
          },
        },
      ],
    });

    const c501Rows = snapshot.productionControl.machinePlanDetailRows.filter((row) => row.machine === "C501");
    expect(c501Rows.find((row) => row.jcNo === "JC-B")).toMatchObject({
      setupPlannedDate: "4-July-26",
    });
    expect(c501Rows.find((row) => row.jcNo === "JC-A" && row.setupNo === "2")).toMatchObject({
      setupPlannedDate: "9-July-26",
    });
  });

  it("does not move a later setup ahead when its WIP buffer is still short", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [
        {
          prodDate: "2026-06-30",
          operatorId: "OP-1",
          machineType: "AUTOMATIC",
          machine: "C502",
          partCode: "MB",
          jobCard: "JC-B",
          setupNo: "1",
          outputQty: 100,
          actualQty: 100,
          targetQty: 100,
          rejectQty: 0,
        },
      ],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-25T00:00:00.000Z",
          payload: {
            jcNo: "JC-A",
            partCode: "MA",
            optionNumber: "1",
            orderPcs: 1000,
            rmInwardDate: "2026-06-25",
          },
        },
        {
          entryType: "work_order",
          createdAt: "2026-06-25T00:00:00.000Z",
          payload: {
            jcNo: "JC-B",
            partCode: "MB",
            optionNumber: "1",
            orderPcs: 1000,
            rmInwardDate: "2026-06-25",
          },
        },
        ...[
          ["MA", "1", "C500", "TURNING"],
          ["MA", "2", "C501", "GRINDING"],
          ["MB", "1", "C502", "TURNING"],
          ["MB", "2", "C501", "GRINDING"],
        ].map(([partNo, setupNo, machineUsed, machineType]) => ({
          entryType: "route",
          createdAt: "2026-06-25T00:00:00.000Z",
          payload: {
            partNo,
            optionNumber: "1",
            setupNo,
            machineUsed,
            machineType,
          },
        })),
        ...[
          ["MA", "1", 288],
          ["MA", "2", 28.8],
          ["MB", "1", 288],
          ["MB", "2", 28.8],
        ].map(([partNo, setupNo, cycleTime]) => ({
          entryType: "cycle",
          createdAt: "2026-06-25T00:00:00.000Z",
          payload: {
            partNo,
            optionNumber: "1",
            setupNo,
            cycleTime,
            loadingUnloading: 0,
          },
        })),
        ...[
          ["C500", "TURNING"],
          ["C501", "GRINDING"],
          ["C502", "TURNING"],
        ].map(([machineNo, machineType]) => ({
          entryType: "machine_master",
          createdAt: "2026-06-25T00:00:00.000Z",
          payload: {
            machineNo,
            machineType,
            status: "Active",
          },
        })),
      ],
    });

    const c501Rows = snapshot.productionControl.machinePlanDetailRows.filter((row) => row.machine === "C501");
    expect(c501Rows.find((row) => row.jcNo === "JC-A")).toMatchObject({
      setupPlannedDate: "4-July-26",
    });
    expect(c501Rows.find((row) => row.jcNo === "JC-B")).toMatchObject({
      setupPlannedDate: "9-July-26",
      shopFloorTaskReady: false,
      shopFloorTaskBlocker: "Previous setup WIP buffer is not ready",
    });
  });

  it("plans only planner-selected remaining setups after a mid-route change", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      routeChanges: [
        {
          target: "JC-004",
          newOption: "2",
          reason: "Route changed midway",
          remainingSetups: [
            { setupNo: "1", plan: false, quantity: 0 },
            { setupNo: "2", plan: true, quantity: 2500 },
            { setupNo: "3", plan: true, quantity: 5000 },
            { setupNo: "4", plan: true, quantity: 5000 },
          ],
          createdAt: "2026-06-24T00:00:00.000Z",
        },
      ],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            jcNo: "JC-004",
            partCode: "M7",
            optionNumber: "1",
            orderPcs: 5000,
            rmInwardDate: "2026-06-24",
          },
        },
        ...["1", "2", "3"].map((setupNo) => ({
          entryType: "route",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M7",
            optionNumber: "1",
            setupNo,
            machineUsed: `C50${setupNo}`,
            machineType: "AUTOMATIC",
          },
        })),
        ...["1", "2", "3", "4"].map((setupNo) => ({
          entryType: "route",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M7",
            optionNumber: "2",
            setupNo,
            machineUsed: `C50${setupNo}`,
            machineType: "AUTOMATIC",
          },
        })),
        ...["1", "2", "3", "4"].map((setupNo) => ({
          entryType: "cycle",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M7",
            optionNumber: "2",
            setupNo,
            cycleTime: 10,
            loadingUnloading: 0,
          },
        })),
        ...["1", "2", "3", "4"].map((setupNo) => ({
          entryType: "tooling",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M7",
            optionNumber: "2",
            setupNo,
            toolNo: `T-${setupNo}`,
          },
        })),
        ...["1", "2", "3", "4"].map((setupNo) => ({
          entryType: "machine_master",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            machineNo: `C50${setupNo}`,
            machineType: "AUTOMATIC",
            status: "Active",
          },
        })),
      ],
    });

    const jcRows = snapshot.productionControl.machinePlanDetailRows.filter((row) => row.jcNo === "JC-004");
    expect(jcRows.map((row) => row.setupNo)).toEqual(["2", "3", "4"]);
    expect(jcRows.map((row) => row.orderPcs)).toEqual([2500, 5000, 5000]);
    expect(snapshot.productionControl.workOrders[0]).toMatchObject({
      optionNumber: "2",
      optionSource: "Route change",
      routeStatus: "Route change plan",
    });
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
      plannedProductionEndDate: "23-June-26",
    });
    expect(c501Rows[1]).toMatchObject({
      jcNo: "JC-002",
      setupPlannedDate: "23-June-26",
    });
  });
});
