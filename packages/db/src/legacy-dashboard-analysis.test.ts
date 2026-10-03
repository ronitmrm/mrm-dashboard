import { describe, expect, test } from "vitest"

import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"

test("saved route change uses the new route and remaining setup quantities", () => {
  const createdAt = "2026-10-03T11:21:35Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const snapshot = buildLegacyDashboardSnapshot({
    productionFloorCode: "cnc",
    workbookName: "PostgreSQL",
    productionEntries: [],
    dataEntries: [
      entry("work_order", { jcNo: "P2205", partCode: "M615", orderPcs: 1450, rmInwardDate: "2026-10-03", rmInwardKg: 1 }),
      ...["1", "2"].map((optionNumber) => entry("route", { partNo: "M615", optionNumber, setupNo: "1", machineType: "CNC", machineFamily: optionNumber === "1" ? "JL" : "C3" })),
      entry("cycle", { partNo: "M615", optionNumber: "2", setupNo: "1", cycleTime: 60 }),
      entry("tooling", { partNo: "M615", optionNumber: "2", setupNo: "1" }),
      entry("machine_master", { machineNo: "CNC-7", machineType: "CNC", machineFamily: "JL", status: "Active" }),
      entry("machine_master", { machineNo: "CNC-21", machineType: "CNC", machineFamily: "C3", status: "Active" }),
    ],
    routeSelections: [{ jobCardNumber: "P2205", routeCode: "1", createdAt }],
    routeChanges: [{ jobCardNumber: "P2205", newRouteCode: "2", remainingSetups: [{ setupNumber: 1, plan: true, quantity: 900 }], createdAt }],
  })

  expect(snapshot.productionControl?.workOrders.find((row) => row.jcNo === "P2205")).toMatchObject({
    optionNumber: "2", optionSource: "Route change",
    routeChangeRemainingSetups: [{ setupNo: "1", plan: true, quantity: 900 }],
  })
  expect(snapshot.productionControl?.machinePlanDetailRows.find((row) => row.jcNo === "P2205")).toMatchObject({
    machine: "CNC-21", optionNumber: "2", orderPcs: 900,
  })
})

test("incomplete changed route stays in Part Readiness without a machine plan", () => {
  const createdAt = "2026-10-03T11:21:35Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const control = buildLegacyDashboardSnapshot({
    productionFloorCode: "cnc", workbookName: "PostgreSQL", productionEntries: [],
    dataEntries: [
      entry("work_order", { jcNo: "P2205", partCode: "M615", orderPcs: 1450, rmInwardDate: "2026-10-03", rmInwardKg: 1 }),
      entry("route", { partNo: "M615", optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "JL" }),
      ...["1", "2"].map((setupNo) => entry("route", { partNo: "M615", optionNumber: "2", setupNo, machineType: "CNC", machineFamily: "C3" })),
      entry("cycle", { partNo: "M615", optionNumber: "2", setupNo: "1", cycleTime: 60 }),
      entry("tooling", { partNo: "M615", optionNumber: "2", setupNo: "1" }),
      entry("machine_master", { machineNo: "CNC-7", machineType: "CNC", machineFamily: "JL", status: "Active" }),
      entry("machine_master", { machineNo: "HX-01", machineType: "CNC", machineFamily: "C3", status: "Active" }),
    ],
    routeSelections: [{ jobCardNumber: "P2205", routeCode: "1", createdAt }],
    routeChanges: [{ jobCardNumber: "P2205", newRouteCode: "2", remainingSetups: [1, 2].map((setupNumber) => ({ setupNumber, plan: true, quantity: 1450 })), createdAt }],
    previousMachinePlanDetailRows: [{ jcNo: "P2205", partCode: "M615", optionNumber: "1", setupNo: "1", machine: "CNC-7", routeMachine: "JL" }],
  }).productionControl

  if (!("masterGaps" in control)) throw new Error("Missing Part Readiness rows")
  expect(control.workOrders.find((row) => row.jcNo === "P2205")).toMatchObject({ optionNumber: "2", optionSource: "Route change" })
  expect(control.masterGaps.filter((row) => row.jcNo === "P2205")).toEqual([
    expect.objectContaining({ missingSetupNo: "2", cycleTimeMissing: true, toolingPlanMissing: true }),
  ])
  expect(control.machinePlanDetailRows.some((row) => row.jcNo === "P2205")).toBe(false)
})

