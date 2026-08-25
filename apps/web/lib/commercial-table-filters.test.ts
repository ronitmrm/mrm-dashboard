import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("Costing module Excel filters", () => {
  it("keeps linked and editable business columns filterable", () => {
    const customers = source("app/commercial/customers/page.tsx")
    const pricing = source("app/commercial/pricing/pricing-table.tsx")
    const pricingPage = source("app/commercial/pricing/page.tsx")
    const quote = source("app/commercial/quotes/[id]/page.tsx")
    const quotes = source("app/commercial/quotes/page.tsx")

    for (const label of [
      "Customer Id",
      "Company",
      "Email",
      "Phone",
      "Country",
      "Status",
    ]) {
      expect(customers).toContain(
        `<TableHead data-filterable="true">${label}</TableHead>`
      )
    }
    expect(customers.match(/data-filter-value=/g)).toHaveLength(12)
    expect(quotes).toContain(
      '<TableHead data-filterable="true">Quote</TableHead>'
    )
    expect(pricing).toContain('data-filterable="true"')
    expect(pricingPage).not.toContain('aria-label="Search pricing"')
    expect(pricingPage).not.toContain('name="q"')
    expect(pricingPage).toContain("<CardTitle>Pricing</CardTitle>")
    expect(pricingPage).toContain("<PricingTable")
    expect(pricingPage).not.toContain("ProductPricingView")
    expect(pricingPage).toContain('.listPricingRegisterForExport("MRMPL")')
    expect(pricingPage).not.toContain("listPricingRegisterBounded")
    expect(pricing).toContain('className="min-h-0 flex-1 overflow-auto')
    expect(pricing).not.toContain("max-h-[70vh]")
    expect(pricing).toContain('header === "Customer Part Code"')
    expect(pricing).toContain("/commercial/pricing/revisions?customer=")
    expect(pricingPage).toContain("<CardAction>")
    expect(pricingPage).toContain(
      '<DataDownloadButton href="/commercial/pricing/export.xlsx" />'
    )
    expect(quote).toContain(
      '<TableHead data-filterable="true">Component</TableHead>'
    )
  })

  it("uses filtered tables for Sales tasks, follow-ups, and sent quotes", () => {
    const sales = source("app/commercial/sales/page.tsx")

    expect(sales).not.toContain("Export Sales History")
    expect(sales).not.toContain("Export Follow-Ups")
    expect(sales).not.toContain("Export Sent Quotes")
    expect(sales.match(/<Table excelFilters>/g)).toHaveLength(3)
    for (const label of [
      "Task",
      "Line",
      "Customer UID",
      "Status",
      "Quote Items Sent",
      "Pending Follow-Ups",
    ]) {
      expect(sales).toMatch(
        new RegExp(
          `<TableHead data-filterable="true">\\s*${label}\\s*</TableHead>`
        )
      )
    }
    expect(sales).not.toContain("Manual Follow-Up")
  })

  it("uses a one-row-per-part Drawing Register and a filtered Change Log", () => {
    const register = source("app/commercial/drawing-history/page.tsx")
    const log = source("app/commercial/drawing-history/log/page.tsx")

    expect(register).not.toContain('aria-label="Search Drawing History"')
    expect(register).not.toContain('name="q"')
    expect(register).toContain("repository.listDrawingRegister")
    expect(register).toContain("<Table excelFilters>")
    for (const label of [
      "Sr. No.",
      "Part Name",
      "Uid",
      "Drawing No.",
      "Revision",
      "Rev Date",
      "Laminated B / C / Cnc",
      "Remarks",
    ]) {
      expect(register).toMatch(
        new RegExp(
          `<TableHead data-filterable="true">\\s*${label}\\s*</TableHead>`
        )
      )
    }

    expect(log).toContain("repository.listDrawingChangeLog")
    expect(log).toContain("<Table excelFilters>")
    expect(log).toContain("Drawing Change Log")
    for (const label of [
      "Changed At",
      "Change",
      "Part Name",
      "Uid",
      "Drawing No.",
      "Revision",
      "Rev Date",
      "Laminated B / C / Cnc",
      "Remarks",
      "Changed By",
    ]) {
      expect(log).toMatch(
        new RegExp(
          `<TableHead data-filterable="true">\\s*${label}\\s*</TableHead>`
        )
      )
    }
  })
})
