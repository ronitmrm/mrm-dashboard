import { describe, expect, it } from "vitest"

import { qualityReadingValue } from "./quality"

describe("qualityReadingValue", () => {
  it("reopens stored pass/fail booleans as the form values", () => {
    expect(
      qualityReadingValue({
        booleanValue: true,
        numericValue: null,
        textValue: null,
      })
    ).toBe("OK")
    expect(
      qualityReadingValue({
        booleanValue: false,
        numericValue: null,
        textValue: null,
      })
    ).toBe("Not OK")
  })
})
