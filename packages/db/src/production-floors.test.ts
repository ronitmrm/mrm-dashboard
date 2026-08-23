import { describe, expect, it } from "vitest"

import {
  normalizeProductionFloorCode,
  parseProductionFloorCode,
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

  it("parses Machine Master production-unit names without silently changing units", () => {
    expect(parseProductionFloorCode("PPAC Conventional-01")).toBe(
      "conventional"
    )
    expect(
      parseProductionFloorCode("Production Planning & Control Conventional-01")
    ).toBe("conventional")
    expect(
      parseProductionFloorCode("Prduction Planning & Control Conventional-02")
    ).toBe("conventional-02")
    expect(parseProductionFloorCode("CNC-01")).toBe("cnc")
    expect(
      parseProductionFloorCode("Production Planning & Control Forging")
    ).toBe("forging")
    expect(parseProductionFloorCode("unknown unit")).toBeNull()
  })

  it("exposes both conventional production departments", () => {
    expect(
      productionFloors
        .filter(({ code }) => code.startsWith("conventional"))
        .map(({ code, label, shortLabel }) => ({ code, label, shortLabel }))
    ).toEqual([
      {
        code: "conventional",
        label: "PPAC Conventional-01",
        shortLabel: "Conventional-01",
      },
      {
        code: "conventional-02",
        label: "PPAC Conventional-02",
        shortLabel: "Conventional-02",
      },
    ])
  })

  it("displays the existing CNC department as CNC-01", () => {
    expect(productionFloors.find(({ code }) => code === "cnc")).toMatchObject({
      label: "PPAC CNC-01",
      shortLabel: "CNC-01",
    })
  })

  it("uses the PPAC title for Forging", () => {
    expect(
      productionFloors.find(({ code }) => code === "forging")
    ).toMatchObject({
      label: "PPAC Forging",
      shortLabel: "Forging",
    })
  })
})
