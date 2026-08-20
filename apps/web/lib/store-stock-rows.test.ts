import { describe, expect, it } from "vitest"

import { storeStockRows } from "./store-stock-rows"

describe("Store Stock rows", () => {
  it("shows every Non Consumable Unit ID as its own searchable row", () => {
    expect(
      storeStockRows([
        {
          availableStock: "2",
          availableUnitIds: ["NC001-0001", "NC001-0002"],
          id: "chair",
          trackingMode: "SERIALIZED" as const,
          typeCode: "NC001",
          unit: "Nos",
        },
      ])
    ).toEqual([
      {
        actionItem: true,
        availableStock: "2",
        availableUnitIds: ["NC001-0001", "NC001-0002"],
        displayedQuantity: "1 physical unit",
        id: "chair",
        rowKey: "chair:NC001-0001",
        trackingMode: "SERIALIZED",
        typeCode: "NC001",
        unit: "Nos",
        unitId: "NC001-0001",
      },
      {
        actionItem: false,
        availableStock: "2",
        availableUnitIds: ["NC001-0001", "NC001-0002"],
        displayedQuantity: "1 physical unit",
        id: "chair",
        rowKey: "chair:NC001-0002",
        trackingMode: "SERIALIZED",
        typeCode: "NC001",
        unit: "Nos",
        unitId: "NC001-0002",
      },
    ])
  })

  it("keeps a Consumable as one quantity-managed row", () => {
    expect(
      storeStockRows([
        {
          availableStock: "25",
          availableUnitIds: [],
          id: "oil",
          trackingMode: "CONSUMABLE" as const,
          typeCode: "C001",
          unit: "Ltr",
        },
      ])
    ).toMatchObject([
      {
        actionItem: true,
        displayedQuantity: "25 Ltr",
        rowKey: "oil",
        unitId: null,
      },
    ])
  })
})
