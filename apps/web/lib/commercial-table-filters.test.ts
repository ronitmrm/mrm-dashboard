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
})
