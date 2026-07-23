import { describe, expect, it } from "vitest"

import { commercialNavigationAccess } from "./auth/commercial-capabilities"
import {
  administrationNavigation,
  commercialNavigation,
  dashboardNavigation,
  dashboardTabHref,
  hrNavigation,
} from "./unified-navigation"

describe("unified navigation", () => {
  it("keeps every commercial destination tied to a permission", () => {
    expect(commercialNavigation.map(({ href }) => href)).toEqual(
      commercialNavigationAccess.map(([href]) => href)
    )
  })

  it("provides unique links for every merged application tab", () => {
    const hrefs = [
      ...dashboardNavigation.map(({ href }) => href),
      ...commercialNavigation.map(({ href }) => href),
      ...hrNavigation.map(({ href }) => href),
      ...administrationNavigation.map(({ href }) => href),
    ]

    expect(new Set(hrefs)).toHaveLength(hrefs.length)
    expect(dashboardNavigation).toHaveLength(16)
    expect(commercialNavigation).toHaveLength(17)
    expect(hrNavigation).toEqual([
      expect.objectContaining({
        href: "/hr",
        label: "Recruitment workspace",
      }),
    ])
  })

  it("creates shareable links for operations tabs", () => {
    expect(dashboardTabHref("maintenanceTab")).toBe("/?tab=maintenanceTab")
  })
})
