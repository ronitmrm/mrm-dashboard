import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("Master Data workspace", () => {
  it("shows Data Entry and Master Tables as two views of one module", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )

    expect(source).toContain('<MasterDataTabs activeView="dataEntry"')
    expect(source).toContain('<MasterDataTabs activeView="masterTables"')
    expect(source).toContain('entryType={preferredDataEntryType}')
    expect(source).toContain('onEntryTypeChange={onMasterEntryTypeChange}')
    expect(source).toContain('Data Entry</Link>')
    expect(source).toContain('Master Tables</Link>')
    expect(source).toContain("masterEditDefaults(selectedSpec.entryType, row)")
    expect(source).toContain("immutableMasterFields(spec.entryType)")
    expect(source).toContain('submitAction("master-delete"')
    expect(source).toContain("Select Replacement (Required Only If Used)")
  })
})
