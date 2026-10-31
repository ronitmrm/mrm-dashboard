import { describe, expect, test } from "vitest"

import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"

test("rework waits for manual sole-route selection while normal work auto-selects", () => {
  const createdAt = "2026-10-19T04:00:00Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const input = {
    workbookName: "PostgreSQL", productionFloorCode: "cnc" as const, productionEntries: [],
    dataEntries: [
      entry("work_order", { jcNo: "P1", partCode: "PART", orderPcs: 100, rmInwardDate: "2026-10-01", rmInwardKg: 1 }),
      entry("work_order", { jcNo: "P1/RW1", partCode: "PART", orderPcs: 20, isRework: true, isRevision: true, revisionNumber: 1, rootJobCardNumber: "P1", originalJobCardNumber: "P1", receivedOn: "2026-10-19" }),
      entry("route", { partNo: "PART", optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "HX" }),
      entry("cycle", { partNo: "PART", optionNumber: "1", setupNo: "1", cycleTime: 60 }),
      entry("tooling", { partNo: "PART", optionNumber: "1", setupNo: "1" }),
      entry("route", { partNo: "PART", optionNumber: "RW-PRIVATE", setupNo: "1", machineType: "CNC", machineFamily: "HX", reworkJobCardNumber: "ANOTHER-REVISION" }),
      entry("machine_master", { machineNo: "HX-01", machineType: "CNC", machineFamily: "HX", status: "Active" }),
    ],
  }
  const control = buildLegacyDashboardSnapshot(input).productionControl
  expect(control).toMatchObject({ summary: { workOrders: 1, totalOrderQty: 100 } })
  expect(control.workOrders.find(row => row.jcNo === "P1")).toMatchObject({ optionNumber: "1", optionSource: "Auto single route" })
  expect(control.workOrders.find(row => row.jcNo === "P1/RW1")).toMatchObject({ orderPcs: 20, optionSource: "Planner required", materialPlanningReady: true })
  expect(control).toMatchObject({ masterGaps: [expect.objectContaining({ jcNo: "P1/RW1", routeSelectionMissing: true })] })
  expect(control.machinePlanDetailRows.some(row => row.jcNo === "P1/RW1")).toBe(false)
  expect("routeMasterRows" in control && control.routeMasterRows).toHaveLength(1)
  expect(control.workOrders.find(row => row.jcNo === "P1/RW1")?.availableOptions).toHaveLength(1)
  const planned = buildLegacyDashboardSnapshot({ ...input, routeSelections: [{ jobCardNumber: "P1/RW1", routeCode: "1", createdAt }] }).productionControl
  expect(planned).toMatchObject({ masterGaps: [] })
  expect(planned.machinePlanDetailRows.find(row => row.jcNo === "P1/RW1")).toMatchObject({ orderPcs: 20, optionNumber: "1" })
})

test("reopened setup retains output without a missing-start exception or machine ownership", () => {
  const createdAt = "2026-10-08T17:53:50Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const input = {
    workbookName: "PostgreSQL", productionFloorCode: "cnc" as const,
    productionEntries: [{ jobCard: "P1413", partCode: "M1368B", optionNumber: "1", setupNo: "1", machine: "HX-01", machineType: "CNC", operatorId: "OP", prodDate: "2026-10-08", outputQty: 7336, actualQty: 7336, rejectQty: 0, targetQty: 7336 }],
    dataEntries: [
      ...[{ jcNo: "P1413", partCode: "M1368B" }, { jcNo: "P2057", partCode: "R74" }].flatMap((job) => [
        entry("work_order", { ...job, optionNumber: "1", orderPcs: 10000, rmInwardDate: "2026-10-01", rmInwardKg: 1 }),
        entry("route", { partNo: job.partCode, optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "HX" }),
        entry("cycle", { partNo: job.partCode, optionNumber: "1", setupNo: "1", cycleTime: 60 }),
        entry("tooling", { partNo: job.partCode, optionNumber: "1", setupNo: "1" }),
      ]),
      entry("machine_master", { machineNo: "HX-01", machineType: "CNC", machineFamily: "HX", status: "Active" }),
    ],
    currentShopFloorStatusRows: [
      { jcNo: "P1413", partCode: "M1368B", optionNumber: "1", setupNo: "1", machine: "HX-01", stage: "planned", active: false, hasRecordedStart: true, actionType: "Reopen Setup", reopenedAt: createdAt },
      { jcNo: "P2057", partCode: "R74", optionNumber: "1", setupNo: "1", machine: "HX-01", stage: "raw_material_at_machine", active: true, completedAt: "2026-10-08T12:43:32Z" },
    ],
  }
  const control = buildLegacyDashboardSnapshot(input).productionControl
  expect(control).toMatchObject({ workflowExceptionRows: [] })
  expect(control.machinePlanDetailRows.find((row) => row.jcNo === "P1413")).toMatchObject({ rawActualQty: 7336, shopFloorStage: "planned", runningStatus: "Planned", shopFloorTaskReady: false })
  expect(control.machinePlanDetailRows.find((row) => row.jcNo === "P2057")).toMatchObject({ machine: "HX-01", shopFloorStage: "raw_material_at_machine" })
  const resumed = buildLegacyDashboardSnapshot({ ...input, currentShopFloorStatusRows: [{ ...input.currentShopFloorStatusRows[0]!, stage: "raw_material_at_machine", active: true }] }).productionControl
  expect(resumed).toMatchObject({ workflowExceptionRows: [] })
  expect(resumed.machinePlanDetailRows.find((row) => row.jcNo === "P1413")).toMatchObject({ shopFloorStage: "raw_material_at_machine", runningStatus: "Planned", rawActualQty: 7336 })
  const restarted = buildLegacyDashboardSnapshot({ ...input, currentShopFloorStatusRows: [{ ...input.currentShopFloorStatusRows[0]!, stage: "raw_material_at_machine", active: true, hasRecordedStart: false }] }).productionControl
  expect(restarted).toMatchObject({ workflowExceptionRows: [] })
  expect(restarted.machinePlanDetailRows.find((row) => row.jcNo === "P1413")).toMatchObject({ shopFloorStage: "raw_material_at_machine", runningStatus: "Planned", rawActualQty: 7336 })
  expect(buildLegacyDashboardSnapshot({ ...input, currentShopFloorStatusRows: input.currentShopFloorStatusRows.slice(1) }).productionControl).toMatchObject({ workflowExceptionRows: [
    expect.objectContaining({ jcNo: "P1413", rawProductionWithoutWorkflow: true }),
  ] })
})

