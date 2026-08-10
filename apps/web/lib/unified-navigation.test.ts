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
  it("uses native navigation for data-heavy sidebar destinations", () => {
    const source = readFileSync(
      new URL("../components/unified-sidebar-navigation.tsx", import.meta.url),
      "utf8"
    )
    const nativeLinks = source.match(/<a href=\{item\.href\}>/g) ?? []

    expect(nativeLinks).toHaveLength(3)
    expect(source).toContain("<a href={dashboardTabHref(item.id, floor.code)}>")
    expect(source).not.toContain('from "next/link"')
    expect(source).not.toContain("router.prefetch")
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
      {
        href: "/hr?panel=conversationLogsPanel",
        label: "Conversation History",
      },
      {
        href: "/hr?panel=interviewsPanel",
        label: "Interview Schedule",
      },
      {
        href: "/hr?panel=interviewWorkspacePanel",
        label: "Interview Workspace",
      },
    ])
  })

  it("creates shareable links for operations tabs", () => {
    expect(dashboardTabHref("maintenanceTab")).toBe("/?tab=maintenanceTab")
    expect(dashboardTabHref("maintenanceTab", "cnc")).toBe(
      "/?tab=maintenanceTab&floor=cnc"
    )
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

  it("keeps Job Posts selected inside a job recruitment workspace", () => {
    const searchParams = new URLSearchParams()

    expect(
      navigationHrefMatches(
        "/hr/jobs/9824b9a7-b917-4dea-a8b2-9eb9d2935dc7",
        searchParams,
        "/hr?panel=jobsPanel"
      )
    ).toBe(true)
    expect(
      navigationHrefMatches(
        "/hr/jobs/9824b9a7-b917-4dea-a8b2-9eb9d2935dc7",
        searchParams,
        "/hr?panel=interviewsPanel"
      )
    ).toBe(false)
  })

  it("keeps Log Candidate selected inside a candidate workspace", () => {
    const searchParams = new URLSearchParams()

    expect(
      navigationHrefMatches(
        "/hr/candidates/9824b9a7-b917-4dea-a8b2-9eb9d2935dc7",
        searchParams,
        "/hr?panel=candidatesPanel"
      )
    ).toBe(true)
  })
})
