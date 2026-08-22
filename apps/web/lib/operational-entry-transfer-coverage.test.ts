import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const webRoot = path.resolve(__dirname, "..")

function source(file: string) {
  return readFileSync(path.join(webRoot, file), "utf8")
}

describe("Operational Entry transfer coverage", () => {
  for (const file of [
    "components/mrmpl-dashboard.tsx",
    "app/commercial/enquiries/page.tsx",
    "app/commercial/orders/page.tsx",
  ]) {
    it(`${file} supplies CSV import and Entry Table export actions`, () => {
      const page = source(file)
      expect(page).toContain("csvImportAction=")
      expect(page).toContain("exportAction=")
    })
  }

  it("the shared toolbar gates transfers by active view", () => {
    const toolbar = source("components/operational-workspace-tabs.tsx")
    expect(toolbar).toContain('transferAction === "csvImport"')
    expect(toolbar).toContain('transferAction === "export"')
  })
})
