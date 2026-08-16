import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { describe, expect, test } from "vitest"

import { PlannerDecisionWorkspace } from "./planner-decision-workspace"

function renderWorkspace(
  props: Partial<Parameters<typeof PlannerDecisionWorkspace>[0]> = {}
) {
  return renderToStaticMarkup(
    createElement(PlannerDecisionWorkspace, {
      activeAction: null,
      activeView: "new",
      historyCount: 7,
      pendingCount: 2,
      onActionChange: () => undefined,
      onRecalculate: () => undefined,
      onViewChange: () => undefined,
      panels: {
        history: createElement("div", null, "history-panel"),
        machineUnavailable: createElement("div", null, "machine-panel"),
        machineSwitch: createElement("div", null, "switch-panel"),
        pending: createElement("div", null, "pending-panel"),
        priority: createElement("div", null, "priority-panel"),
        routeChange: createElement("div", null, "route-panel"),
      },
      ...props,
    })
  )
}

describe("PlannerDecisionWorkspace", () => {
  test("starts with a clear action chooser instead of every planner form", () => {
    const html = renderWorkspace()

    expect(html).toContain("New Action")
    expect(html).toContain("Pending Review")
    expect(html).toContain("Decision History")
    expect(html).toContain("Change Priority")
    expect(html).toContain("Machine Unavailable")
    expect(html).toContain("Move Setup")
    expect(html).toContain("Change Route")
    expect(html).not.toContain("priority-panel")
    expect(html).not.toContain("machine-panel")
  })

  test("opens one action in a guided decision flow", () => {
    const html = renderWorkspace({ activeAction: "priority" })

    expect(html).toContain("Back to actions")
    expect(html).toContain("1. Enter Details")
    expect(html).toContain("2. Review Impact")
    expect(html).toContain("3. Confirm Decision")
    expect(html).toContain("priority-panel")
    expect(html).not.toContain("machine-panel")
    expect(html).not.toContain("route-panel")
  })

  test("separates pending decisions from decision history", () => {
    const pendingHtml = renderWorkspace({ activeView: "pending" })
    const historyHtml = renderWorkspace({ activeView: "history" })

    expect(pendingHtml).toContain("pending-panel")
    expect(pendingHtml).not.toContain("history-panel")
    expect(historyHtml).toContain("history-panel")
    expect(historyHtml).not.toContain("pending-panel")
  })
})
