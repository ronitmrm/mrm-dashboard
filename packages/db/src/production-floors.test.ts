import { describe, expect, it } from "vitest"

import {
  normalizeProductionFloorCode,
  productionFloors,
  productionFloorCodeForRecord,
} from "./production-floors"

describe("production floors", () => {
  it("assigns historical records to the conventional floor", () => {
    expect(productionFloorCodeForRecord({ machineNo: "C501" })).toBe(
      "conventional"
    )
  })

  it("reads a floor from direct and wrapped source payloads", () => {
    expect(
      productionFloorCodeForRecord({ productionFloorCode: "conventional-02" })
    ).toBe("conventional-02")
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

  it("exposes both conventional production departments", () => {
    expect(
      productionFloors
        .filter(({ code }) => code.startsWith("conventional"))
        .map(({ code, shortLabel }) => ({ code, shortLabel }))
    ).toEqual([
      { code: "conventional", shortLabel: "Conventional-01" },
      { code: "conventional-02", shortLabel: "Conventional-02" },
    ])
  })

  it("displays the existing CNC department as CNC-01", () => {
    expect(productionFloors.find(({ code }) => code === "cnc")).toMatchObject({
      label: "Production Planning & Control CNC-01",
      shortLabel: "CNC-01",
    })
  })
})
