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

describe("historical quote PDF", () => {
  test("preserves parsed live rates through injected adapters", async () => {
    const context = await loadQuoteMarketContext(
      { currency: "USD", fallbackRate: 83.25 },
      {
        async fetchJson() {
          return { rates: { INR: 84.123 } }
        },
        async fetchText() {
          return [
            "Official LME-Prices",
            "Copper 9,100.00 9,200.00",
            "Zinc 2,700.00 2,800.00",
            "LME Stocks",
          ].join("\n")
        },
      }
    )
    expect(context).toEqual({
      copper: "9,200.00",
      forex: { label: "USD/INR Forex Rate", value: "84.12" },
      zinc: "2,800.00",
    })
  })

  test("falls back without blocking PDF generation", async () => {
    const context = await loadQuoteMarketContext(
      { currency: "USD", fallbackRate: 83.25 },
      {
        async fetchJson() {
          throw new Error("offline")
        },
        async fetchText() {
          throw new Error("offline")
        },
      }
    )
    expect(context).toEqual({
      copper: "-",
      forex: { label: "USD/INR Forex Rate", value: "83.25" },
      zinc: "-",
    })
    const bytes = await buildQuotePdf(document, context)
    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF")
  })
})
