import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

function source(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8")
}

describe("shared software card tone", () => {
  it("uses the compact shared card radius and metric card style", () => {
    const card = source("../../../packages/ui/src/components/card.tsx")

    expect(card).toContain('data-slot="metric-card"')
    expect(card).toContain("rounded-lg")
    expect(card).not.toContain("rounded-4xl")
  })

  it("reuses the metric card across Production, HR, and Commercial", () => {
    const production = source("./mrmpl-dashboard.tsx")

    expect(production).toContain("<MetricCard")
    expect(production).not.toContain("rounded-4xl")
    expect(source("./hr/interview-workspace.tsx")).toContain("<MetricCard")
    expect(source("../app/hr/page.tsx")).toContain("<MetricCard")
    expect(source("../app/hr/jobs/[id]/page.tsx")).toContain("<MetricCard")
    expect(source("../app/commercial/page.tsx")).toContain("<MetricCard")
    expect(source("../app/commercial/quotes/[id]/page.tsx")).toContain(
      "<MetricCard"
    )
    expect(source("./commercial/costing-calculator.tsx")).toContain(
      "<MetricCard"
    )

    const toolFixturePanel = production.slice(
      production.indexOf("function ToolFixturePanel"),
      production.indexOf("type LegacyField")
    )
    expect(toolFixturePanel).toContain("<MetricCard")
  })
})
