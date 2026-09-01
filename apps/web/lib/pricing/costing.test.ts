import { describe, expect, it } from "vitest"

import { calculateCosting } from "./costing"

const product = {
  weight100Pcs: 500,
  casting: 1000,
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
      processCost: 100,
      totalA: 257.5,
      profitB: 51.5,
      totalAPlusB: 309,
      rateInr: 154.5,
      totalRateInr: 174.5,
      rateUsd: 2.18125,
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
