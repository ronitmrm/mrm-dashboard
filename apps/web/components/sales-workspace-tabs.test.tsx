import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SalesWorkspaceTabs } from "./sales-workspace-tabs"

describe("Sales workspace tabs", () => {
  it.each([
    ["tasks", "/commercial/sales/history/export.xlsx"],
    ["followup-history", "/commercial/sales/history/followups/export.xlsx"],
    ["sent-quotes", "/commercial/sales/history/sent-quotes/export.xlsx"],
  ] as const)("offers the %s workbook at the right of the tabs", (view, href) => {
    const html = renderToStaticMarkup(<SalesWorkspaceTabs activeView={view} />)

    expect(html).toContain('aria-label="Sales views"')
    expect(html).toContain(`href="${href}"`)
    expect(html).toContain("Download Excel")
    expect(html.indexOf('aria-label="Sales views"')).toBeLessThan(
      html.indexOf("Download Excel")
    )
  })
})
