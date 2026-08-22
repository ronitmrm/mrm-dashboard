import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const workspaces = [
  "components/mrmpl-dashboard.tsx",
  "components/hr/recruitment-panel.tsx",
  "app/commercial/masters/page.tsx",
  "app/commercial/customers/page.tsx",
  "app/commercial/website-products/page.tsx",
] as const

describe("Master Data transfer coverage", () => {
  for (const file of workspaces) {
    it(`${file} supplies CSV import and table export actions`, () => {
      const source = readFileSync(resolve(process.cwd(), file), "utf8")
      expect(source).toContain("csvImportAction=")
      expect(source).toMatch(/exportAction=|onExport=/)
    })
  }

  it("gates both actions in the shared Master Data toolbar", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/master-data-view-tabs.tsx"),
      "utf8"
    )
    expect(source).toContain('transferAction === "csvImport"')
    expect(source).toContain('transferAction === "export"')
  })
})
