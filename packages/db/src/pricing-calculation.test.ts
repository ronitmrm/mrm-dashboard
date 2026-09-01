import { describe, expect, test } from "vitest"

import {
  calculateBomPieceWeight,
  calculateCosting,
  calculatePackageCosting,
  calculateProductBaseCost,
  calculateProductProcessCost,
  calculateStoredProductCosting,
  isForgingCostApplicable,
} from "./pricing-calculation"

const noOptionalProcess = {
  annealing: 0,
  buffing: 0,
  deburring: 0,
  marking: 0,
  plating: 0,
  sealant: 0,
}

describe("approved Pricing formulas", () => {
  test("uses blank-to-finished piece weight ratio for rod and scrap costing", () => {
    const result = calculateCosting(
      {
        ...noOptionalProcess,
        assemblyOperationCost: 0,
        burningLossPercent: 0,
        casting: 250,
        checking: 0,
        machiningCost: 0,
        overheadCost: 0,
        rejectionPercent: 0,
        washing: 0,
        weight100Pcs: 100,
      },
      {
        alloyPremium: 10,
        assembledPartInr: 0,
        conversionRate: 1,
        extCost: 20,
        forgingCost: 0,
        packingCost: 0,
        profitPercent: 0,
        purchaseTimes: 1,
        scrapRate: 100,
        shippingCost: 0,
      }
    )

    expect(result.rawMaterialCost).toBe(310)
    expect(result.scrapReturn).toBe(1.5)
    expect(result.totalRodsCost).toBe(160)
    expect(result.rateInr).toBe(16)
  })

  test("adds root packing and shipping to a direct-purchase customer price", () => {
    const result = calculateStoredProductCosting({
      baseCostPerPiece: 10,
      conversionRate: 1,
      packingCostPerKg: 60,
      piecesPerKg: 100,
      profitPercent: 0.1,
      rejectionPercent: 0.1,
      shippingCostPerKg: 6,
    })

    expect(result.packingCostPerPiece).toBeCloseTo(0.6, 10)
    expect(result.shippingCostPerPiece).toBeCloseTo(0.06, 10)
    expect(result.rejectionCost).toBeCloseTo(1, 10)
    expect(result.totalA).toBeCloseTo(11.66, 10)
    expect(result.rateInr).toBeCloseTo(12.826, 10)
  })

  test("allows forging cost only for Casting and Forging production", () => {
    expect(isForgingCostApplicable("Casting")).toBe(true)
    expect(isForgingCostApplicable(" forging ")).toBe(true)
    expect(isForgingCostApplicable("Forged")).toBe(true)
    for (const type of ["Barstock", "Moulded", "CNC", null, undefined]) {
      expect(isForgingCostApplicable(type)).toBe(false)
    }
  })

  test("derives Package and nested Assembly weight from BOM quantities", () => {
    expect(
      calculateBomPieceWeight([
        { pieceWeightGrams: 2, quantity: 2 },
        {
          components: [
            { pieceWeightGrams: 3, quantity: 1 },
            { pieceWeightGrams: 4, quantity: 2 },
          ],
          pieceWeightGrams: 999,
          quantity: 3,
        },
      ])
    ).toBe(37)
  })

  test("derives M2 and M2B Product Base cost from every product-owned process", () => {
    const m2 = calculateProductProcessCost({
      ...noOptionalProcess,
      assemblyOperationCost: 5,
      checking: 5,
      machiningCost: 0,
      overheadCost: 10,
      washing: 0,
      weight100Pcs: 15.1,
    })
    expect(m2.piecesPerKg).toBeCloseTo(66.2251655629139, 10)
    expect(m2.processCostPerKg).toBe(20)
    expect(m2.processCostPerPiece).toBeCloseTo(0.302, 10)

    expect(
      calculateProductProcessCost({
        ...noOptionalProcess,
        assemblyOperationCost: 5,
        checking: 5,
        machiningCost: 130,
        overheadCost: 10,
        washing: 5,
        weight100Pcs: 9.7,
      }).processCostPerPiece
    ).toBeCloseTo(1.5035, 10)
  })

  test("re-derives Product Base when a bulk process rate changes and rolls it into a parent", () => {
    const revisedList = calculateProductBaseCost({
      ...noOptionalProcess,
      assemblyOperationCost: 0,
      checking: 5,
      componentCostPerPiece: 0,
      isBomParent: false,
      machiningCost: 0,
      overheadCost: 0,
      pricingMethod: "Derived",
      washing: 5,
      weight100Pcs: 4.1,
    })
    expect(revisedList).toBeCloseTo(0.041, 10)

    const revisedPackage = calculateProductBaseCost({
      ...noOptionalProcess,
      assemblyOperationCost: 5,
      checking: 0,
      componentCostPerPiece: revisedList * 2,
      isBomParent: true,
      machiningCost: 0,
      overheadCost: 10,
      pricingMethod: "Derived",
      washing: 0,
      weight100Pcs: 15.1,
    })
    expect(revisedPackage).toBeCloseTo(0.3085, 10)
  })

  test("prices the M2 package process separately before adding components and converting once", () => {
    const result = calculatePackageCosting(
      {
        ...noOptionalProcess,
        assemblyOperationCost: 5,
        checking: 5,
        machiningCost: 0,
        overheadCost: 10,
        rejectionPercent: 0.02,
        washing: 0,
        weight100Pcs: 15.1,
      },
      {
        conversionRate: 94.5,
        packingCost: 10,
        profitPercent: 0.08,
        shippingCost: 6,
      },
      19.2334807312
    )
    expect(result.childQuoteTotal).toBeCloseTo(19.2334807312, 10)
    expect(result.packageProcessCostPerPiece).toBeCloseTo(0.302, 10)
    expect(result.parentPackingCostPerPiece).toBeCloseTo(0.151, 10)
    expect(result.parentShippingCostPerPiece).toBeCloseTo(0.0906, 10)
    expect(result.rejectionCost).toBeCloseTo(0.00604, 10)
    expect(result.totalRateInr).toBeCloseTo(19.8270919312, 10)
    expect(result.rateUsd).toBeCloseTo(0.20981049662645504, 10)
  })
})