test("saved route change uses the new route and remaining setup quantities", () => {
  const createdAt = "2026-10-03T11:21:35Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const input = {
    productionFloorCode: "cnc" as const,
    workbookName: "PostgreSQL",
    productionEntries: [{ jobCard: "P2205", partCode: "M615", optionNumber: "1", setupNo: "1", machine: "CNC-7", machineType: "CNC", operatorId: "OP", prodDate: "2026-10-02", createdAt: "2026-10-02T16:00:00Z", outputQty: 550, actualQty: 550, rejectQty: 0, targetQty: 1450 }],
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
    currentShopFloorStatusRows: [{ jcNo: "P2205", partCode: "M615", optionNumber: "1", setupNo: "1", machine: "CNC-7", stage: "planned", active: false, hasRecordedStart: true, createdAt }],
    planOverrides: [{ target: "P2205", setupNo: "1", toMachine: "CNC-7", assignmentMode: "add_parallel_machine", createdAt: "2026-10-02T10:00:00Z" }],
  }
  const originalHistory = structuredClone(input.productionEntries)
  const snapshot = buildLegacyDashboardSnapshot(input)

  expect(snapshot.productionControl?.workOrders.find((row) => row.jcNo === "P2205")).toMatchObject({
    optionNumber: "2", optionSource: "Route change", rawActualQty: 550,
    routeChangeRemainingSetups: [{ setupNo: "1", plan: true, quantity: 900 }],
  })
  expect(snapshot.productionControl?.machinePlanDetailRows.find((row) => row.jcNo === "P2205")).toMatchObject({
    machine: "CNC-21", optionNumber: "2", orderPcs: 900,
    setupRemainingQty: 900, rawActualQty: 0, runningStatus: "Planned",
  })
  const recalculated = buildLegacyDashboardSnapshot({ ...input, previousMachinePlanDetailRows: snapshot.productionControl.machinePlanDetailRows }).productionControl
  expect(recalculated.machinePlanDetailRows).toEqual(snapshot.productionControl.machinePlanDetailRows)
  expect(recalculated.workOrders.find((row) => row.jcNo === "P2205")).toMatchObject({ optionNumber: "2", rawActualQty: 550 })
  const started = buildLegacyDashboardSnapshot({
    ...input,
    productionEntries: [...input.productionEntries, { ...input.productionEntries[0]!, optionNumber: "2", machine: "CNC-21", prodDate: "2026-10-04", createdAt: "2026-10-04T16:00:00Z", outputQty: 100, actualQty: 100 }],
    currentShopFloorStatusRows: [...input.currentShopFloorStatusRows, { ...input.currentShopFloorStatusRows[0]!, optionNumber: "2", machine: "CNC-21", stage: "operator_started", active: true, createdAt: "2026-10-04T10:00:00Z" }],
  }).productionControl
  expect(started.machinePlanDetailRows.find((row) => row.jcNo === "P2205")).toMatchObject({ machine: "CNC-21", runningStatus: "Running", rawActualQty: 100, setupRemainingQty: 800 })
  expect(started.workOrders.find((row) => row.jcNo === "P2205")).toMatchObject({ rawActualQty: 650 })
  expect(input.productionEntries).toEqual(originalHistory)
})

