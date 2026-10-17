import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"

import { ProductionSessionDetailActions } from "./production-session-detail-actions"
import { sessionTimelineDetail } from "../lib/production-session-timeline"

test("offers accident reporting on an open session", () => {
  const markup = renderToStaticMarkup(
    <ProductionSessionDetailActions
      session={{ status: "open", measurementMethod: "counter" }}
      onAction={() => {}}
    />
  )

  expect(markup).toContain("End session")
  expect(markup).toContain("Record accident")
  expect(markup).toContain("Correct start date / time")
  expect(markup).toContain("Correct start count")
  expect(renderToStaticMarkup(<ProductionSessionDetailActions session={{ status: "closed", measurementMethod: "counter" }} onAction={() => {}} />)).toContain("Correct start count")
  expect(renderToStaticMarkup(<ProductionSessionDetailActions session={{ status: "closed", measurementMethod: "weight" }} onAction={() => {}} />)).not.toContain("Correct start count")
})

test("shows the close reason and downtime end time in the session timeline", () => {
  expect(sessionTimelineDetail({
    eventType: "session_closed",
    reasonCode: "item_complete",
    reasonName: "Production session closed",
  })).toBe("End reason: Item Complete")
  expect(sessionTimelineDetail({
    eventType: "downtime", reasonName: "No Electricity",
    startedAt: "2026-10-15T12:39:00Z", endedAt: "2026-10-15T17:00:00Z",
  })).toBe("No Electricity · End: 15 Oct 2026, 22:30 IST")
})
