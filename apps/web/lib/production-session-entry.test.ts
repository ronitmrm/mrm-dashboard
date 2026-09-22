import { calculateProductionSessionOutput } from "@workspace/db/production-session-domain"
import { describe, expect, test } from "vitest"

import { productionGrossWeightKg } from "./production-session-entry"

describe("production session weight entry", () => {
  test("adds crate tare to entered produced weight before calculating pieces", () => {
    const grossWeightKg = productionGrossWeightKg({
      crateCount: 1,
      crateWeightKg: 2,
      producedWeightKg: 2,
    })

    expect(calculateProductionSessionOutput({
      crateCount: 1,
      crateWeightKg: 2,
      grossWeightKg,
      measurementMethod: "weight",
      pieceWeightGrams: 8,
      rejectedPieces: 0,
    })).toMatchObject({
      netWeightKg: 2,
      totalPieces: 250,
    })
  })
})
