import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"

import { ProductionSessionDetailActions } from "./production-session-detail-actions"

test("lets Shop Floor end an open session from its detail", () => {
  const markup = renderToStaticMarkup(
    <ProductionSessionDetailActions
      session={{ status: "open" }}
      onAction={() => {}}
    />
  )

  expect(markup).toContain("End session")
})