test("a new remaining plan excludes earlier execution on the same route", () => {
  const createdAt = "2026-10-03T11:21:35Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const control = buildLegacyDashboardSnapshot({
    productionFloorCode: "cnc", workbookName: "PostgreSQL",
    productionEntries: [{ jobCard: "P1", partCode: "M1", optionNumber: "1", setupNo: "1", machine: "HX-01", machineType: "CNC", operatorId: "OP", prodDate: "2026-10-02", createdAt: "2026-10-02T16:00:00Z", outputQty: 100, actualQty: 100, rejectQty: 0, targetQty: 500 }],
    dataEntries: [
      entry("work_order", { jcNo: "P1", partCode: "M1", optionNumber: "1", orderPcs: 500, rmInwardDate: "2026-10-01", rmInwardKg: 1 }),
      entry("route", { partNo: "M1", optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "HX" }),
      entry("cycle", { partNo: "M1", optionNumber: "1", setupNo: "1", cycleTime: 60 }),
      entry("tooling", { partNo: "M1", optionNumber: "1", setupNo: "1" }),
      entry("machine_master", { machineNo: "HX-01", machineType: "CNC", machineFamily: "HX", status: "Active" }),
    ],
    routeChanges: [{ jobCardNumber: "P1", fromRouteCode: "1", newRouteCode: "1", remainingSetups: [{ setupNumber: 1, plan: true, quantity: 300 }], createdAt }],
    currentShopFloorStatusRows: [{ jcNo: "P1", partCode: "M1", optionNumber: "1", setupNo: "1", machine: "HX-01", stage: "planned", active: false, hasRecordedStart: true, createdAt }],
  }).productionControl
  expect(control.machinePlanDetailRows[0]).toMatchObject({ machine: "HX-01", optionNumber: "1", runningStatus: "Planned", rawActualQty: 0, setupRemainingQty: 300 })
  expect(control.workOrders[0]).toMatchObject({ rawActualQty: 100 })
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
      expect.objectContaining({ jcNo: "P-DISPATCHED", status: "Dispatched", actualFinishDate: "", dispatchedPieces: null, dispatchAvailablePieces: 0 }),
      expect.objectContaining({ jcNo: "P-REJECTED", status: "Pending" }),
    ]),
  })
})

test("quantified dispatch stays partial until final production is complete and shipped", () => {
  const createdAt = "2026-09-24T10:00:00Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const input = {
    workbookName: "PostgreSQL", productionFloorCode: "cnc" as const,
    productionEntries: [{ jobCard: "P-PARTIAL", partCode: "M-PARTIAL", optionNumber: "1", setupNo: "1", machine: "CNC-1", machineType: "CNC", operatorId: "OP", prodDate: "2026-09-24", outputQty: 100, actualQty: 100, rejectQty: 0, targetQty: 100 }],
    dataEntries: [
      entry("work_order", { jcNo: "P-PARTIAL", partCode: "M-PARTIAL", optionNumber: "1", orderPcs: 100, rmInwardDate: "2026-09-24", rmInwardKg: 1, committedDispatchDate: "2026-09-25" }),
      entry("route", { partNo: "M-PARTIAL", optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "JT" }),
      entry("cycle", { partNo: "M-PARTIAL", optionNumber: "1", setupNo: "1", cycleTime: 60 }),
      entry("machine_master", { machineNo: "CNC-1", machineType: "CNC", machineFamily: "JT", status: "Active" }),
    ],
    currentShopFloorStatusRows: [{ jcNo: "P-PARTIAL", partCode: "M-PARTIAL", optionNumber: "1", setupNo: "1", machine: "CNC-1", stage: "operator_started", completedAt: "2026-09-24T10:00:00Z" }],
    dispatchApprovals: [{ jobCardNumber: "P-PARTIAL", decision: "approved", quantity: 40, createdAt }],
  }
  const started = buildLegacyDashboardSnapshot(input).productionControl
  expect(started.workOrders[0]).toMatchObject({ dispatchStatus: "Partially dispatched", dispatchedPieces: 40, dispatchAvailablePieces: 60 })
  expect(started.productionDashboardRows[0]).toMatchObject({ committedDispatchDate: "2026-09-25" })
  expect(started.productionDashboardRows[0]).toMatchObject({ status: "Partially dispatched", actualFinishDate: "", dispatchedPieces: 40, dispatchAvailablePieces: 60, dispatchedDate: "24/09/2026" })

  const completed = buildLegacyDashboardSnapshot({
    ...input,
    currentShopFloorStatusRows: [{ ...input.currentShopFloorStatusRows[0]!, stage: "item_complete" }],
  }).productionControl
  expect(completed.productionDashboardRows[0]).toMatchObject({ status: "Partially dispatched", actualFinishDate: "24/09/2026", dispatchedPieces: 40, dispatchAvailablePieces: 60 })

  const shipped = buildLegacyDashboardSnapshot({
    ...input,
    currentShopFloorStatusRows: [{ ...input.currentShopFloorStatusRows[0]!, stage: "item_complete" }],
    dispatchApprovals: [...input.dispatchApprovals, { jobCardNumber: "P-PARTIAL", decision: "approved", quantity: 60, createdAt: "2026-09-25T10:00:00Z" }],
  }).productionControl
  if (!("jobCardStatusTiles" in shipped)) throw new Error("Missing Job Card tiles")
  expect(shipped.jobCardStatusTiles[0]).toMatchObject({ dispatchStatus: "Shifted to dispatch", dispatchedPieces: 100, dispatchAvailablePieces: 0 })
  expect(shipped.productionDashboardRows[0]).toMatchObject({ status: "Dispatched", actualFinishDate: "24/09/2026", dispatchedPieces: 100, dispatchAvailablePieces: 0, dispatchedDate: "25/09/2026" })
  expect(shipped.productionDashboardRows[0]).toMatchObject({ committedDispatchDate: "2026-09-25" })

  const overdrawn = buildLegacyDashboardSnapshot({
    ...input,
    productionEntries: [{ ...input.productionEntries[0]!, actualQty: 90, outputQty: 90, quantityGood: 90 }],
    currentShopFloorStatusRows: [{ ...input.currentShopFloorStatusRows[0]!, stage: "item_complete" }],
    dispatchApprovals: [...input.dispatchApprovals, { jobCardNumber: "P-PARTIAL", decision: "approved", quantity: 60, createdAt: "2026-09-25T10:00:00Z" }],
  }).productionControl
  expect(overdrawn.productionDashboardRows[0]).toMatchObject({ status: "Partially dispatched", dispatchAvailablePieces: 0 })
})

