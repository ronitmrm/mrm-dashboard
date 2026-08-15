import { describe, expect, it } from "vitest"

import {
  duplicateQualityParameterCombination,
  mergeQualityInspectionParameterRows,
} from "./quality-parameter-set"

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

  it("prefers the active current parameter over a legacy duplicate", () => {
    expect(
      mergeQualityInspectionParameterRows(
        [
          {
            partNo: "M2B",
            optionNumber: "1",
            setupNo: "1",
            code: "P1",
            parameterName: "Total Length",
            specification: "20.00",
            status: "Active",
          },
        ],
        [
          {
            partNo: "M2B",
            optionNumber: "1",
            setupNo: "1",
            description: "Total Length",
            specification: "20",
          },
        ]
      )
    ).toEqual([
      expect.objectContaining({ code: "P1", parameterName: "Total Length" }),
    ])
  })
})