test("approved dispatch marks the Job Card dispatched", () => {
  const createdAt = "2026-09-29T10:00:00Z"
  const snapshot = buildLegacyDashboardSnapshot({
    workbookName: "PostgreSQL",
    productionEntries: [],
    dataEntries: ["P-DISPATCHED", "P-REJECTED"].map((jcNo) => ({
      entryType: "work_order",
      createdAt,
      payload: { jcNo, partCode: "M1", optionNumber: "1", orderPcs: 10 },
    })),
    dispatchApprovals: [
      { jobCardNumber: "P-DISPATCHED", decision: "approved", createdAt },
      { jobCardNumber: "P-REJECTED", decision: "rejected", createdAt },
    ],
  })

  expect(snapshot.productionControl).toMatchObject({
    jobCardStatusTiles: expect.arrayContaining([
      expect.objectContaining({ jcNo: "P-DISPATCHED", dispatchStatus: "Shifted to dispatch" }),
      expect.objectContaining({ jcNo: "P-REJECTED", dispatchStatus: "In production" }),
    ]),
    productionDashboardRows: expect.arrayContaining([
      expect.objectContaining({ jcNo: "P-DISPATCHED", status: "Dispatched" }),
      expect.objectContaining({ jcNo: "P-REJECTED", status: "Pending" }),
    ]),
  })
})

test("current setup state wins over a later-timed historical stage event", () => {
  const entry = (entryType: string, payload: Record<string, unknown>, createdAt: string) => ({ entryType, payload, createdAt })
  const identity = { jcNo: "P2263", partCode: "M2160B", optionNumber: "1", setupNo: "1", machine: "CNC-10" }
  const snapshot = buildLegacyDashboardSnapshot({
    workbookName: "PostgreSQL",
    productionFloorCode: "cnc",
    productionEntries: [{ jobCard: "P2263", partCode: "M2160B", setupNo: "1", machine: "CNC-10", machineType: "CNC", operatorId: "OP1", prodDate: "2026-09-29", outputQty: 60, actualQty: 60, rejectQty: 0, targetQty: 60 }],
    dataEntries: [
      entry("work_order", { jcNo: "P2263", partCode: "M2160B", optionNumber: "1", orderPcs: 60, rmInwardDate: "2026-09-29", rmInwardKg: 1 }, "2026-09-29T05:00:00Z"),
      entry("route", { partNo: "M2160B", optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "JT" }, "2026-09-29T05:00:00Z"),
      entry("cycle", { partNo: "M2160B", optionNumber: "1", setupNo: "1", cycleTime: 50 }, "2026-09-29T05:00:00Z"),
      entry("machine_master", { machineNo: "CNC-10", machineType: "CNC", machineFamily: "JT", status: "Active" }, "2026-09-29T05:00:00Z"),
      entry("shop_floor_status", { ...identity, stage: "item_complete", completedAt: "2026-09-29T10:55:00Z" }, "2026-09-29T10:55:00Z"),
      entry("shop_floor_status", { ...identity, stage: "operator_started", completedAt: "2026-09-29T13:09:00Z" }, "2026-09-29T13:09:00Z"),
    ],
    currentShopFloorStatusRows: [{ ...identity, stage: "item_complete", completedAt: "2026-09-29T10:55:00Z" }],
  })

  expect(snapshot.productionControl?.machinePlanDetailRows.find((row) => row.jcNo === "P2263" && row.setupNo === "1")).toMatchObject({
    machine: "CNC-10", shopFloorStage: "item_complete", runningStatus: "Complete", rawActualQty: 60,
  })
})

