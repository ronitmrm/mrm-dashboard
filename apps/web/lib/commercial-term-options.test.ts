import { describe, expect, it } from "vitest"

import { commercialTermOptions } from "./commercial-term-options"
import { currencyCodes } from "./currencies"

describe("commercial term options", () => {
  it("uses built-in currencies while retaining active database masters for other terms", () => {
    const options = commercialTermOptions([
      { active: true, name: "FOB", termType: "incoterms" },
      { active: false, name: "CIF", termType: "incoterms" },
      { active: true, name: "Legacy Currency", termType: "currency" },
    ])

    expect(options.incoterms).toEqual(["FOB"])
    expect(options.currency).toEqual(currencyCodes)
    expect(options.currency).not.toContain("Legacy Currency")
  })
})
