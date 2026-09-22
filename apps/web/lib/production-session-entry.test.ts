import { calculateProductionSessionOutput } from "@workspace/db/production-session-domain"
import { describe, expect, test } from "vitest"

import { productionCrateWeightOptions } from "./production-session-entry"

describe("production session weight entry", () => {
  test("uses the selected supported crate tare when calculating pieces", () => {
    expect(productionCrateWeightOptions).toEqual([1.1, 0.9])

    const output = calculateProductionSessionOutput({
      crateCount: 1,
      crateWeightKg: productionCrateWeightOptions[0],
      grossWeightKg: 2,
      measurementMethod: "weight",
      pieceWeightGrams: 8,
      rejectedPieces: 0,
    })

    expect(output.netWeightKg).toBeCloseTo(0.9)
    expect(output.totalPieces).toBe(112)
  })
})
