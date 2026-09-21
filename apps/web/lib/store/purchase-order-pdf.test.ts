import { PDFDocument } from "pdf-lib"
import { describe, expect, test } from "vitest"

import {
  buildStorePurchaseOrderPdf,
  formatPurchaseOrderDate,
  purchaseOrderAmountInWords,
} from "./purchase-order-pdf"

describe("Store Purchase Order PDF", () => {
  test("formats the reference PO date and Indian amount in words", () => {
    expect(formatPurchaseOrderDate("2026-04-02")).toBe("02 April 2026")
    expect(purchaseOrderAmountInWords(5253)).toBe(
      "FIVE THOUSAND TWO HUNDRED FIFTY THREE"
    )
  })

  test("creates a priced multi-line supplier Purchase Order document", async () => {
    const bytes = await buildStorePurchaseOrderPdf({
      lines: [
        {
          itemName: "Cutting Oil",
          orderedQuantity: "10",
          typeCode: "C001",
          unit: "Ltr",
          unitPrice: "125.00",
        },
        {
          itemName: "Safety Gloves",
          orderedQuantity: "5",
          typeCode: "NC001",
          unit: "Pairs",
          unitPrice: "80.00",
        },
      ],
      orderDate: "2026-08-17",
      orderNumber: "STR-PO-2026-000001",
      supplierCode: "SUP-001",
      supplierName: "Approved Industrial Supplier",
    })

    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF")
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getTitle()).toBe("STR-PO-2026-000001 Purchase Order")
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getSubject()).toBe("Branded Store Purchase Order")
    expect(pdf.getCreator()).toBe("MRM Dashboard")
    expect(pdf.getPageCount()).toBe(1)
  })
})
