import { describe, expect, test } from "vitest"

import {
  calculateBomPieceWeight,
  calculatePackageCosting,
  calculateProductBaseCost,
  calculateProductProcessCost,
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
  test("allows forging cost only for Casting and Forging production", () => {
    expect(isForgingCostApplicable("Casting")).toBe(true)
    expect(isForgingCostApplicable(" forging ")).toBe(true)
    for (const type of ["Barstock", "Moulded", "Package", null, undefined]) {
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
