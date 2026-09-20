import { describe, expect, test } from "vitest"

import { serializedAllocationSelections } from "./bulk-allocation-selection"

describe("serialized allocation selections", () => {
  test("preselects distinct Unit IDs for quantity-one lines and preserves an operator change", () => {
    const lines = ["REQUEST-1", "REQUEST-2"].map((id) => ({
      availableUnitIds: ["NC001-01", "NC001-02"],
      id,
      itemTypeId: "NC001",
      remainingQuantity: 1,
      trackingMode: "SERIALIZED" as const,
    }))

    expect(serializedAllocationSelections(lines, {})).toEqual({
      "REQUEST-1:0": "NC001-01",
      "REQUEST-2:0": "NC001-02",
    })
    expect(
      serializedAllocationSelections(lines, {
        "REQUEST-1:0": "NC001-02",
      })
    ).toEqual({
      "REQUEST-1:0": "NC001-02",
      "REQUEST-2:0": "NC001-01",
    })
  })
})
