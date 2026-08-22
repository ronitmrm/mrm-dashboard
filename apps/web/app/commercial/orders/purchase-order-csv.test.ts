import { describe, expect, it } from "vitest"

import { parsePurchaseOrderCsvRows } from "./purchase-order-csv"

describe("Purchase Order CSV import", () => {
  it("builds one PO header with all CSV line items", () => {
    expect(
      parsePurchaseOrderCsvRows([
        {
          customer_uid: "C001",
          po_number: "PO-42",
          po_date: "2026-08-22",
          currency: "USD",
          line_number: "1",
          customer_part_code: "PART-A",
          description: "First part",
          quantity: "12",
          po_price: "4.5",
        },
        {
          customer_uid: "C001",
          po_number: "PO-42",
          po_date: "2026-08-22",
          currency: "USD",
          line_number: "2",
          customer_part_code: "PART-B",
          description: "Second part",
          quantity: "3",
          po_price: "9",
        },
      ])
    ).toEqual({
      currencyCode: "USD",
      customerUid: "C001",
      lines: [
        {
          currencyCode: "USD",
          customerPartCode: "PART-A",
          description: "First part",
          lineNumber: 1,
          poPrice: 4.5,
          quantity: 12,
        },
        {
          currencyCode: "USD",
          customerPartCode: "PART-B",
          description: "Second part",
          lineNumber: 2,
          poPrice: 9,
          quantity: 3,
        },
      ],
      notes: undefined,
      poDate: "2026-08-22",
      poNumber: "PO-42",
    })
  })

  it("rejects files containing more than one PO header", () => {
    expect(() =>
      parsePurchaseOrderCsvRows([
        {
          customer_uid: "C001",
          po_number: "PO-42",
          po_date: "2026-08-22",
          customer_part_code: "PART-A",
          quantity: "1",
          po_price: "2",
        },
        {
          customer_uid: "C001",
          po_number: "PO-43",
          po_date: "2026-08-22",
          customer_part_code: "PART-B",
          quantity: "1",
          po_price: "2",
        },
      ])
    ).toThrow("one purchase order")
  })
})