test("finished good follows the selected route even without a route change event", () => {
  const createdAt = "2026-09-24T10:00:00Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const oldRouteProduction = { jobCard: "P-ROUTE", partCode: "M-ROUTE", optionNumber: "1", setupNo: "1", machine: "CNC-1", machineType: "CNC", operatorId: "OP", prodDate: "2026-09-24", outputQty: 10, actualQty: 10, rejectQty: 0, targetQty: 10 }
  const input = {
    workbookName: "PostgreSQL", productionFloorCode: "cnc" as const,
    productionEntries: [oldRouteProduction],
    dataEntries: [
      entry("work_order", { jcNo: "P-ROUTE", partCode: "M-ROUTE", optionNumber: "2", orderPcs: 20 }),
      entry("route", { partNo: "M-ROUTE", optionNumber: "1", setupNo: "1", setupName: "Old operation" }),
      entry("route", { partNo: "M-ROUTE", optionNumber: "2", setupNo: "1", setupName: "New operation" }),
    ],
  }
  expect(buildLegacyDashboardSnapshot(input).productionControl.workOrders[0])
    .toMatchObject({ finalSetupGoodPieces: 0, dispatchAvailablePieces: 0 })
  expect(buildLegacyDashboardSnapshot({
    ...input,
    productionEntries: [...input.productionEntries, { ...oldRouteProduction, optionNumber: "2", actualQty: 7, outputQty: 7 }],
  }).productionControl.workOrders[0])
    .toMatchObject({ finalSetupGoodPieces: 7, dispatchAvailablePieces: 7 })
  expect(buildLegacyDashboardSnapshot({
    ...input,
    productionEntries: [{ ...oldRouteProduction, optionNumber: "2", actualQty: 0, outputQty: 7 }],
  }).productionControl.workOrders[0])
    .toMatchObject({ finalSetupGoodPieces: 0, dispatchAvailablePieces: 0 })
})

