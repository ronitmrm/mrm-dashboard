import { describe, expect, it } from "vitest"

import {
  normalizeProductionFloorCode,
  productionFloorCodeForRecord,
} from "./production-floors"

describe("production floors", () => {
  it("assigns historical records to the conventional floor", () => {
    expect(productionFloorCodeForRecord({ machineNo: "C501" })).toBe(
      "conventional"
    )
  })

  it("reads a floor from direct and wrapped source payloads", () => {
    expect(productionFloorCodeForRecord({ productionFloorCode: "cnc" })).toBe(
      "cnc"
    )
    expect(
      productionFloorCodeForRecord({
        payload: { productionFloorCode: "forging" },
      })
    ).toBe("forging")
  })

  it("normalizes unsupported floor values to conventional", () => {
    expect(normalizeProductionFloorCode("unknown")).toBe("conventional")
  })
})
