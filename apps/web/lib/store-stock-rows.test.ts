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
            storageLocations: "Main Store",
            trackingMode: "SERIALIZED" as const,
            typeCode: "NC285",
            unit: "No.",
          },
        ],
        [
          {
            accountableStoreName: "Main Store",
            assetCode: "NC285-0001",
            holderName: "CNC-01",
            holderReference: "CNC-01",
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
            holderReference: "MAIN",
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
            holderReference: "CNC",
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
          locationHolder,
          physicalUnit,
        }) => ({
          actionItem,
          assignedQuantity,
          availableQuantity,
          companyQuantity,
          displayedCode,
          locationHolder,
          supplierName: physicalUnit?.supplierName ?? null,
          unitPrice: physicalUnit?.unitPrice ?? null,
        })
      )
    ).toEqual([
      {
        actionItem: true,
        assignedQuantity: "1 No.",
        availableQuantity: "1 No.",
        companyQuantity: "3 No.",
        displayedCode: "NC285",
        locationHolder: "—",
        supplierName: null,
        unitPrice: null,
      },
      {
        actionItem: false,
        assignedQuantity: "1 No.",
        availableQuantity: "0 No.",
        companyQuantity: "1 No.",
        displayedCode: "NC285-0001",
        locationHolder: "CNC-01",
        supplierName: "Supplier A",
        unitPrice: "100",
      },
      {
        actionItem: false,
        assignedQuantity: "0 No.",
        availableQuantity: "1 No.",
        companyQuantity: "1 No.",
        displayedCode: "NC285-0002",
        locationHolder: "Main Store",
        supplierName: "Supplier B",
        unitPrice: "120",
      },
      {
        actionItem: false,
        assignedQuantity: "0 No.",
        availableQuantity: "0 No.",
        companyQuantity: "1 No.",
        displayedCode: "NC285-0003",
        locationHolder: "CNC Store",
        supplierName: "Supplier C",
        unitPrice: "130",
      },
    ])
  })

  it("shows a Consumable location only when Main Store has stock", () => {
    expect(
      storeStockRows(
        [
          {
            availableStock: "25",
            companyOnHand: "40",
            id: "oil",
            storageLocations: "Main Store",
            trackingMode: "CONSUMABLE" as const,
            typeCode: "C001",
            unit: "Ltr",
          },
          {
            availableStock: "0",
            companyOnHand: "15",
            id: "inserts",
            storageLocations: "Not in stock",
            trackingMode: "CONSUMABLE" as const,
            typeCode: "C002",
            unit: "Nos",
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
        locationHolder: "Main Store",
        rowKey: "oil",
        unitId: null,
      },
      {
        displayedCode: "C002",
        locationHolder: "—",
        rowKey: "inserts",
        unitId: null,
      },
    ])
  })
})
