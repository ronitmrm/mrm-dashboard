import { describe, expect, test } from "vitest"

import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"

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
