import { describe, expect, it } from "vitest"

import {
  duplicateQualityParameterCombination,
  qualityInspectionReadingResult,
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

  it("uses the revised current setup without reviving legacy specifications", () => {
    expect(
      mergeQualityInspectionParameterRows(
        [
          {
            partNo: "M2B",
            optionNumber: "1",
            setupNo: "1",
            code: "P1",
            parameterName: "Total Length",
            specification: "21.00",
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

  it("classifies numeric readings by tolerance even when a saved snapshot says text", () => {
    const parameter = {
      inputType: "text",
      specification: "30.00",
      toleranceMinus: "0.25",
      tolerancePlus: "0.25",
    }

    expect(qualityInspectionReadingResult(parameter, "29.97")).toBe("OK")
    expect(qualityInspectionReadingResult(parameter, "29.70")).toBe("Not OK")
  })
})
