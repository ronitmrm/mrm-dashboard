import { describe, expect, it } from "vitest"

import { storeStockRows } from "./store-stock-rows"

describe("Store Stock rows", () => {
  it("separates a Non Consumable Asset Code from available and assigned units", () => {
    expect(
      storeStockRows(
        [
          {
            availableStock: "1",
            id: "compressor",
            trackingMode: "SERIALIZED" as const,
            typeCode: "NC285",
            unit: "Nos",
          },
        ],
        [
          {
            assetCode: "NC285-0001",
            holderName: "CNC-01",
            holderType: "MACHINE",
            id: "one",
            itemTypeId: "compressor",
            locationName: null,
            status: "ASSIGNED",
            supplierName: "Supplier A",
            unitPrice: "100",
          },
          {
            assetCode: "NC285-0002",
            holderName: null,
            holderType: "STORE",
            id: "two",
            itemTypeId: "compressor",
            locationName: "Main Store",
            status: "AVAILABLE",
            supplierName: "Supplier B",
            unitPrice: "120",
          },
        ]
      ).map(({ actionItem, displayedCode, displayedQuantity, physicalUnit }) => ({
        actionItem,
        displayedCode,
        displayedQuantity,
        supplierName: physicalUnit?.supplierName ?? null,
        unitPrice: physicalUnit?.unitPrice ?? null,
      }))
    ).toEqual([
      {
        actionItem: true,
        displayedCode: "NC285",
        displayedQuantity: "—",
        supplierName: null,
        unitPrice: null,
      },
      {
        actionItem: false,
        displayedCode: "NC285-0001",
        displayedQuantity: "—",
        supplierName: "Supplier A",
        unitPrice: "100",
      },
      {
        actionItem: false,
        displayedCode: "NC285-0002",
        displayedQuantity: "1 physical unit",
        supplierName: "Supplier B",
        unitPrice: "120",
      },
    ])
  })

  it("keeps a Consumable as one quantity-managed row", () => {
    expect(
      storeStockRows(
        [
          {
            availableStock: "25",
            id: "oil",
            trackingMode: "CONSUMABLE" as const,
            typeCode: "C001",
            unit: "Ltr",
          },
        ],
        []
      )
    ).toMatchObject([
      {
        actionItem: true,
        displayedCode: "C001",
        displayedQuantity: "25 Ltr",
        rowKey: "oil",
        unitId: null,
      },
    ])
  })
})
