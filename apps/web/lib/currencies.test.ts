import { describe, expect, it } from "vitest"

import { currencyCodes } from "./currencies"

describe("built-in currency catalog", () => {
  it("provides the complete unique currency-code list used by dropdowns", () => {
    expect(currencyCodes).toHaveLength(162)
    expect(new Set(currencyCodes).size).toBe(currencyCodes.length)
    expect(currencyCodes).toContain("AED")
    expect(currencyCodes).toContain("EUR")
    expect(currencyCodes).toContain("INR")
    expect(currencyCodes).toContain("USD")
    expect(currencyCodes).toContain("ZWG")
  })
})
