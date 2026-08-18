import { describe, expect, it } from "vitest"

import { storeItemCodeSeries } from "./store-item-codes"

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
})
