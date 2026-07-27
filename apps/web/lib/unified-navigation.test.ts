import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { commercialNavigationAccess } from "./auth/commercial-capabilities"
import {
  administrationNavigation,
  commercialNavigation,
  dashboardNavigation,
  dashboardTabHref,
  hrNavigation,
  navigationHrefMatches,
} from "./unified-navigation"

describe("unified navigation", () => {
  it("does not prefetch every visible sidebar destination", () => {
    const source = readFileSync(
      new URL("../components/unified-sidebar-navigation.tsx", import.meta.url),
      "utf8"
    )
    const links = source.match(/<Link\b[\s\S]*?>/g) ?? []

    expect(links.length).toBeGreaterThan(0)
    links.forEach((link) => expect(link).toContain("prefetch={false}"))
  })

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
    expect(hrNavigation.map(({ href, label }) => ({ href, label }))).toEqual([
      { href: "/hr?panel=mastersPanel", label: "Masters" },
      { href: "/hr?panel=postMasterPanel", label: "Job Templates" },
      { href: "/hr?panel=approvedPostPanel", label: "Approved Post Form" },
      { href: "/hr?panel=employeeMasterPanel", label: "Employee Master" },
      { href: "/hr?panel=jobsPanel", label: "Job Posts" },
      { href: "/hr?panel=candidatesPanel", label: "Log Candidate" },
      {
        href: "/hr?panel=candidateSearchPanel",
        label: "Search Candidate",
      },
      { href: "/hr?panel=interviewsPanel", label: "Interviews" },
    ])
  })

  it("creates shareable links for operations tabs", () => {
    expect(dashboardTabHref("maintenanceTab")).toBe("/?tab=maintenanceTab")
  })

  it("matches the selected HR panel instead of every HR link", () => {
    const searchParams = new URLSearchParams("panel=candidateSearchPanel")

    expect(
      navigationHrefMatches(
        "/hr",
        searchParams,
        "/hr?panel=candidateSearchPanel"
      )
    ).toBe(true)
    expect(
      navigationHrefMatches("/hr", searchParams, "/hr?panel=mastersPanel")
    ).toBe(false)
  })
})
