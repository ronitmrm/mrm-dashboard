import { describe, expect, it } from "vitest"
import { isMeasuringInstrumentCategory } from "./iso-documents"

describe("Measuring Instrument Register", () => {
  it("includes instrument categories and excludes unrelated Store categories", () => {
    expect(isMeasuringInstrumentCategory("Measuring Instrument")).toBe(true)
    expect(isMeasuringInstrumentCategory(" measuring   INSTRUMENTS ")).toBe(
      true
    )
    expect(isMeasuringInstrumentCategory("Cutting Tools")).toBe(false)
  })
})
