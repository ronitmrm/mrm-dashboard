import { describe, expect, it } from "vitest"

import { calculateCosting } from "./costing"

const product = {
  weight100Pcs: 500,
  casting: 2,
  machiningCost: 10,
  washing: 2,
  checking: 3,
  marking: 4,
  plating: 5,
  annealing: 6,
  deburring: 7,
  buffing: 8,
  sealant: 9,
  assemblyOperationCost: 10,
  overheadCost: 11,
  rejectionPercent: 0.05,
  burningLossPercent: 0.1,
}

const quote = {
  scrapRate: 100,
  alloyPremium: 20,
  extCost: 10,
  forgingCost: 5,
  packingCost: 12,
  shippingCost: 13,
  overheadCost: 14,
  purchaseTimes: 0.5,
  profitPercent: 0.2,
  conversionRate: 80,
  assembledPartInr: 20,
}

describe("calculateCosting", () => {
  it("preserves the audited Pricing workbook calculation chain", () => {
    expect(calculateCosting(product, quote)).toEqual({
      piecesPerKg: 2,
      netRateWithoutAlloy: 115,
      netRateWithAlloy: 135,
      scrapRatePerGm: 0.115,
      rawMaterialCost: 240,
      scrapReturn: 1,
      scrapReturnPriceIncludingBurningLoss: 90,
      scrapReturnPrice: 90,
      totalRodsCost: 150,
      rejectionCost: 7.5,
      processCost: 114,
      totalA: 271.5,
      profitB: 54.300000000000004,
      totalAPlusB: 325.8,
      rateInr: 162.9,
      totalRateInr: 182.9,
      rateUsd: 2.28625,
    })
  })

  it("does not emit non-finite prices when weight or conversion is zero", () => {
    const result = calculateCosting(
      { ...product, weight100Pcs: 0 },
      { ...quote, conversionRate: 0 }
    )

    expect(result.piecesPerKg).toBe(0)
    expect(result.rateInr).toBe(0)
    expect(result.rateUsd).toBe(0)
    expect(Object.values(result).every(Number.isFinite)).toBe(true)
  })
})
