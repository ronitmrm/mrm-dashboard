import { describe, expect, it } from "vitest"

import { storeItemCodeSeries, storeUnitId } from "./store-item-codes"

describe("Store Item Type code series", () => {
  it("uses independent Consumable and Non Consumable sequences", () => {
    expect(storeItemCodeSeries("CONSUMABLE")).toEqual({
      counterKey: "ITEM_TYPE_CONSUMABLE",
      prefix: "C",
    })
    expect(storeItemCodeSeries("NON_CONSUMABLE")).toEqual({
      counterKey: "ITEM_TYPE_NON_CONSUMABLE",
      prefix: "NC",
    })
  })

  it("gives each physical Non Consumable unit a four-digit identity", () => {
    expect(storeUnitId("NC001", 1)).toBe("NC001-0001")
    expect(storeUnitId("NC001", 12)).toBe("NC001-0012")
  })
})
