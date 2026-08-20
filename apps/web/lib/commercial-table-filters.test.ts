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
    expect(pricing).toMatch(
      /data-filterable=\{\s*header === "Customer Part Code" \? "true" : undefined\s*\}/
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
})
