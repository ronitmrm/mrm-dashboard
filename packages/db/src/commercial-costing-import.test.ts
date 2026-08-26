import { describe, expect, test } from "vitest"

import { mergeWorkingWorkbookCalculation } from "./commercial-costing"

describe("WORKING workbook pricing fallback", () => {
  test("fills missing Costing formulas while preserving corrected calculations", () => {
    const originalRow: unknown[] = Array.from({ length: 58 })
    originalRow[42] = 858
    originalRow[43] = 865
    originalRow[44] = 0.5685000000000001
    originalRow[54] = 11.906781175799999
    originalRow[56] = 0.12599768439999998

    expect(
      mergeWorkingWorkbookCalculation({
        calculation: { rateUsd: 11.906781175799999 / 95 },
        sourcePayload: { originalRow },
        sourceSystem: "working_xlsx",
        sourceTable: "Costing",
      })
    ).toMatchObject({
      netRateWithAlloy: 865,
      netRateWithoutAlloy: 858,
      rateInr: 11.906781175799999,
      rateUsd: 11.906781175799999 / 95,
      scrapRatePerGm: 0.5685000000000001,
    })
  })

  test("does not apply workbook columns to ordinary application quotes", () => {
    expect(
      mergeWorkingWorkbookCalculation({
        calculation: { totalA: 10 },
        sourcePayload: { originalRow: Array.from({ length: 58 }, () => 99) },
        sourceSystem: "mrm-dashboard",
        sourceTable: "Costing",
      })
    ).toEqual({ totalA: 10 })
  })
})
