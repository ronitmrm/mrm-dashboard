import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { describe, expect, test } from "vitest"

import { BoundedResultNotice } from "./bounded-result-notice"

function render(props: Parameters<typeof BoundedResultNotice>[0]): string {
  return renderToStaticMarkup(createElement(BoundedResultNotice, props))
}

describe("BoundedResultNotice", () => {
  test("renders nothing for a complete collection", () => {
    expect(
      render({
        coverage: { limit: 200, returned: 200, truncated: false },
        section: "Enquiries",
      })
    ).toBe("")
  })

  test("names a truncated section and its complete path", () => {
    const html = render({
      actionHref: "/commercial/enquiries/register/export.xlsx",
      actionLabel: "Export the complete register",
      coverage: { limit: 200, returned: 200, truncated: true },
      section: "Enquiries",
    })

    expect(html).toContain("Enquiries: showing 200 results; more match.")
    expect(html).toContain("Download Excel")
    expect(html).toContain('data-icon="inline-start"')
    expect(html).toContain('role="status"')
  })

  test("reports search and error states accessibly", () => {
    expect(
      render({
        coverage: { limit: 50, returned: 3, truncated: false },
        searchQuery: "brass",
        section: "Product options",
      })
    ).toContain("Product options: 3 results for “brass”.")
    expect(
      render({ error: "Database unavailable", section: "Design" })
    ).toContain('role="alert"')
  })
})
