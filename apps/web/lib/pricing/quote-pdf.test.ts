import { describe, expect, test } from "vitest"

import {
  buildQuotePdf,
  loadQuoteMarketContext,
  type QuoteDocument,
} from "./quote-pdf"

const document: QuoteDocument = {
  companyName: "Fixture Customer",
  conversionRate: 83.25,
  currency: "USD",
  customerUid: "10001",
  enquiryNumber: "ENQ-100",
  incoterms: "FOB",
  lines: [
    {
      customerPartCode: "PART-1",
      description: "Fixture part",
      lineNumber: 1,
      price: 1.2345,
      quantity: 100,
      quoteNumber: "ENQ-100",
      revision: 2,
      sentAt: new Date("2026-07-22T00:00:00.000Z"),
      status: "Sent",
    },
  ],
  packagingTerms: "Export",
  paymentTerms: "Net 30",
  revision: 2,
  shipmentMode: "Sea",
  terms: [{ label: "Reports", sortOrder: 1, value: "MTC on request." }],
}

describe("quotation PDF rates", () => {
  test("uses Westmetall three-month prices and the enquiry exchange rate", async () => {
    const context = await loadQuoteMarketContext(
      { currency: "USD", conversionRate: 83.251234 },
      {
        async fetchText() {
          return [
            '<table><tr><th>Official LME-Prices in US Dollar</th><th>08. September 2026</th></tr>',
            '<tr><td>USD per ton</td><td>Settlement Kasse</td><td>3 months</td></tr>',
            '<tr><td>Copper</td><td>9,100.00</td><td><a>9,200.00</a></td></tr>',
            '<tr><td>Zinc</td><td>2,700.00</td><td><a>2,800.00</a></td></tr></table>',
            '<table><tr><td>LME Stocks</td></tr><tr><td>Copper</td><td>999,999.00</td></tr></table>',
          ].join("\n")
        },
      }
    )
    expect(context).toEqual({
      copper: "9,200.00",
      publishedOn: "08. September 2026",
      forex: { label: "USD/INR Exchange Rate", value: "83.251234" },
      zinc: "2,800.00",
    })
    const bytes = await buildQuotePdf(document, context)
    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF")
  })

  test("blocks generation when Westmetall is unavailable", async () => {
    await expect(loadQuoteMarketContext(
      { currency: "USD", conversionRate: 83.25 },
      {
        async fetchText() {
          throw new Error("offline")
        },
      }
    )).rejects.toThrow("Westmetall prices are unavailable")
  })
})
