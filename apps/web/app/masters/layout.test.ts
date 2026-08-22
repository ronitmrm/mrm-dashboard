import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("Master Selection layout", () => {
  it("uses the complete application shell", () => {
    const source = readFileSync(
      new URL("./layout.tsx", import.meta.url),
      "utf8"
    )

    expect(source).toContain("CommercialShell")
    expect(source).toContain("getUnifiedNavigationAccess")
    expect(source).toContain("requireAuthenticatedSession")
  })

  it("opens forms and tables through the same selection page", () => {
    const pageSource = readFileSync(
      new URL("./page.tsx", import.meta.url),
      "utf8"
    )
    const selectionSource = readFileSync(
      new URL("./master-selection.tsx", import.meta.url),
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
    expect(selectionSource).toContain("masterOpenHref(resolved, view)")
    expect(openSource).toContain("masterFormHref(selection, view)")
  })
})
