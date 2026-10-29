import { expect, test } from "vitest"
import { weightBatchCycleTimeSeconds } from "./production-cycle"

test("requires positive batch capacity, time and Route Master weight", () => {
  expect(() => weightBatchCycleTimeSeconds({
    batchWeightKg: 0, batchTimeMinutes: 20, pieceWeightGrams: 200,
  })).toThrow("Batch weight")
  expect(() => weightBatchCycleTimeSeconds({
    batchWeightKg: 100, batchTimeMinutes: 0, pieceWeightGrams: 200,
  })).toThrow("Batch time")
  expect(() => weightBatchCycleTimeSeconds({
    batchWeightKg: 100, batchTimeMinutes: 20, pieceWeightGrams: 0,
  })).toThrow("Stage Weight")
})
