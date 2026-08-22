import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("Master Data workspace", () => {
  it("shows Data Entry and Master Tables as two views of one module", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )
    const tabsSource = readFileSync(
      new URL("./master-data-view-tabs.tsx", import.meta.url),
      "utf8"
    )

    expect(source).toMatch(/<MasterDataTabs\s+activeView="dataEntry"/)
    expect(source).toMatch(/<MasterDataTabs\s+activeView="masterTables"/)
    expect(source).toContain("entryType={preferredDataEntryType}")
    expect(source).toContain("onEntryTypeChange={onMasterEntryTypeChange}")
    expect(tabsSource).toContain("Data Entry")
    expect(tabsSource).toContain("Master Table")
    expect(tabsSource).toContain("Back to Master Selection")
    expect(tabsSource).toContain("MasterDataUnsavedGuard")
    expect(source).toMatch(
      /masterEditDefaults\(\s*selectedSpec\.entryType,\s*row\s*\)/
    )
    expect(source).toMatch(/immutableMasterFields\(spec\.entryType\)/)
    expect(source).toContain('submitAction("master-delete"')
    expect(source).toContain("Select Replacement (Required Only If Used)")
    expect(source).not.toContain('<optgroup label="Other Modules">')
    expect(source).toContain(
      'key={`${initialDashboardTab}|${initialDataEntryType ?? ""}|${initialProductionFloor}`}'
    )
  })
})
