import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("Operational Entry selection layout", () => {
  it("uses the complete application shell", () => {
    const source = readFileSync(
      new URL("./layout.tsx", import.meta.url),
      "utf8"
    )

    expect(source).toContain("CommercialShell")
    expect(source).toContain("getUnifiedNavigationAccess")
    expect(source).toContain("requireAuthenticatedSession")
  })

  it("opens forms and tables through the same validated selection page", () => {
    const pageSource = readFileSync(
      new URL("./page.tsx", import.meta.url),
      "utf8"
    )
    const selectionSource = readFileSync(
      new URL("./operational-entry-selection.tsx", import.meta.url),
      "utf8"
    )
    const openSource = readFileSync(
      new URL("./open/page.tsx", import.meta.url),
      "utf8"
    )

    expect(pageSource).toContain("view={view}")
    expect(selectionSource).toContain(
      'view === "masterTables" ? "Open Table" : "Open Form"'
    )
    expect(selectionSource).toContain(
      "operationalEntryOpenHref(resolved, view)"
    )
    expect(openSource).toContain("operationalEntryFormHref(selection, view)")
  })

  it("redirects legacy dashboard entry links back through selection", () => {
    const dashboardSource = readFileSync(
      new URL("../page.tsx", import.meta.url),
      "utf8"
    )

    expect(dashboardSource).toContain("resolveOperationalEntrySelection")
    expect(dashboardSource).toContain(
      "operationalEntrySelectionMatchesDestination"
    )
    expect(dashboardSource).toContain("redirect(selectionHref)")
  })
})