test("canonical dispatch stock remains available when software raw supplies production metrics", () => {
  const createdAt = "2026-09-24T10:00:00Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const input = {
    workbookName: "PostgreSQL", productionFloorCode: "cnc" as const,
    productionEntries: [{ jobCard: "P-MIXED", partCode: "M-MIXED", optionNumber: "1", setupNo: "1", machine: "CNC-1", machineType: "CNC", operatorId: "OP", prodDate: "2026-09-24", outputQty: 30, actualQty: 30, quantityGood: 30, rejectQty: 0, targetQty: 30 }],
    dataEntries: [
      entry("work_order", { jcNo: "P-MIXED", partCode: "M-MIXED", optionNumber: "1", orderPcs: 100 }),
      entry("route", { partNo: "M-MIXED", optionNumber: "1", setupNo: "1" }),
      entry("software_raw", { Sr: 1, JobCardNo: "P-MIXED", "PART NO": "M-MIXED", "SET UP": "1", "M/C NO": "CNC-1", "PROD DATE": "2026-09-24", "PROD QTY IN PCS": 999, "ACTUAL QTY IN PCS": 999 }),
    ],
  }
  expect(buildLegacyDashboardSnapshot(input).productionControl.workOrders[0])
    .toMatchObject({ rawActualQty: 999, finalSetupGoodPieces: 30, dispatchAvailablePieces: 30 })
  expect(buildLegacyDashboardSnapshot({ ...input, productionEntries: [] }).productionControl.workOrders[0])
    .toMatchObject({ rawActualQty: 999, finalSetupGoodPieces: 999, dispatchAvailablePieces: 0 })
  const noCanonicalStock = buildLegacyDashboardSnapshot({
    ...input, productionEntries: [],
    currentShopFloorStatusRows: [{ jcNo: "P-MIXED", partCode: "M-MIXED", optionNumber: "1", setupNo: "1", machine: "CNC-1", stage: "item_complete", completedAt: createdAt }],
    dispatchApprovals: [{ jobCardNumber: "P-MIXED", decision: "approved", quantity: 10, createdAt }],
  }).productionControl
  expect(noCanonicalStock.productionDashboardRows[0]).toMatchObject({ status: "Partially dispatched", dispatchAvailablePieces: 0 })
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

test("actual finish waits for every machine on the final setup", () => {
  const createdAt = "2026-09-24T10:00:00Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const states = ["CNC-1", "CNC-2"].map((machine, index) => ({
    jcNo: "P-FINISH", partCode: "M-FINISH", optionNumber: "1", setupNo: "1", machine,
    stage: "item_complete", completedAt: index ? "2026-09-24T10:00:00Z" : "2026-09-23T10:00:00Z",
  }))
  const input = {
    workbookName: "PostgreSQL", productionFloorCode: "cnc" as const,
    productionEntries: states.map((state) => ({
      jobCard: state.jcNo, partCode: state.partCode, setupNo: state.setupNo,
      machine: state.machine, machineType: "CNC", operatorId: "OP", prodDate: "2026-09-24",
      outputQty: 50, actualQty: 50, rejectQty: 0, targetQty: 50,
    })),
    dataEntries: [
      entry("work_order", { jcNo: "P-FINISH", partCode: "M-FINISH", optionNumber: "1", orderPcs: 100, rmInwardDate: "2026-09-23", rmInwardKg: 1 }),
      entry("route", { partNo: "M-FINISH", optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "JT" }),
      entry("cycle", { partNo: "M-FINISH", optionNumber: "1", setupNo: "1", cycleTime: 60 }),
      ...states.map((state) => entry("machine_master", { machineNo: state.machine, machineType: "CNC", machineFamily: "JT", status: "Active" })),
    ],
    currentShopFloorStatusRows: states,
  }

  const completed = buildLegacyDashboardSnapshot(input).productionControl
  expect(completed.machinePlanDetailRows.filter((row) => row.jcNo === "P-FINISH")).toHaveLength(2)
  expect(completed.productionDashboardRows[0]?.actualFinishDate).toBe("24/09/2026")

  const withoutPlan = buildLegacyDashboardSnapshot({
    ...input,
    dataEntries: input.dataEntries.map((row) => row.entryType === "work_order"
      ? { ...row, payload: { jcNo: "P-FINISH", partCode: "M-FINISH", optionNumber: "1", orderPcs: 100 } }
      : row),
  }).productionControl
  expect(withoutPlan.machinePlanDetailRows).toHaveLength(0)
  expect(withoutPlan.productionDashboardRows[0]?.actualFinishDate).toBe("24/09/2026")

  const incomplete = buildLegacyDashboardSnapshot({
    ...input,
    currentShopFloorStatusRows: states.map((state, index) => index ? { ...state, stage: "operator_started" } : state),
  }).productionControl
  expect(incomplete.productionDashboardRows[0]?.actualFinishDate).toBe("")
})

