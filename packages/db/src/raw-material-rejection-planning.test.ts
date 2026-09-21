import { afterEach, expect, test, vi } from "vitest"

import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"

afterEach(() => {
  vi.useRealTimers()
})

test("removes or limits plans after full and partial raw-material rejection", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-21T05:00:00.000Z"))

  const createdAt = "2026-09-21T05:00:00.000Z"
  const entry = (entryType: string, payload: Record<string, unknown>) => ({
    entryType,
    payload,
    createdAt,
  })
  const baseInput: Parameters<typeof buildLegacyDashboardSnapshot>[0] = {
    productionFloorCode: "cnc",
    workbookName: "PostgreSQL",
    productionEntries: [],
    rawMaterialRejections: [],
    dataEntries: [
      entry("work_order", {
        jcNo: "RM-REJECT-JC",
        partCode: "RM-REJECT-PART",
        optionNumber: "1",
        orderKg: 100,
        orderPcs: 9_900,
      }),
      entry("rm_inward", {
        jcNo: "RM-REJECT-JC",
        partCode: "RM-REJECT-PART",
        rmInwardDate: "2026-09-21",
        rmInwardKg: 100,
      }),
      ...["1", "2", "3"].flatMap((setupNo) => [
        entry("route", {
          partNo: "RM-REJECT-PART",
          optionNumber: "1",
          setupNo,
          machineType: "CNC",
          machineFamily: `RM-REJECT-${setupNo}`,
        }),
        entry("cycle", {
          partNo: "RM-REJECT-PART",
          optionNumber: "1",
          setupNo,
          cycleTime: 180,
        }),
        entry("tooling", {
          partNo: "RM-REJECT-PART",
          optionNumber: "1",
          setupNo,
        }),
        entry("machine_master", {
          machineNo: `CNC-RM-${setupNo}`,
          machineType: "CNC",
          machineFamily: `RM-REJECT-${setupNo}`,
          status: "Active",
        }),
      ]),
    ],
  }
  const planningControl = (
    rejectedKg: number,
    planningAction: "continue_accepted_quantity" | "wait_for_replacement",
    options: { producedSetupOne?: number; replacementKg?: number } = {}
  ) => {
    const replacement = options.replacementKg
      ? [
          entry("rm_inward", {
            jcNo: "RM-REJECT-JC",
            partCode: "RM-REJECT-PART",
            rmInwardDate: "2026-09-22",
            rmInwardKg: options.replacementKg,
          }),
        ]
      : []
    const productionEntries = options.producedSetupOne
      ? [
          {
            jobCard: "RM-REJECT-JC",
            partCode: "RM-REJECT-PART",
            setupNo: "1",
            machine: "CNC-RM-1",
            machineType: "CNC",
            operatorId: "OP-1",
            prodDate: "2026-09-21",
            outputQty: options.producedSetupOne,
            actualQty: options.producedSetupOne,
            rejectQty: 0,
            targetQty: 9_900,
          },
        ]
      : []
    const control = buildLegacyDashboardSnapshot({
      ...baseInput,
      productionEntries,
      rawMaterialRejections: [
        {
          jcNo: "RM-REJECT-JC",
          rejectedKg,
          planningAction,
          status: "Active",
          createdAt,
        },
      ],
      dataEntries: [...(baseInput.dataEntries ?? []), ...replacement],
    }).productionControl
    if (!("machinePlanDetailRows" in control)) throw new Error("Missing plan")
    return control
  }
  const planRows = (
    rejectedKg: number,
    planningAction: "continue_accepted_quantity" | "wait_for_replacement",
    options: { producedSetupOne?: number; replacementKg?: number } = {}
  ) => planningControl(rejectedKg, planningAction, options).machinePlanDetailRows.filter(
      (row) => row.jcNo === "RM-REJECT-JC"
    )

  expect(planRows(100, "wait_for_replacement")).toEqual([])
  expect(
    planRows(100, "wait_for_replacement", { producedSetupOne: 1_000 })
  ).toEqual([])

  const estimated = planRows(50, "continue_accepted_quantity")
  expect(estimated.find((row) => row.setupNo === "1")).toMatchObject({
    totalOrderPcs: 4_950,
    pendingGoodQty: 4_950,
  })
  const continued = planRows(50, "continue_accepted_quantity", {
    producedSetupOne: 5_000,
  })
  expect(continued.find((row) => row.setupNo === "1")).toMatchObject({
    totalOrderPcs: 5_000,
    pendingGoodQty: 0,
    rmRejectedKg: 50,
    rmUsableKg: 50,
  })
  expect(continued.find((row) => row.setupNo === "2")).toMatchObject({
    totalOrderPcs: 5_000,
  })
  expect(
    planningControl(50, "continue_accepted_quantity", {
      producedSetupOne: 5_000,
    }).productionDashboardRows.find((row) => row.jcNo === "RM-REJECT-JC")
  ).toMatchObject({
    currentProbableDispatchDate: "7-Oct-26",
  })
  expect(planRows(99.9999, "continue_accepted_quantity")).toEqual([])

  expect(
    planRows(50, "wait_for_replacement", { producedSetupOne: 5_000 })
  ).toEqual([])

  const restored = planRows(50, "wait_for_replacement", {
    producedSetupOne: 5_000,
    replacementKg: 50,
  })
  expect(restored.find((row) => row.setupNo === "1")).toMatchObject({
    totalOrderPcs: 9_900,
    rmRejectedKg: 50,
    rmUsableKg: 100,
    rmReplanRequired: true,
    rmReplanDate: "22-Sept-26",
    setupPlannedDate: "22-Sept-26",
    plannedProductionStartDate: "22-Sept-26",
    actualProductionStartDate: "21-Sept-26",
  })
  expect(restored.find((row) => row.setupNo === "2")).toMatchObject({
    totalOrderPcs: 9_900,
    rmReplanRequired: false,
    setupPlannedDate: "23-Sept-26",
  })
})
