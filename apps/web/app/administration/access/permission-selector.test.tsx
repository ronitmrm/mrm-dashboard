import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { PermissionSelector } from "./permission-selector"

describe("PermissionSelector", () => {
  it("offers main-module and sub-module navigation before page or task access", () => {
    const markup = renderToStaticMarkup(
      <PermissionSelector
        permissions={[
          {
            key: "operations.floors.conventional.planner_actions.read",
            module: "operations",
            name: "View PPAC Conventional-01 Planner Actions",
          },
        ]}
      />
    )

    expect(markup).toContain('aria-label="Filter by main module"')
    expect(markup).toContain('aria-label="Filter by sub module"')
    expect(markup).toContain("Main Module")
    expect(markup).toContain("Sub Module")
    expect(markup).toContain("PPAC Conventional-01")
    expect(markup).toContain("Planner Actions")
  })
})
