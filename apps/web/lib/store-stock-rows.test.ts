import { describe, expect, it } from "vitest"

import { storeStockRows } from "./store-stock-rows"

describe("Store Stock rows", () => {
  it("separates a Non Consumable Asset Code from available and assigned units", () => {
    expect(
      storeStockRows(
        [
          {
            availableStock: "1",
            companyOnHand: "3",
            id: "compressor",
            trackingMode: "SERIALIZED" as const,
            typeCode: "NC285",
            unit: "Nos",
          },
        ],
        [
          {
            accountableStoreName: "Main Store",
            assetCode: "NC285-0001",
            holderName: "CNC-01",
            holderType: "MACHINE",
            id: "one",
            isAvailableToIssueHere: false,
            isMainAccountable: true,
            itemTypeId: "compressor",
            locationName: null,
            status: "ASSIGNED",
            supplierName: "Supplier A",
            unitPrice: "100",
          },
          {
            accountableStoreName: "Main Store",
            assetCode: "NC285-0002",
            holderName: null,
            holderType: "STORE",
            id: "two",
            isAvailableToIssueHere: true,
            isMainAccountable: true,
            itemTypeId: "compressor",
            locationName: "Main Store",
            status: "AVAILABLE",
            supplierName: "Supplier B",
            unitPrice: "120",
          },
          {
            accountableStoreName: "CNC Store",
            assetCode: "NC285-0003",
            holderName: null,
            holderType: "STORE",
            id: "three",
            isAvailableToIssueHere: false,
            isMainAccountable: false,
            itemTypeId: "compressor",
            locationName: "CNC Store",
            status: "AVAILABLE",
            supplierName: "Supplier C",
            unitPrice: "130",
          },
        ]
      ).map(
        ({
          actionItem,
          assignedQuantity,
          availableQuantity,
          companyQuantity,
          displayedCode,
          physicalUnit,
        }) => ({
          actionItem,
          assignedQuantity,
          availableQuantity,
          companyQuantity,
          displayedCode,
          supplierName: physicalUnit?.supplierName ?? null,
          unitPrice: physicalUnit?.unitPrice ?? null,
        })
      )
    ).toEqual([
      {
        actionItem: true,
        assignedQuantity: "1",
        availableQuantity: "1",
        companyQuantity: "3",
        displayedCode: "NC285",
        supplierName: null,
        unitPrice: null,
      },
      {
        actionItem: false,
        assignedQuantity: "1",
        availableQuantity: "0",
        companyQuantity: "1",
        displayedCode: "NC285-0001",
        supplierName: "Supplier A",
        unitPrice: "100",
      },
      {
        actionItem: false,
        assignedQuantity: "0",
        availableQuantity: "1",
        companyQuantity: "1",
        displayedCode: "NC285-0002",
        supplierName: "Supplier B",
        unitPrice: "120",
      },
      {
        actionItem: false,
        assignedQuantity: "0",
        availableQuantity: "0",
        companyQuantity: "1",
        displayedCode: "NC285-0003",
        supplierName: "Supplier C",
        unitPrice: "130",
      },
    ])
  })

  it("keeps a Consumable as one quantity-managed row", () => {
    expect(
      storeStockRows(
        [
          {
            availableStock: "25",
            companyOnHand: "40",
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
        assignedQuantity: "—",
        availableQuantity: "25 Ltr",
        companyQuantity: "40 Ltr",
        displayedCode: "C001",
        rowKey: "oil",
        unitId: null,
      },
    ])
  })
})
