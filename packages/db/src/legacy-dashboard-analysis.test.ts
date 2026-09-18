import { describe, expect, test } from "vitest"

import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"

describe("legacy dashboard route selections", () => {
  test("keeps opening pieces per setup without inflating daily output or observed rates", () => {
    const createdAt = "2026-09-18T22:00:00+05:30"
    const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
    const input: Parameters<typeof buildLegacyDashboardSnapshot>[0] = {
      workbookName: "Opening", productionEntries: [{ jobCard: "JC-OPEN", partCode: "PART", setupNo: "2", machine: "CNC-1", machineType: "CNC",
        operatorId: "OP", prodDate: "2026-09-19", outputQty: 110, actualQty: 100, rejectQty: 10, targetQty: 200 }],
      dataEntries: [
        entry("work_order", { jcNo: "JC-OPEN", partCode: "PART", optionNumber: "1", orderPcs: 10000, rmInwardDate: "2026-09-18", rmInwardKg: 100 }),
        entry("rm_inward", { jcNo: "JC-OPEN", rmInwardDate: "2026-09-18", rmInwardKg: 100, status: "Received" }),
        entry("machine_master", { machineNo: "CNC-1", machineType: "CNC", machineFamily: "T42", status: "Active" }),
        ...["1", "2", "3"].flatMap((setupNo) => [
          entry("route", { partNo: "PART", optionNumber: "1", setupNo, machineType: "CNC", machineFamily: "T42" }),
          entry("cycle", { partNo: "PART", optionNumber: "1", setupNo, cycleTime: 60 }),
          entry("tooling", { partNo: "PART", optionNumber: "1", setupNo }),
        ]),
        entry("production_opening_balance", { jobCardNumber: "JC-OPEN", partCode: "PART", optionNumber: "1", setupNo: "1", goodPieces: 10000, rejectedPieces: 0, status: "completed", cutoffAt: createdAt }),
        entry("production_opening_balance", { jobCardNumber: "JC-OPEN", partCode: "PART", optionNumber: "1", setupNo: "2", machineNumber: "CNC-1", goodPieces: 5000, rejectedPieces: 20, status: "running", cutoffAt: createdAt }),
        entry("shop_floor_status", { jcNo: "JC-OPEN", partCode: "PART", optionNumber: "1", setupNo: "2", machine: "CNC-1", stage: "operator_started", openingBalance: true }),
      ],
    }
    const beforeProduction = buildLegacyDashboardSnapshot({ ...input, productionEntries: [] }).productionControl!
    if (!("machinePlanDetailRows" in beforeProduction)) throw new Error("Missing planning")
    expect(beforeProduction.machinePlanDetailRows.find((row) => row.setupNo === "2")).toMatchObject({
      rawActualQty: 5000, pendingGoodQty: 5000, rawRows: 0, actualStartDate: "", setupCompletionDate: "",
      plannedProductionStartDate: "19-Sept-26",
    })
    const snapshot = buildLegacyDashboardSnapshot(input)
    const control = snapshot.productionControl!
    if (!("machinePlanDetailRows" in control)) throw new Error("Missing planning")
    const running = control.machinePlanDetailRows.find((row) => row.setupNo === "2")!
    expect(running).toMatchObject({ rawActualQty: 5100, rawRejectQty: 30, pendingGoodQty: 4900, openingGoodQty: 5000, rawRows: 1, machine: "CNC-1" })
    expect(control.machinePlanDetailRows.some((row) => row.setupNo === "1")).toBe(false)
    expect(control.machinePlanDetailRows.find((row) => row.setupNo === "3")).toMatchObject({ pendingGoodQty: 10000 })
    expect(control.productionOutputRows).toHaveLength(1)
    expect(snapshot.operatorPerformance).toEqual(expect.arrayContaining([expect.objectContaining({ output: 110 })]))
    // 4,900 / 100 new good pieces per working day must take months, not one day.
    expect(String(running.plannedProductionEndDate)).toContain("Nov")
  })
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
})
