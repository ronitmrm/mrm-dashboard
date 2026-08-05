import { describe, expect, it } from "vitest"

import { productionModuleIsEnabled } from "./production-module"

describe("productionModuleIsEnabled", () => {
  it("keeps Production disabled unless it is explicitly enabled", () => {
    expect(productionModuleIsEnabled({})).toBe(false)
    expect(
      productionModuleIsEnabled({ PRODUCTION_MODULE_ENABLED: "false" })
    ).toBe(false)
  })

  it("accepts explicit enabled values", () => {
    expect(
      productionModuleIsEnabled({ PRODUCTION_MODULE_ENABLED: "true" })
    ).toBe(true)
    expect(
      productionModuleIsEnabled({ PRODUCTION_MODULE_ENABLED: "1" })
    ).toBe(true)
  })
})
