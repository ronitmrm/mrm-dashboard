import { describe, expect, it } from "vitest"

import { duplicateQualityParameterCombination } from "./quality-parameter-set"

describe("quality inspection parameter sets", () => {
  it("rejects a repeated parameter and specification in one setup", () => {
    expect(
      duplicateQualityParameterCombination([
        { parameterName: "Total Length", specification: "20.00" },
        { parameterName: " total length ", specification: "20.00" },
      ])
    ).toEqual({ parameterName: "total length", specification: "20.00" })

    expect(
      duplicateQualityParameterCombination([
        { parameterName: "Total Length", specification: "20.00" },
        { parameterName: "Total Length", specification: "21.00" },
      ])
    ).toBeUndefined()
  })
})
