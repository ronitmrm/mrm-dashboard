import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  StoreAssetWorkspacePane,
  StoreAssetWorkspaceTabs,
} from "./store-asset-workspace-tabs"

describe("StoreAssetWorkspaceTabs", () => {
  it("opens with only the compact overview visible and exposes each asset task as a tab", () => {
    const html = renderToStaticMarkup(
      createElement(
        StoreAssetWorkspaceTabs,
        { showLifecycle: true },
        createElement(
          StoreAssetWorkspacePane,
          { tab: "overview" },
          "Overview panel"
        ),
        createElement(
          StoreAssetWorkspacePane,
          { tab: "movement" },
          "Movement panel"
        )
      )
    )

    expect(html).toContain('aria-label="Asset Workspace sections"')
    expect(html).toContain("Overview")
    expect(html).toContain("Movement")
    expect(html).toContain("Maintenance")
    expect(html).toContain("Repairs")
    expect(html).toContain("Suppliers")
    expect(html).toContain("Documents")
    expect(html).toContain("Lifecycle")
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain("Overview panel")
    expect(html).not.toContain("Movement panel")
  })

  it("omits the Lifecycle tab when the user cannot manage lifecycle state", () => {
    const html = renderToStaticMarkup(
      createElement(
        StoreAssetWorkspaceTabs,
        null,
        createElement(
          StoreAssetWorkspacePane,
          { tab: "overview" },
          "Overview panel"
        )
      )
    )

    expect(html).not.toContain("Lifecycle")
  })
})
