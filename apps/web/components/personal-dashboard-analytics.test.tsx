import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { PersonalDashboard } from "./personal-dashboard"

describe("personal dashboard analytics", () => {
  it("renders pinned metrics, comparison charts, and calculated KPIs", () => {
    const markup = renderToStaticMarkup(
      <PersonalDashboard
        analytics={{
          version: 1,
          widgets: [
            {
              id: "ordered",
              kind: "metric",
              metricId: "commercial.ordered",
            },
            {
              id: "commercial-comparison",
              kind: "chart",
              metricIds: ["commercial.enquiries", "commercial.ordered"],
              title: "Commercial comparison",
            },
            {
              id: "conversion",
              kind: "formula",
              leftMetricId: "commercial.ordered",
              operator: "percent",
              rightMetricId: "commercial.enquiries",
              title: "Order conversion",
            },
          ],
        }}
        availableMetricIds={["commercial.enquiries", "commercial.ordered"]}
        availableWidgets={[]}
        metricValues={{
          "commercial.enquiries": 120,
          "commercial.ordered": 30,
        }}
        metrics={{}}
        onSave={async () => undefined}
        saved={false}
        selectedWidgetIds={[]}
        userName="Planner"
      />
    )

    expect(markup).toContain("My Analytics")
    expect(markup).toContain("Ordered")
    expect(markup).toContain("Commercial comparison")
    expect(markup).toContain("Order conversion")
    expect(markup).toContain("25")
    expect(markup).toContain('data-slot="chart-card"')
    expect(markup).toContain('data-slot="dashboard-bar-chart"')
  })
})
