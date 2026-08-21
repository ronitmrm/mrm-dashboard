import { describe, expect, test } from "vitest"
import * as XLSX from "xlsx"

import {
  buildPricingWorkbook,
  pricingHeaders,
  pricingWorkbookFilename,
  toPricingViewRow,
  type PricingRegisterRow,
} from "./pricing-workbook"

const row: PricingRegisterRow = {
  calculation: {
    netRateWithAlloy: 130,
    netRateWithoutAlloy: 110,
    rateUsd: 1.25,
    totalRateInr: 100,
  },
  changeDate: new Date("2026-07-22T00:00:00.000Z"),
  companyName: "Example Customer",
  componentDepth: 0,
  componentQuantity: 1,
  currency: "USD",
  customerId: "customer-id",
  customerPartCode: "PART-1",
  customerUid: "C001",
  enquiryDescription: "Valve",
  enquiryNumber: "ENQ-1",
  id: "quote-id",
  isActive: true,
  itemType: "List",
  lifecycleStatus: "Q",
  lineNumber: 1,
  packaging: "Export",
  parentUid: null,
  product: {
    burningLossPercent: 0.03,
    description: "Valve",
    rejectionPercent: 0.05,
    uid: "Q001",
  },
  productContext: { grade: "CZ121" },
  quoteInputs: { conversionRate: 80, profitPercent: 0.2 },
  quoteNumber: "ENQ-1-Q001",
  revision: 1,
  rowKey: "quote-id:quote-id",
  sentAt: new Date("2026-07-22T01:00:00.000Z"),
  shippingTerms: "FOB",
  status: "Sent",
  uid: "Q001",
  unitPrice: 1.25,
  websiteProductDescription: "Purchased valve",
  websiteSize: "1/2 inch",
}

describe("Pricing spreadsheet workbook", () => {
  test("preserves the source sheet, filename, headers and percent display", () => {
    const view = toPricingViewRow(row)
    expect(view["Rejection %"]).toBe(5)
    expect(view["BL %"]).toBe(3)
    expect(view.Profit).toBe(20)
    expect(view.Size).toBe("1/2 inch")
    expect(view["MRMPL Product Description"]).toBe("Purchased valve")
    expect(pricingWorkbookFilename).toBe("pricing-view.xlsx")

    const workbook = buildPricingWorkbook([row])
    expect(workbook.SheetNames).toEqual(["Pricing View"])
    const sheet = workbook.Sheets["Pricing View"]!
    const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
    expect(values[0]).toEqual(pricingHeaders)
    expect(values[1]?.[pricingHeaders.indexOf("Rate / PCS In Currency")]).toBe(
      1.25
    )
  })
})
