import { describe, expect, it } from "vitest";

import { productionPieceWeightGrams } from "./production-session-entry";

describe("productionPieceWeightGrams", () => {
  it("falls back to the setup stage weight when operation weight is zero", () => {
    expect(productionPieceWeightGrams({
      operationWeight: 0,
      stageWeight: 15.4,
    })).toBe(15.4);
  });

  it("prefers a positive operation weight", () => {
    expect(productionPieceWeightGrams({
      operationWeight: 15.1,
      stageWeight: 15.4,
    })).toBe(15.1);
  });
});
