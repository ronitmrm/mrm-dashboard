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

  it("does not plan RM received work orders when route, cycle, or tooling is missing", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            jcNo: "JC-M28",
            partCode: "M28",
            optionNumber: "1",
            orderPcs: 500,
          },
        },
        {
          entryType: "rm_inward",
          createdAt: "2026-06-23T01:00:00.000Z",
          payload: {
            jcNo: "JC-M28",
            rmInwardDate: "2026-06-23",
            rmInwardKg: 50,
            status: "Received",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M28",
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
            partNo: "M28",
            optionNumber: "1",
            setupNo: "1",
            cycleTime: 12,
            loadingUnloading: 4,
          },
        },
        {
          entryType: "tooling",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "OTHER",
            optionNumber: "1",
            setupNo: "1",
            tooling: "T1",
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

    const productionControl = snapshot.productionControl as typeof snapshot.productionControl & {
      masterGaps: Array<Record<string, unknown>>;
    };

    expect(productionControl.masterGaps).toContainEqual(expect.objectContaining({
      jcNo: "JC-M28",
      partCode: "M28",
      toolingPlanMissing: true,
    }));
    expect(productionControl.machinePlanDetailRows.filter((row) => row.jcNo === "JC-M28")).toEqual([]);
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

  it("splits a setup across compatible machines when the 25-day target is missed and each machine gets at least 15 days", () => {
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
            orderPcs: 240,
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
    expect(jcMachinePlans.every((row) => row.orderPcs === 120)).toBe(true);
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
      setupPlannedDate: "27-June-26",
      shopFloorTaskReady: false,
      shopFloorTaskBlocker: expect.stringContaining("Previous setup WIP buffer is not ready"),
    });
  });

  it("does not release a setup before its planned date is due", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            jcNo: "SAD509",
            partCode: "M35",
            optionNumber: "1",
            orderPcs: 1000,
            rmInwardDate: "2099-07-01",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M35",
            optionNumber: "1",
            setupNo: "1",
            machineUsed: "C5",
            machineType: "AUTOMATIC",
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            partNo: "M35",
            optionNumber: "1",
            setupNo: "1",
            cycleTime: 30,
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
      ],
    });

    const setupOne = snapshot.productionControl.machinePlanDetailRows.find((row) => row.jcNo === "SAD509" && row.partCode === "M35" && row.setupNo === "1");

    expect(setupOne).toMatchObject({
      setupPlannedDate: "1-July-99",
      shopFloorTaskReady: false,
      shopFloorTaskBlocker: expect.stringContaining("Planned date not due until 1-July-99"),
    });
  });

  it("adds a buffer day before planning the next setup after WIP quantity is available", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-24T00:00:00.000Z",
          payload: {
            jcNo: "SAD508",
            partCode: "M34",
            optionNumber: "1",
            orderPcs: 10,
            rmInwardDate: "2026-06-29",
          },
        },
        ...[
          ["1", "C5", "AUTOMATIC", 1],
          ["2", "D3", "MANUAL", 30],
        ].flatMap(([setupNo, machineUsed, machineType, cycleTime]) => [
          {
            entryType: "route",
            createdAt: "2026-06-24T00:00:00.000Z",
            payload: {
              partNo: "M34",
              optionNumber: "1",
              setupNo,
              machineUsed,
              machineType,
            },
          },
          {
            entryType: "cycle",
            createdAt: "2026-06-24T00:00:00.000Z",
            payload: {
              partNo: "M34",
              optionNumber: "1",
              setupNo,
              cycleTime,
              loadingUnloading: 0,
            },
          },
        ]),
        ...[
          ["C501", "AUTOMATIC"],
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

    const setupOne = snapshot.productionControl.machinePlanDetailRows.find((row) => row.jcNo === "SAD508" && row.setupNo === "1");
    const setupTwo = snapshot.productionControl.machinePlanDetailRows.find((row) => row.jcNo === "SAD508" && row.setupNo === "2");

    expect(setupOne).toMatchObject({
      setupPlannedDate: "29-June-26",
    });
    expect(setupTwo).toMatchObject({
      setupPlannedDate: "30-June-26",
    });
  });

  it("does not occupy every eligible machine when a late setup still cannot meet the 25-day target", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            jcNo: "JC-001",
            partCode: "MLOAD",
            optionNumber: "1",
            orderPcs: 500000,
          },
        },
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:01:00.000Z",
          payload: {
            jcNo: "JC-002",
            partCode: "MLATE",
            optionNumber: "1",
            orderPcs: 10,
          },
        },
        ...["JC-001", "JC-002"].map((jcNo) => ({
          entryType: "rm_inward",
          createdAt: "2026-06-23T01:00:00.000Z",
          payload: {
            jcNo,
            rmInwardDate: "2026-06-23",
            rmInwardKg: 50,
            status: "Received",
          },
        })),
        ...["MLOAD", "MLATE"].flatMap((partNo) => [
          {
            entryType: "route",
            createdAt: "2026-06-23T00:00:00.000Z",
            payload: {
              partNo,
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
              partNo,
              optionNumber: "1",
              setupNo: "1",
              cycleTime: 10,
              loadingUnloading: 0,
            },
          },
        ]),
        ...["C501", "C502"].map((machineNo) => ({
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            machineNo,
            machineType: "AUTOMATIC",
            status: "Active",
          },
        })),
      ],
    });

    const lateRows = snapshot.productionControl.machinePlanDetailRows.filter((row) => row.jcNo === "JC-002");

    expect(lateRows).toHaveLength(1);
    expect(lateRows[0]).toMatchObject({
      partCode: "MLATE",
      parallelMachineCount: 1,
    });
  });

  it("keeps a setup on one machine when splitting would give each machine less than 15 production days", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            jcNo: "JC-029D",
            partCode: "M29D",
            optionNumber: "1",
            orderPcs: 29,
            rmInwardDate: "2026-06-23",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M29D",
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
            partNo: "M29D",
            optionNumber: "1",
            setupNo: "1",
            cycleTime: 28800,
            loadingUnloading: 0,
          },
        },
        ...["C501", "C502"].map((machineNo) => ({
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            machineNo,
            machineType: "AUTOMATIC",
            status: "Active",
          },
        })),
      ],
    });

    const rows = snapshot.productionControl.machinePlanDetailRows.filter((row) => row.jcNo === "JC-029D");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      orderPcs: 29,
      parallelMachineCount: 1,
    });
  });

  it("splits a 30-day setup into two machines with at least 15 production days per machine", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            jcNo: "JC-030D",
            partCode: "M30D",
            optionNumber: "1",
            orderPcs: 30,
            rmInwardDate: "2026-06-23",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M30D",
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
            partNo: "M30D",
            optionNumber: "1",
            setupNo: "1",
            cycleTime: 28800,
            loadingUnloading: 0,
          },
        },
        ...["C501", "C502"].map((machineNo) => ({
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            machineNo,
            machineType: "AUTOMATIC",
            status: "Active",
          },
        })),
      ],
    });

    const rows = snapshot.productionControl.machinePlanDetailRows.filter((row) => row.jcNo === "JC-030D");

    expect(rows).toHaveLength(2);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        orderPcs: 15,
        totalOrderPcs: 30,
        parallelMachineCount: 2,
      }),
    ]));
  });

  it("prefers lower-utilized compatible machines before reusing a loaded family machine", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            jcNo: "JC-LOAD-A",
            partCode: "MLOADA",
            optionNumber: "1",
            orderPcs: 10,
            rmInwardDate: "2026-06-23",
          },
        },
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:01:00.000Z",
          payload: {
            jcNo: "JC-LOAD-B",
            partCode: "MLOADB",
            optionNumber: "1",
            orderPcs: 10,
            rmInwardDate: "2026-06-23",
          },
        },
        ...["MLOADA", "MLOADB"].flatMap((partNo) => [
          {
            entryType: "route",
            createdAt: "2026-06-23T00:00:00.000Z",
            payload: {
              partNo,
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
              partNo,
              optionNumber: "1",
              setupNo: "1",
              cycleTime: 2880,
              loadingUnloading: 0,
            },
          },
        ]),
        ...["C501", "C502"].map((machineNo) => ({
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            machineNo,
            machineType: "AUTOMATIC",
            status: "Active",
          },
        })),
      ],
    });

    const first = snapshot.productionControl.machinePlanDetailRows.find((row) => row.jcNo === "JC-LOAD-A");
    const second = snapshot.productionControl.machinePlanDetailRows.find((row) => row.jcNo === "JC-LOAD-B");

    expect(first).toMatchObject({ machine: "C501" });
    expect(second).toMatchObject({ machine: "C502" });
  });

  it("uses planner priority to schedule a selected job card before normal priority work", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      plannerPriorities: [
        {
          target: "JC-043",
          jcNo: "JC-043",
          partCode: "M43",
          priority: "High",
          remark: "Customer urgent",
          createdAt: "2026-06-23T01:00:00.000Z",
        },
      ],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            jcNo: "JC-042",
            partCode: "M42",
            optionNumber: "1",
            orderPcs: 10,
            rmInwardDate: "2026-06-23",
          },
        },
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:01:00.000Z",
          payload: {
            jcNo: "JC-043",
            partCode: "M43",
            optionNumber: "1",
            orderPcs: 10,
            rmInwardDate: "2026-06-23",
          },
        },
        ...["M42", "M43"].flatMap((partNo) => [
          {
            entryType: "route",
            createdAt: "2026-06-23T00:00:00.000Z",
            payload: {
              partNo,
              optionNumber: "1",
              setupNo: "1",
              machineUsed: "C501",
              machineType: "AUTOMATIC",
            },
          },
          {
            entryType: "cycle",
            createdAt: "2026-06-23T00:00:00.000Z",
            payload: {
              partNo,
              optionNumber: "1",
              setupNo: "1",
              cycleTime: 1,
              loadingUnloading: 0,
            },
          },
        ]),
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

    const m42 = snapshot.productionControl.machinePlanDetailRows.find((row) => row.jcNo === "JC-042");
    const m43 = snapshot.productionControl.machinePlanDetailRows.find((row) => row.jcNo === "JC-043");

    expect(m43).toMatchObject({
      plannerPriority: "High",
      setupPlannedDate: "23-June-26",
    });
    expect(m42).toMatchObject({
      plannerPriority: "Normal",
      setupPlannedDate: "24-June-26",
    });
  });

  it("keeps priority behind a setup task that already started without planner approval", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      plannerPriorities: [
        {
          target: "JC-043",
          jcNo: "JC-043",
          partCode: "M43",
          priority: "High",
          createdAt: "2026-06-23T01:00:00.000Z",
        },
      ],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { jcNo: "JC-042", partCode: "M42", optionNumber: "1", orderPcs: 10, rmInwardDate: "2026-06-23" },
        },
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:01:00.000Z",
          payload: { jcNo: "JC-043", partCode: "M43", optionNumber: "1", orderPcs: 10, rmInwardDate: "2026-06-23" },
        },
        ...["M42", "M43"].flatMap((partNo) => [
          {
            entryType: "route",
            createdAt: "2026-06-23T00:00:00.000Z",
            payload: { partNo, optionNumber: "1", setupNo: "1", machineUsed: "C501", machineType: "AUTOMATIC" },
          },
          {
            entryType: "cycle",
            createdAt: "2026-06-23T00:00:00.000Z",
            payload: { partNo, optionNumber: "1", setupNo: "1", cycleTime: 1, loadingUnloading: 0 },
          },
        ]),
        {
          entryType: "shop_floor_status",
          createdAt: "2026-06-23T00:30:00.000Z",
          payload: { jcNo: "JC-042", partNo: "M42", optionNumber: "1", setupNo: "1", machineNo: "C501", stage: "setting", completedAt: "2026-06-23T00:30:00.000Z" },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { machineNo: "C501", machineType: "AUTOMATIC", status: "Active" },
        },
      ],
    });

    const started = snapshot.productionControl.machinePlanDetailRows.find((row) => row.jcNo === "JC-042");
    const priority = snapshot.productionControl.machinePlanDetailRows.find((row) => row.jcNo === "JC-043");

    expect(started).toMatchObject({ runningStatus: "Setup complete", setupPlannedDate: "23-June-26" });
    expect(priority).toMatchObject({ plannerPriority: "High", setupPlannedDate: "24-June-26" });
  });

  it("moves priority ahead of a started setup task when planner approves non-running queue change", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      plannerPriorities: [
        {
          target: "JC-043",
          jcNo: "JC-043",
          partCode: "M43",
          priority: "High",
          approvalMode: "allow_started_not_running",
          createdAt: "2026-06-23T01:00:00.000Z",
        },
      ],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { jcNo: "JC-042", partCode: "M42", optionNumber: "1", orderPcs: 10, rmInwardDate: "2026-06-23" },
        },
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:01:00.000Z",
          payload: { jcNo: "JC-043", partCode: "M43", optionNumber: "1", orderPcs: 10, rmInwardDate: "2026-06-23" },
        },
        ...["M42", "M43"].flatMap((partNo) => [
          {
            entryType: "route",
            createdAt: "2026-06-23T00:00:00.000Z",
            payload: { partNo, optionNumber: "1", setupNo: "1", machineUsed: "C501", machineType: "AUTOMATIC" },
          },
          {
            entryType: "cycle",
            createdAt: "2026-06-23T00:00:00.000Z",
            payload: { partNo, optionNumber: "1", setupNo: "1", cycleTime: 1, loadingUnloading: 0 },
          },
        ]),
        {
          entryType: "shop_floor_status",
          createdAt: "2026-06-23T00:30:00.000Z",
          payload: { jcNo: "JC-042", partNo: "M42", optionNumber: "1", setupNo: "1", machineNo: "C501", stage: "setting", completedAt: "2026-06-23T00:30:00.000Z" },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { machineNo: "C501", machineType: "AUTOMATIC", status: "Active" },
        },
      ],
    });

    const started = snapshot.productionControl.machinePlanDetailRows.find((row) => row.jcNo === "JC-042");
    const priority = snapshot.productionControl.machinePlanDetailRows.find((row) => row.jcNo === "JC-043");

    expect(priority).toMatchObject({ plannerPriority: "High", setupPlannedDate: "23-June-26" });
    expect(started).toMatchObject({ runningStatus: "Setup complete", setupPlannedDate: "24-June-26" });
  });

  it("recomputes downstream setup readiness when an earlier setup is pulled into an idle machine gap", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { jcNo: "JC-001", partCode: "M-BLOCK", optionNumber: "1", orderPcs: 1000, rmInwardDate: "2026-06-24" },
        },
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:01:00.000Z",
          payload: { jcNo: "JC-087", partCode: "M124", optionNumber: "1", orderPcs: 1000, rmInwardDate: "2026-06-24" },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { partNo: "M-BLOCK", optionNumber: "1", setupNo: "1.1", machineUsed: "A5", machineType: "AUTOMATIC" },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { partNo: "M-BLOCK", optionNumber: "1", setupNo: "1.1", cycleTime: 288, loadingUnloading: 0 },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { partNo: "M-BLOCK", optionNumber: "1", setupNo: "1.2", machineUsed: "C5", machineType: "AUTOMATIC" },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { partNo: "M-BLOCK", optionNumber: "1", setupNo: "1.2", cycleTime: 50, loadingUnloading: 0 },
        },
        ...["1.1", "1.2"].flatMap((setupNo) => [
          {
            entryType: "route",
            createdAt: "2026-06-23T00:00:00.000Z",
            payload: { partNo: "M124", optionNumber: "1", setupNo, machineUsed: "C5", machineType: "AUTOMATIC" },
          },
          {
            entryType: "cycle",
            createdAt: "2026-06-23T00:00:00.000Z",
            payload: { partNo: "M124", optionNumber: "1", setupNo, cycleTime: 25, loadingUnloading: 0 },
          },
        ]),
        {
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { machineNo: "A501", machineType: "AUTOMATIC", status: "Active" },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { machineNo: "C501", machineType: "AUTOMATIC", status: "Active" },
        },
      ],
    });

    const targetRows = snapshot.productionControl.machinePlanDetailRows
      .filter((row) => row.jcNo === "JC-087")
      .sort((a, b) => String(a.setupNo).localeCompare(String(b.setupNo), undefined, { numeric: true }));
    const blockerSetupTwo = snapshot.productionControl.machinePlanDetailRows.find((row) => row.jcNo === "JC-001" && row.setupNo === "2");

    expect(targetRows).toMatchObject([
      { machine: "C501", setupNo: "1", setupPlannedDate: "24-June-26", plannedProductionEndDate: "24-June-26" },
      { machine: "C501", setupNo: "2", setupPlannedDate: "25-June-26", plannedProductionEndDate: "25-June-26" },
    ]);
    expect(blockerSetupTwo).toMatchObject({ machine: "C501", setupPlannedDate: "4-July-26" });
  });

  it("moves planned work to an idle physical machine in the same family when it fits before the next queued job", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { jcNo: "JC-001", partCode: "M-SLOW", optionNumber: "1", orderPcs: 1000, rmInwardDate: "2026-06-24" },
        },
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:01:00.000Z",
          payload: { jcNo: "JC-002", partCode: "M-C502", optionNumber: "1", orderPcs: 1000, rmInwardDate: "2026-06-24" },
        },
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:02:00.000Z",
          payload: { jcNo: "JC-003", partCode: "M-FIT", optionNumber: "1", orderPcs: 1000, rmInwardDate: "2026-06-24" },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { partNo: "M-SLOW", optionNumber: "1", setupNo: "1.1", machineUsed: "A5", machineType: "AUTOMATIC" },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { partNo: "M-SLOW", optionNumber: "1", setupNo: "1.1", cycleTime: 576, loadingUnloading: 0 },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { partNo: "M-SLOW", optionNumber: "1", setupNo: "1.2", machineUsed: "C5", machineType: "AUTOMATIC" },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { partNo: "M-SLOW", optionNumber: "1", setupNo: "1.2", cycleTime: 288, loadingUnloading: 0 },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { partNo: "M-C502", optionNumber: "1", setupNo: "1.1", machineUsed: "C5", machineType: "AUTOMATIC" },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { partNo: "M-C502", optionNumber: "1", setupNo: "1.1", cycleTime: 288, loadingUnloading: 0 },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { partNo: "M-FIT", optionNumber: "1", setupNo: "1.1", machineUsed: "C5", machineType: "AUTOMATIC" },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { partNo: "M-FIT", optionNumber: "1", setupNo: "1.1", cycleTime: 25, loadingUnloading: 0 },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { machineNo: "A501", machineType: "AUTOMATIC", status: "Active" },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { machineNo: "C501", machineType: "AUTOMATIC", status: "Active" },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: { machineNo: "C502", machineType: "AUTOMATIC", status: "Active" },
        },
      ],
    });

    const fitRow = snapshot.productionControl.machinePlanDetailRows.find((row) => row.jcNo === "JC-003");

    expect(fitRow).toMatchObject({
      machine: "C501",
      machineAssignment: "Family idle gap balance",
      familyIdleGapFromMachine: "C502",
      setupPlannedDate: "24-June-26",
      plannedProductionEndDate: "24-June-26",
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
      setupPlannedDate: "23-July-26",
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
      setupPlannedDate: "10-July-26",
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
      setupPlannedDate: "5-July-26",
    });
    expect(c501Rows.find((row) => row.jcNo === "JC-B")).toMatchObject({
      setupPlannedDate: "10-July-26",
      shopFloorTaskReady: false,
      shopFloorTaskBlocker: expect.stringContaining("Previous setup WIP buffer is not ready"),
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
      setupPlannedDate: "24-June-26",
    });
  });

  it("deduplicates repeated quality approval and first-piece report saves for the same setup", () => {
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            jcNo: "JC-FPI",
            partCode: "M-FPI",
            optionNumber: "1",
            orderPcs: 100,
            rmInwardDate: "2026-06-23",
          },
        },
        {
          entryType: "route",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M-FPI",
            optionNumber: "1",
            setupNo: "1",
            machineUsed: "C901",
            machineType: "AUTOMATIC",
          },
        },
        {
          entryType: "cycle",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M-FPI",
            optionNumber: "1",
            setupNo: "1",
            cycleTime: 10,
            loadingUnloading: 0,
          },
        },
        {
          entryType: "tooling",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            partNo: "M-FPI",
            optionNumber: "1",
            setupNo: "1",
            toolNo: "T-FPI",
          },
        },
        {
          entryType: "machine_master",
          createdAt: "2026-06-23T00:00:00.000Z",
          payload: {
            machineNo: "C901",
            machineType: "AUTOMATIC",
            status: "Active",
          },
        },
        {
          _id: "status-old",
          entryType: "shop_floor_status",
          key: "jc-fpi|m-fpi|1|1|c901",
          createdAt: "2026-06-24T10:00:00.000Z",
          payload: {
            jcNo: "JC-FPI",
            partCode: "M-FPI",
            optionNumber: "1",
            setupNo: "1",
            machine: "C901",
            stage: "setting",
            doneBy: "Q1",
            completedAt: "2026-06-24T10:00:00.000Z",
          },
        },
        {
          _id: "status-new",
          entryType: "shop_floor_status",
          key: "jc-fpi|m-fpi|1|1|c901",
          createdAt: "2026-06-24T11:00:00.000Z",
          payload: {
            jcNo: "JC-FPI",
            partCode: "M-FPI",
            optionNumber: "1",
            setupNo: "1",
            machine: "C901",
            stage: "quality_approval",
            doneBy: "Q2",
            completedAt: "2026-06-24T11:00:00.000Z",
          },
        },
        {
          _id: "report-old",
          entryType: "first_piece_inspection_report",
          key: "old-timestamped-key",
          createdAt: "2026-06-24T10:00:00.000Z",
          payload: {
            reportId: "old",
            jcNo: "JC-FPI",
            partCode: "M-FPI",
            optionNumber: "1",
            setupNo: "1",
            machine: "C901",
            taskCompletedAt: "2026-06-24T10:00:00.000Z",
            approvedBy: "Q1",
          },
        },
        {
          _id: "report-new",
          entryType: "first_piece_inspection_report",
          key: "jc-fpi|m-fpi|1|1|c901|fpi",
          createdAt: "2026-06-24T11:00:00.000Z",
          payload: {
            reportId: "jc-fpi|m-fpi|1|1|c901|fpi",
            jcNo: "JC-FPI",
            partCode: "M-FPI",
            optionNumber: "1",
            setupNo: "1",
            machine: "C901",
            taskCompletedAt: "2026-06-24T11:00:00.000Z",
            approvedBy: "Q2",
          },
        },
      ],
    });

    const productionControl = snapshot.productionControl as typeof snapshot.productionControl & {
      firstPieceInspectionReportRows: Array<Record<string, unknown>>;
      machinePlanDetailRows: Array<Record<string, unknown>>;
    };

    expect(productionControl.firstPieceInspectionReportRows).toHaveLength(1);
    expect(productionControl.firstPieceInspectionReportRows[0]).toMatchObject({
      approvedBy: "Q2",
      reportId: "jc-fpi|m-fpi|1|1|c901|fpi",
    });
    expect(productionControl.machinePlanDetailRows[0]).toMatchObject({
      jcNo: "JC-FPI",
      shopFloorStage: "quality_approval",
      shopFloorDoneBy: "Q2",
    });
  });
});
