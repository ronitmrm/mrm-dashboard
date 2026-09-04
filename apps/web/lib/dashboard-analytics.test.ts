import { describe, expect, it } from "vitest"

import {
  addMetricToDashboard,
  dashboardMetricIdsForWidgets,
  evaluateDashboardFormula,
  resolveDashboardAnalyticsConfiguration,
} from "./dashboard-analytics"

describe("dashboard analytics", () => {
  it("keeps only authorized, valid analytics widgets", () => {
    const configuration = resolveDashboardAnalyticsConfiguration(
      {
        version: 1,
        widgets: [
          {
            id: "metric-commercial",
            kind: "metric",
            metricId: "commercial.pending-costing",
          },
          {
            id: "metric-store",
            kind: "metric",
            metricId: "store.low-stock",
          },
          {
            id: "invalid",
            kind: "metric",
            metricId: "system.secret-value",
          },
        ],
      },
      ["commercial.pending-costing"]
    )

    expect(configuration).toEqual({
      version: 1,
      widgets: [
        {
          id: "metric-commercial",
          kind: "metric",
          metricId: "commercial.pending-costing",
        },
      ],
    })
  })

  it("pins a metric once without disturbing the user's existing order", () => {
    const first = addMetricToDashboard(
      {
        version: 1,
        widgets: [
          {
            id: "metric-commercial-ordered",
            kind: "metric",
            metricId: "commercial.ordered",
          },
        ],
      },
      "store.low-stock",
      ["commercial.ordered", "store.low-stock"]
    )
    const second = addMetricToDashboard(first, "store.low-stock", [
      "commercial.ordered",
      "store.low-stock",
    ])

    expect(second.widgets.map((widget) => widget.id)).toEqual([
      "metric-commercial-ordered",
      "metric:store.low-stock",
    ])
  })

  it("evaluates structured calculated KPIs and reports an undefined ratio", () => {
    const values = {
      "commercial.ordered": 30,
      "commercial.enquiries": 120,
      "store.low-stock": 0,
    } as const

    expect(
      evaluateDashboardFormula(
        {
          id: "conversion",
          kind: "formula",
          leftMetricId: "commercial.ordered",
          operator: "percent",
          rightMetricId: "commercial.enquiries",
          title: "Order conversion",
        },
        values
      )
    ).toEqual({ format: "percent", ok: true, value: 25 })

    expect(
      evaluateDashboardFormula(
        {
          id: "unsafe-ratio",
          kind: "formula",
          leftMetricId: "commercial.ordered",
          operator: "percent",
          rightMetricId: "store.low-stock",
          title: "Unsafe ratio",
        },
        values
      )
    ).toEqual({ error: "The divisor is zero", ok: false })
  })

  it("rejects formulas that combine unavailable metrics", () => {
    const configuration = resolveDashboardAnalyticsConfiguration(
      {
        version: 1,
        widgets: [
          {
            id: "conversion",
            kind: "formula",
            leftMetricId: "commercial.ordered",
            operator: "percent",
            rightMetricId: "commercial.enquiries",
            title: "Order conversion",
          },
        ],
      },
      ["commercial.ordered"]
    )

    expect(configuration.widgets).toEqual([])
  })

  it("builds a comparison chart from two or more authorized metrics", () => {
    const configuration = resolveDashboardAnalyticsConfiguration(
      {
        version: 1,
        widgets: [
          {
            id: "commercial-chart",
            kind: "chart",
            metricIds: [
              "commercial.ordered",
              "system.secret-value",
              "commercial.enquiries",
              "commercial.ordered",
            ],
            title: "  Commercial   comparison  ",
          },
          {
            id: "incomplete-chart",
            kind: "chart",
            metricIds: ["commercial.ordered", "store.low-stock"],
            title: "Unavailable comparison",
          },
        ],
      },
      ["commercial.ordered", "commercial.enquiries"]
    )

    expect(configuration.widgets).toEqual([
      {
        id: "commercial-chart",
        kind: "chart",
        metricIds: ["commercial.ordered", "commercial.enquiries"],
        title: "Commercial comparison",
      },
    ])
  })

  it("collects every source metric needed to render the selected analytics", () => {
    expect(
      dashboardMetricIdsForWidgets([
        {
          id: "ordered",
          kind: "metric",
          metricId: "commercial.ordered",
        },
        {
          id: "conversion",
          kind: "formula",
          leftMetricId: "commercial.ordered",
          operator: "percent",
          rightMetricId: "commercial.enquiries",
          title: "Conversion",
        },
        {
          id: "store-attention",
          kind: "chart",
          metricIds: ["store.open-requests", "store.low-stock"],
          title: "Store attention",
        },
      ])
    ).toEqual([
      "commercial.ordered",
      "commercial.enquiries",
      "store.open-requests",
      "store.low-stock",
    ])
  })
})
