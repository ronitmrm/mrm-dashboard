import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"

import { ProductionSessionDetailActions } from "./production-session-detail-actions"
import { sessionTimelineDetail } from "../lib/production-session-timeline"

test("lets Shop Floor end an open session from its detail", () => {
  const markup = renderToStaticMarkup(
    <ProductionSessionDetailActions
      session={{ status: "open" }}
      onAction={() => {}}
    />
  )

  expect(markup).toContain("End session")
})

test("shows the selected close reason in the session timeline", () => {
  expect(sessionTimelineDetail({
    eventType: "session_closed",
    reasonCode: "item_complete",
    reasonName: "Production session closed",
  })).toBe("End reason: Item Complete")
})