test("actual finish carries completed final work across an equivalent route change", () => {
  const createdAt = "2026-10-01T10:00:00Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const setup = { partNo: "M2164B", setupNo: "1", setupName: "Hose Barb Operation With Parting", machineFamily: "T25", stageWeight: 15.2 }
  const input = {
    workbookName: "PostgreSQL", productionFloorCode: "cnc" as const,
    dataEntries: [
      entry("work_order", { jcNo: "P2266", partCode: "M2164B", optionNumber: "1", orderPcs: 50, rmInwardDate: "2026-10-01", rmInwardKg: 1 }),
      entry("route", { ...setup, optionNumber: "1" }),
      entry("route", { partNo: "M2164B", setupNo: "2", setupName: "Face", machineFamily: "T25", optionNumber: "1" }),
      entry("route", { ...setup, optionNumber: "2" }),
      entry("machine_master", { machineNo: "CNC-12", machineType: "CNC", machineFamily: "T25", status: "Active" }),
      entry("cycle", { ...setup, optionNumber: "2", cycleTime: 60 }),
      entry("tooling", { ...setup, optionNumber: "2" }),
    ],
    productionEntries: [{ jobCard: "P2266", partCode: "M2164B", optionNumber: "1", setupNo: "1", machine: "CNC-12", machineType: "CNC", operatorId: "OP1", prodDate: "2026-10-01", outputQty: 100, actualQty: 100, rejectQty: 0, targetQty: 50 }],
    routeSelections: [{ jobCardNumber: "P2266", routeCode: "1", createdAt }],
    routeChanges: [{ jobCardNumber: "P2266", fromRouteCode: "1", newRouteCode: "2", remainingSetups: [{ setupNumber: 1, plan: true, quantity: 0 }], createdAt: "2026-10-03T15:50:00Z" }],
    currentShopFloorStatusRows: [{ jcNo: "P2266", partCode: "M2164B", optionNumber: "1", setupNo: "1", machine: "CNC-12", stage: "item_complete", completedAt: "2026-10-01T16:15:00Z" }],
  }
  const control = buildLegacyDashboardSnapshot(input).productionControl

  expect(control.workOrders[0]).toMatchObject({ optionNumber: "2", routeStatus: "Route change plan", finalSetupNumber: "1", finalSetupGoodPieces: 100, dispatchedPieces: 0, dispatchAvailablePieces: 100 })
  expect(control).toMatchObject({ allWorkOrderGaps: [], masterGaps: [], machinePlanDetailRows: [], workflowExceptionRows: [] })
  expect(control.productionDashboardRows[0]).toMatchObject({ actualFinishDate: "01/10/2026", dispatchAvailablePieces: 100 })

  const unrecordedNewRouteWorkflow = buildLegacyDashboardSnapshot({
    ...input,
    routeChanges: [{ ...input.routeChanges[0]!, remainingSetups: [{ setupNumber: 1, plan: true, quantity: 50 }] }],
    productionEntries: [{ ...input.productionEntries[0]!, optionNumber: "2", prodDate: "2026-10-04", createdAt: "2026-10-04T16:00:00Z" }],
  }).productionControl
  expect(unrecordedNewRouteWorkflow).toMatchObject({ workflowExceptionRows: [
    expect.objectContaining({ jcNo: "P2266", optionNumber: "2", rawProductionWithoutWorkflow: true }),
  ] })

  const newRouteStateWithoutOutput = buildLegacyDashboardSnapshot({
    ...input,
    currentShopFloorStatusRows: [...input.currentShopFloorStatusRows,
      { ...input.currentShopFloorStatusRows[0]!, optionNumber: "2", stage: "operator_started" }],
  }).productionControl
  expect(newRouteStateWithoutOutput.workOrders[0]).toMatchObject({ finalSetupGoodPieces: 100, dispatchAvailablePieces: 100 })

  const withNewRouteProduction = buildLegacyDashboardSnapshot({
    ...input,
    productionEntries: [...input.productionEntries,
      { ...input.productionEntries[0]!, optionNumber: "2", outputQty: 200, actualQty: 200, quantityGood: 25 }],
  }).productionControl
  expect(withNewRouteProduction.workOrders[0]).toMatchObject({ finalSetupGoodPieces: 125, dispatchAvailablePieces: 125 })

  const changedSetupNumber = buildLegacyDashboardSnapshot({
    ...input,
    dataEntries: [
      ...input.dataEntries.map((row) => row.entryType === "route" && row.payload.optionNumber === "1" && row.payload.setupNo === "1"
        ? { ...row, payload: { ...row.payload, setupNo: "3" } } : row),
      entry("route", { ...setup, optionNumber: "3" }),
    ],
    productionEntries: input.productionEntries.map((row) => ({ ...row, setupNo: "3" })),
    currentShopFloorStatusRows: [
      { ...input.currentShopFloorStatusRows[0]!, setupNo: "3" },
      { ...input.currentShopFloorStatusRows[0]!, optionNumber: "3", completedAt: "2026-10-02T10:00:00Z" },
    ],
  }).productionControl
  expect(changedSetupNumber.productionDashboardRows[0]?.actualFinishDate).toBe("01/10/2026")
  expect(changedSetupNumber.workOrders[0]).toMatchObject({ finalSetupGoodPieces: 100, dispatchAvailablePieces: 100 })

  const differentOperation = buildLegacyDashboardSnapshot({
    ...input,
    dataEntries: input.dataEntries.map((row) => row.entryType === "route" && row.payload.optionNumber === "2"
      ? { ...row, payload: { ...row.payload, setupName: "Different operation" } } : row),
  }).productionControl
  expect(differentOperation.workOrders[0]).toMatchObject({ finalSetupGoodPieces: 0, dispatchAvailablePieces: 0 })
})

