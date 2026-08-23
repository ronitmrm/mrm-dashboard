import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { describe, expect, test } from "vitest"

const commercialRoot = fileURLToPath(new URL(".", import.meta.url))

const advertisedRoutes = [
  "drawing-history/export.xlsx/route.ts",
  "enquiries/[id]/lines/export.xlsx/route.ts",
  "enquiries/register/export.xlsx/route.ts",
  "enquiries/register/template.xlsx/route.ts",
  "masters/export.xlsx/route.ts",
  "masters/template.xlsx/route.ts",
  "masters/template.csv/route.ts",
  "orders/[id]/export.xlsx/route.ts",
  "orders/[id]/pi.xlsx/route.ts",
  "orders/master/export.xlsx/route.ts",
  "orders/pi-master/export.xlsx/route.ts",
  "orders/template.xlsx/route.ts",
  "pricing/export.xlsx/route.ts",
  "pricing/revisions/export.xlsx/route.ts",
  "sales/history/export.xlsx/route.ts",
  "sales/history/followups/export.xlsx/route.ts",
  "sales/history/sent-quotes/export.xlsx/route.ts",
  "website-products/export.xlsx/route.ts",
] as const

describe("advertised commercial exports", () => {
  test.each(advertisedRoutes)("resolves %s to a GET route", async (route) => {
    const source = await readFile(`${commercialRoot}${route}`, "utf8")
    expect(source).toContain("export async function GET")
  })

  test("uses exhaustive repository contracts for operational histories", async () => {
    const expectations = {
      "drawing-history/export.xlsx/route.ts": "listDrawingHistoryForExport",
      "orders/master/export.xlsx/route.ts":
        "listPurchaseOrderReportRowsForExport",
      "orders/pi-master/export.xlsx/route.ts":
        "listPurchaseOrderReportRowsForExport",
      "pricing/export.xlsx/route.ts": "listPricingRegisterForExport",
      "pricing/revisions/export.xlsx/route.ts": "listPricingRegisterForExport",
      "sales/history/export.xlsx/route.ts": "getSalesHistoryForExport",
      "sales/history/followups/export.xlsx/route.ts": "listFollowupsForExport",
      "sales/history/sent-quotes/export.xlsx/route.ts":
        "listSalesSentQuotesForExport",
      "website-products/export.xlsx/route.ts": "listWebsiteProductsForExport",
    } as const

    for (const [route, method] of Object.entries(expectations)) {
      const source = await readFile(`${commercialRoot}${route}`, "utf8")
      expect(source).toContain(method)
    }
  })
})