describe("legacy dashboard route selections", () => {
  test("retains all uploaded dimensions when parameter codes are generated", () => {
    const dimensions = [
      { parameterName: "Total Length", specification: 15 },
      { parameterName: "Thread Length", specification: 15 },
      { parameterName: "Thread", specification: "1/4 nptf" },
    ]
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "PostgreSQL", productionEntries: [],
      dataEntries: dimensions.map((dimension) => ({
        entryType: "quality_parameter_master", createdAt: "2026-09-14T07:47:12Z",
        payload: { partNo: "M68B", optionNumber: 1, setupNo: 1, sequence: 1, ...dimension },
      })),
    })
    expect(snapshot.productionControl).toHaveProperty("qualityParameterMasterRows",
      dimensions.map((dimension) => expect.objectContaining({
        ...dimension, code: `${dimension.parameterName}|${dimension.specification}`,
      }))
    )
  })
  test("recognizes the PostgreSQL planning payload after an option is saved", () => {
    const createdAt = "2026-08-12T10:00:00.000Z"
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "MRM",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt,
          payload: {
            "JC NO.": "JC-M2B-1",
            "PART CODE": "M2B",
            "ORD. PCS.": 4,
          },
        },
        {
          entryType: "rm_inward",
          createdAt,
          payload: {
            jcNo: "JC-M2B-1",
            partCode: "M2B",
            rmPoNo: "RM-1",
          },
        },
        ...["1", "2"].map((optionNumber) => ({
          entryType: "route",
          createdAt,
          payload: {
            "PART NO": "M2B",
            "OPTION NUMBER": optionNumber,
            "SETUP NO.": 1,
            "SETUP NAME": `Setup ${optionNumber}`,
          },
        })),
      ],
      routeSelections: [
        {
          createdAt,
          jobCardNumber: "JC-M2B-1",
          routeCode: "1",
        },
      ],
    })

    expect(snapshot.productionControl).toMatchObject({
      routeSelectionRequired: [],
      jobCardStatusTiles: [{
        jcNo: "JC-M2B-1",
        optionNumber: "1",
        optionSource: "Planner selected",
        routeStatus: "Ready",
      }],
    })
  })

  test("counts only the selected route's final setup as finished Job Card pieces", () => {
    const createdAt = "2026-08-16T08:00:00.000Z"
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "MRM",
      productionEntries: [{
        actualQty: 8_441,
        jobCard: "JC-001",
        machine: "CNC-01",
        machineType: "CNC",
        operatorId: "001",
        outputQty: 8_441,
        partCode: "M2B",
        prodDate: "2026-08-16",
        rejectQty: 0,
        setupNo: "1",
        targetQty: 50_000,
      }],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt,
          payload: {
            "JC NO.": "JC-001",
            "PART CODE": "M2B",
            "OPTION NUMBER": "1",
            "ORD. PCS.": 50_000,
          },
        },
        ...["1", "2", "3"].map((setupNo) => ({
          entryType: "route",
          createdAt,
          payload: {
            "OPTION NUMBER": "1",
            "PART NO": "M2B",
            "SETUP NAME": `Setup ${setupNo}`,
            "SETUP NO.": setupNo,
          },
        })),
      ],
    })

    expect(snapshot.productionControl).toMatchObject({
      jobCardStatusTiles: [{
        finalSetupGoodPieces: 0,
        finalSetupNumber: "3",
        jcNo: "JC-001",
        rawActualQty: 8_441,
      }],
    })
  })

  test("accumulates every RM receipt and keeps the first receipt date for planning", () => {
    const entry = (entryType: string, payload: Record<string, unknown>, createdAt: string) => ({
      entryType,
      payload,
      createdAt,
    })
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "PostgreSQL",
      productionEntries: [],
      dataEntries: [
        entry("work_order", {
          jcNo: "JC-MULTI-RM",
          partCode: "PART-MULTI-RM",
          optionNumber: "1",
          orderPcs: 1_000,
        }, "2026-09-18T08:00:00.000Z"),
        entry("rm_inward", {
          jcNo: "JC-MULTI-RM",
          rmInwardDate: "2026-09-18",
          rmInwardKg: 40,
        }, "2026-09-18T09:00:00.000Z"),
        entry("rm_inward", {
          jcNo: "JC-MULTI-RM",
          rmInwardDate: "2026-09-20",
          rmInwardKg: 60,
        }, "2026-09-20T09:00:00.000Z"),
      ],
    })

    expect(snapshot.productionControl).toMatchObject({
      jobCardStatusTiles: [{
        jcNo: "JC-MULTI-RM",
        rmInwardDate: "2026-09-18",
        rmInwardKg: 100,
        rmStatus: "Received",
      }],
    })
  })

  test("uses only a durable RM receipt baseline for the planned finish date", () => {
    const createdAt = "2026-09-20T05:00:00.000Z"
    const entry = (entryType: string, payload: Record<string, unknown>) => ({
      entryType,
      payload,
      createdAt,
    })
    const input = {
      workbookName: "PostgreSQL",
      productionEntries: [],
      dataEntries: [
        entry("work_order", {
          jcNo: "JC-RM-BASELINE",
          partCode: "PART-RM-BASELINE",
          optionNumber: "1",
          orderPcs: 100,
          rmInwardDate: "2026-09-20",
          rmInwardKg: 1,
        }),
        entry("route", {
          partNo: "PART-RM-BASELINE",
          optionNumber: "1",
          setupNo: "1",
          machineType: "CNC",
          machineFamily: "BASELINE-FAMILY",
        }),
        entry("cycle", {
          partNo: "PART-RM-BASELINE",
          optionNumber: "1",
          setupNo: "1",
          cycleTime: 288,
        }),
        entry("machine_master", {
          machineNo: "CNC-BASELINE",
          machineType: "CNC",
          machineFamily: "BASELINE-FAMILY",
          status: "Active",
        }),
      ],
    }

    const withoutBaseline = buildLegacyDashboardSnapshot(input)
      .productionControl.productionDashboardRows[0]!
    expect(withoutBaseline.currentProbableDispatchDate).not.toBe("")
    expect(withoutBaseline.plannedDispatchDateAtRmReceipt).toBe("")

    const withBaseline = buildLegacyDashboardSnapshot({
      ...input,
      productionFinishBaselineRows: [{
        jcNo: "JC-RM-BASELINE",
        partCode: "PART-RM-BASELINE",
        plannedDispatchDateAtRmReceipt: "30-Sept-26",
      }],
    } as Parameters<typeof buildLegacyDashboardSnapshot>[0])
      .productionControl.productionDashboardRows[0]!
    expect(withBaseline.plannedDispatchDateAtRmReceipt).toBe("30-Sept-26")
  })

  test("creates one readiness row per setup missing cycle time", () => {
    const createdAt = "2026-09-20T10:00:00.000Z"
    const entry = (entryType: string, payload: Record<string, unknown>) => ({
      entryType,
      payload,
      createdAt,
    })
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "PostgreSQL",
      productionEntries: [],
      dataEntries: [
        entry("work_order", {
          jcNo: "JC-READINESS",
          partCode: "PART-READINESS",
          optionNumber: "2",
          orderPcs: 2_400,
        }),
        entry("rm_inward", {
          jcNo: "JC-READINESS",
          partCode: "PART-READINESS",
          rmPoNo: "RM-READINESS",
          rmInwardDate: "2026-09-20",
          rmInwardKg: 100,
        }),
        ...["1", "2"].flatMap((setupNo) => [
          entry("route", {
            partNo: "PART-READINESS",
            optionNumber: "2",
            setupNo,
            setupName: `Setup ${setupNo}`,
            machineType: "CNC",
            machineFamily: "READINESS-FAMILY",
          }),
          entry("tooling", {
            partNo: "PART-READINESS",
            optionNumber: "2",
            setupNo,
            fixture: "Not Required",
            tooling: "Not Required",
            foamTool: "Not Required",
          }),
        ]),
        entry("machine_master", {
          machineNo: "CNC-READINESS-01",
          machineType: "CNC",
          machineFamily: "READINESS-FAMILY",
          status: "Active",
        }),
      ],
    })

    expect(snapshot.productionControl).toMatchObject({
      allWorkOrderGaps: [
        expect.objectContaining({
          jcNo: "JC-READINESS",
          orderPcs: 2_400,
          optionNumber: "2",
          missingSetupNo: "1",
          cycleTimeMissing: true,
          toolingPlanMissing: false,
          machineMasterMissing: false,
        }),
        expect.objectContaining({
          jcNo: "JC-READINESS",
          orderPcs: 2_400,
          optionNumber: "2",
          missingSetupNo: "2",
          cycleTimeMissing: true,
          toolingPlanMissing: false,
          machineMasterMissing: false,
        }),
      ],
      masterGaps: [
        expect.objectContaining({ missingSetupNo: "1" }),
        expect.objectContaining({ missingSetupNo: "2" }),
      ],
    })
  })
})
