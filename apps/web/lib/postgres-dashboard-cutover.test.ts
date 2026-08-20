import { readFile } from "node:fs/promises"

import { describe, expect, test } from "vitest"

const componentUrl = new URL("../components/mrmpl-dashboard.tsx", import.meta.url)
const dashboardLayoutUrl = new URL("../app/dashboard/layout.tsx", import.meta.url)
const rootLayoutUrl = new URL("../app/layout.tsx", import.meta.url)
const pageUrl = new URL("../app/page.tsx", import.meta.url)
const proxyUrl = new URL("../proxy.ts", import.meta.url)
const routeUrl = new URL("../app/api/[...path]/route.ts", import.meta.url)

describe("PostgreSQL dashboard client cutover", () => {
  test("the dashboard client has no Convex auth, query, or mutation dependency", async () => {
    const source = await readFile(componentUrl, "utf8")

    expect(source).not.toContain("@convex-dev/auth")
    expect(source).not.toContain('from "convex/react"')
    expect(source).not.toContain("@/convex/_generated")
    expect(source).not.toMatch(/\buse(?:ConvexAuth|Mutation|PaginatedQuery|Query)\b/)
  })

  test("the root dashboard is protected by Better Auth capability checks", async () => {
    const source = await readFile(pageUrl, "utf8")

    expect(source).toContain('requireAuthenticatedSession("/")')
    expect(source).toContain("productionCapabilityForTab(initialDashboardTab)")
    expect(source).toContain("await requireProductionPage(pageCapability")
  })

  test("specialized dashboard routes use the same Better Auth boundary", async () => {
    const source = await readFile(dashboardLayoutUrl, "utf8")

    expect(source).toContain('requireAuthenticatedSession("/dashboard")')
  })

  test("the dashboard API has no authenticated Convex fallback", async () => {
    const source = await readFile(routeUrl, "utf8")

    expect(source).not.toContain("@convex-dev/auth")
    expect(source).not.toContain('from "convex/browser"')
    expect(source).not.toContain("@/convex/_generated")
    expect(source).not.toContain("authenticatedConvexClient")
  })

  test("request middleware has no Convex environment dependency", async () => {
    const source = await readFile(proxyUrl, "utf8")

    expect(source).not.toContain("@convex-dev/auth")
    expect(source).not.toContain("convex-env")
  })

  test("the root layout has no Convex provider or environment dependency", async () => {
    const source = await readFile(rootLayoutUrl, "utf8")

    expect(source).not.toContain("@convex-dev/auth")
    expect(source).not.toContain("ConvexClientProvider")
    expect(source).not.toContain("convex-env")
  })
})