test("finished good and Item Complete carry across two equivalent route changes", () => {
  const createdAt = "2026-10-01T10:00:00Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt })
  const setup = { partNo: "M-CHAIN", setupNo: "1", setupName: "Final cut", machineFamily: "T25", stageWeight: 15.2 }
  const snapshot = buildLegacyDashboardSnapshot({
    workbookName: "PostgreSQL", productionFloorCode: "cnc",
    dataEntries: [
      entry("work_order", { jcNo: "P-CHAIN", partCode: "M-CHAIN", optionNumber: "A", orderPcs: 100 }),
      ...["A", "B", "C"].map((optionNumber) => entry("route", { ...setup, optionNumber })),
    ],
    productionEntries: [{ jobCard: "P-CHAIN", partCode: "M-CHAIN", optionNumber: "A", setupNo: "1", machine: "CNC-12", machineType: "CNC", operatorId: "OP", prodDate: "2026-10-01", outputQty: 100, actualQty: 100, quantityGood: 100, rejectQty: 0, targetQty: 100 }],
    routeChanges: [
      { jobCardNumber: "P-CHAIN", fromRouteCode: "A", newRouteCode: "B", remainingSetups: [{ setupNumber: 1, quantity: 0 }], createdAt: "2026-10-02T10:00:00Z" },
      { jobCardNumber: "P-CHAIN", fromRouteCode: "B", newRouteCode: "C", remainingSetups: [{ setupNumber: 1, quantity: 0 }], createdAt: "2026-10-03T10:00:00Z" },
    ],
    currentShopFloorStatusRows: [{ jcNo: "P-CHAIN", partCode: "M-CHAIN", optionNumber: "A", setupNo: "1", machine: "CNC-12", stage: "item_complete", completedAt: "2026-10-01T16:15:00Z" }],
    dispatchApprovals: [{ jobCardNumber: "P-CHAIN", decision: "approved", quantity: 100, createdAt: "2026-10-04T10:00:00Z" }],
  }).productionControl
  expect(snapshot.workOrders[0]).toMatchObject({ optionNumber: "C", finalSetupGoodPieces: 100, dispatchRecordedGoodPieces: 100, dispatchAvailablePieces: 0, dispatchStatus: "Shifted to dispatch" })
  expect(snapshot.productionDashboardRows[0]).toMatchObject({ status: "Dispatched", actualFinishDate: "01/10/2026", dispatchedPieces: 100 })
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
          rmLocation: "Rack A3",
        }, "2026-09-18T09:00:00.000Z"),
        entry("rm_inward", {
          jcNo: "JC-MULTI-RM",
          rmInwardDate: "2026-09-20",
          rmInwardKg: 60,
          rmLocation: "Rack B2",
        }, "2026-09-20T09:00:00.000Z"),
        entry("route", { partNo: "PART-MULTI-RM", optionNumber: "1", setupNo: "1", machineType: "CNC", machineFamily: "RM-FAMILY" }, "2026-09-18T08:00:00.000Z"),
        entry("cycle", { partNo: "PART-MULTI-RM", optionNumber: "1", setupNo: "1", cycleTime: 60 }, "2026-09-18T08:00:00.000Z"),
        entry("tooling", { partNo: "PART-MULTI-RM", optionNumber: "1", setupNo: "1" }, "2026-09-18T08:00:00.000Z"),
        entry("machine_master", { machineNo: "CNC-RM", machineType: "CNC", machineFamily: "RM-FAMILY", status: "Active" }, "2026-09-18T08:00:00.000Z"),
      ],
    })

    expect(snapshot.productionControl).toMatchObject({
      jobCardStatusTiles: [{
        jcNo: "JC-MULTI-RM",
        rmInwardDate: "2026-09-18",
        rmInwardKg: 100,
        rmLocation: "Rack A3 · Rack B2",
        rmStatus: "Received",
      }],
      machinePlanDetailRows: [expect.objectContaining({ jcNo: "JC-MULTI-RM", rmLocation: "Rack A3 · Rack B2" })],
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
    expect(withBaseline.plannedDispatchDateAtRmReceipt).toBe("30/09/2026")
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


test("material waits release upstream machines while running downstream retains its full target", () => {
  const createdAt = '2026-10-20T10:00:00Z';
  const entry = (entryType: string, payload: Record<string, unknown>) => ({ entryType, payload, createdAt });
  const input = {
    workbookName: 'PostgreSQL', productionFloorCode: 'cnc' as const,
    productionEntries: [1, 2, 3].map(n => ({ jobCard: 'WAIT-JC', partCode: 'M378', optionNumber: '1',
      setupNo: String(n), machine: 'WAIT-' + n, machineType: 'CNC', operatorId: 'OP',
      prodDate: '2026-10-20', outputQty: n === 3 ? 1000 : 5000, actualQty: n === 3 ? 1000 : 5000,
      rejectQty: 0, targetQty: 5000 })),
    dataEntries: [
      entry('work_order', { jcNo: 'WAIT-JC', partCode: 'M378', optionNumber: '1', orderPcs: 10000,
        rmInwardDate: '2026-10-12', rmInwardKg: 25.11 }),
      ...[1, 2, 3].flatMap(n => [
        entry('route', { partNo: 'M378', optionNumber: '1', setupNo: String(n), machineType: 'CNC', machineFamily: 'WAIT-F' + n }),
        entry('cycle', { partNo: 'M378', optionNumber: '1', setupNo: String(n), cycleTime: 60 }),
        entry('tooling', { partNo: 'M378', optionNumber: '1', setupNo: String(n) }),
        entry('machine_master', { machineNo: 'WAIT-' + n, machineType: 'CNC', machineFamily: 'WAIT-F' + n, status: 'Active' }),
      ]),
    ],
    currentShopFloorStatusRows: [1, 2, 3].map(n => ({ jcNo: 'WAIT-JC', partCode: 'M378', optionNumber: '1',
      setupNo: String(n), machine: 'WAIT-' + n, stage: n === 3 ? 'operator_started' : 'planned', hasRecordedStart: true,
      ...(n < 3 ? { awaitingMaterial: { kind: n === 1 ? 'rm' : 'wip', availableAtRelease: n === 1 ? 25.11 : 5000 } } : {}) })),
  };
  const rows = buildLegacyDashboardSnapshot(input).productionControl.machinePlanDetailRows;
  expect(rows.filter(row => row.setupNo === '1' || row.setupNo === '2')).toEqual([]);
  expect(rows.find(row => row.setupNo === '3')).toMatchObject({ machine: 'WAIT-3', orderPcs: 10000, rawActualQty: 1000 });
  const moreRm = { ...input, dataEntries: input.dataEntries.map(row => row.entryType === 'work_order'
    ? { ...row, payload: { ...row.payload, rmInwardKg: 50.22 } } : row) };
  const resumed = buildLegacyDashboardSnapshot(moreRm).productionControl.machinePlanDetailRows;
  expect(resumed.filter(row => row.setupNo === '1').reduce((total, row) => total + Number(row.orderPcs), 0)).toBe(10000);
  expect(resumed.some(row => row.setupNo === '2')).toBe(false);
  expect(resumed.find(row => row.setupNo === '3')).toMatchObject({ machine: 'WAIT-3', orderPcs: 10000 });
  const moreWip = { ...moreRm, productionEntries: moreRm.productionEntries.map(row => row.setupNo === '1'
    ? { ...row, actualQty: 6000, outputQty: 6000 } : row) };
  expect(buildLegacyDashboardSnapshot(moreWip).productionControl.machinePlanDetailRows.some(row => row.setupNo === '2')).toBe(true);
  const parallel = { ...input,
    productionEntries: [...input.productionEntries, { ...input.productionEntries[0]!, machine: 'WAIT-1B', actualQty: 1000, outputQty: 1000 }],
    dataEntries: [...input.dataEntries,
      entry('machine_master', { machineNo: 'WAIT-1B', machineType: 'CNC', machineFamily: 'WAIT-F1', status: 'Active' }),
      entry('work_order', { jcNo: 'NEXT-JC', partCode: 'M378', optionNumber: '1', orderPcs: 1000, rmInwardDate: '2026-10-12', rmInwardKg: 10 }),
    ],
    currentShopFloorStatusRows: [...input.currentShopFloorStatusRows,
      { ...input.currentShopFloorStatusRows[0]!, machine: 'WAIT-1B', stage: 'operator_started', awaitingMaterial: undefined }],
    planOverrides: [{ target: 'WAIT-JC', setupNo: '1', toMachine: 'WAIT-1', assignmentMode: 'add_parallel_machine', createdAt }],
  };
  const calculationTime = Date.parse('2026-10-22T10:00:00Z');
  const parallelRows = buildLegacyDashboardSnapshot(parallel, { calculationTime }).productionControl.machinePlanDetailRows;
  expect(parallelRows.some(row => row.jcNo === 'WAIT-JC' && row.machine === 'WAIT-1')).toBe(false);
  expect(parallelRows.find(row => row.jcNo === 'WAIT-JC' && row.machine === 'WAIT-1B')).toMatchObject({ runningStatus: 'Running', rawActualQty: 1000 });
  expect(parallelRows.find(row => row.jcNo === 'WAIT-JC' && row.setupNo === '2')).toMatchObject({ physicalWipQty: 1000 });
  expect(parallelRows.find(row => row.jcNo === 'NEXT-JC' && row.setupNo === '1')).toMatchObject({ machine: 'WAIT-1', shopFloorTaskReady: true });
  const interrupted = buildLegacyDashboardSnapshot({ ...parallel, planOverrides: [...parallel.planOverrides,
    { target: 'WAIT-JC', setupNo: '1', fromMachine: 'WAIT-1', toMachine: 'WAIT-1B', assignmentMode: 'move', createdAt,
      interruptedSetups: [{ jobCardNumber: 'WAIT-JC', setupNumber: 1, machineNumber: 'WAIT-1', finishedQuantity: 5000 }] }],
  }, { calculationTime }).productionControl.machinePlanDetailRows;
  expect(interrupted.find(row => row.jcNo === 'WAIT-JC' && row.machine === 'WAIT-1B')).toMatchObject({ pendingGoodQty: 4000 });
  const parallelResumed = buildLegacyDashboardSnapshot({ ...parallel, dataEntries: parallel.dataEntries.map(row => row.entryType === 'work_order' && row.payload.jcNo === 'WAIT-JC'
    ? { ...row, payload: { ...row.payload, rmInwardKg: 50.22 } } : row) }, { calculationTime }).productionControl.machinePlanDetailRows;
  expect(parallelResumed.find(row => row.jcNo === 'WAIT-JC' && row.machine === 'WAIT-1')).toMatchObject({ shopFloorStage: 'planned', pendingGoodQty: 2000 });
});
