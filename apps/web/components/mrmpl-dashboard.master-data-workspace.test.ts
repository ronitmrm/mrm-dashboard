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
    expect(source).toContain("entryType={bulkEntryType}")
    expect(source).toContain("onEntryTypeChange={onMasterEntryTypeChange}")
    expect(tabsSource).toContain("Data Entry")
    expect(tabsSource).toContain("Master Table")
    expect(tabsSource).toContain("Back to Master Selection")
    expect(tabsSource).toContain(
      "masterSelectionHref(selection, props.activeView)"
    )
    expect(tabsSource).toMatch(
      /const masterTablesHref = selection\s+\? withMasterSelectionContext\([\s\S]*?\)\s+: "\/masters\?view=masterTables"/
    )
    expect(tabsSource).toContain("MasterDataUnsavedGuard")
    expect(source).toMatch(
      /masterEditDefaults\(\s*selectedSpec\.entryType,\s*row\s*\)/
    )
    expect(source).toMatch(/immutableMasterFields\(spec\.entryType\)/)
    expect(source).toMatch(/submitAction\(\s*"master-delete"/)
    expect(source).toContain("Select Replacement (Required Only If Used)")
    const tablePanelSource = source.slice(
      source.indexOf("function MasterTablesPanel"),
      source.indexOf("function masterTableKeySummaryRows")
    )
    expect(tablePanelSource).not.toContain('<Field label="Production Unit">')
    expect(tablePanelSource).not.toContain('<Field label="Master">')
    expect(source).not.toContain('<optgroup label="Other Modules">')
    expect(source).toContain(
      'key={`${initialDashboardTab}|${initialDataEntryType ?? ""}|${initialProductionFloor}`}'
    )
  })

  it("keeps view tabs beside Back and transfer actions on the right", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )
    const tabsSource = readFileSync(
      new URL("./master-data-view-tabs.tsx", import.meta.url),
      "utf8"
    )
    const companyWideScopeSource = readFileSync(
      new URL("./company-wide-master-scope.tsx", import.meta.url),
      "utf8"
    )
    const tablePanelSource = source.slice(
      source.indexOf("function MasterTablesPanel"),
      source.indexOf("function masterTableKeySummaryRows")
    )

    expect(tablePanelSource).not.toContain("Search Saved Rows")
    expect(tablePanelSource).not.toContain("Search All Visible Columns")
    expect(tablePanelSource).toMatch(
      /onExport=\{\(\) =>\s*downloadMasterTableCsv/
    )
    expect(tabsSource).toContain("Back to Master Selection")
    expect(tabsSource).toContain("Export")
    const toolbarSource = tabsSource.slice(
      tabsSource.indexOf(
        '<div className="flex flex-wrap items-center border-b">'
      )
    )
    expect(toolbarSource.indexOf("Back to Master Selection")).toBeLessThan(
      toolbarSource.indexOf('aria-label="Master Data views"')
    )
    expect(
      toolbarSource.indexOf('aria-label="Master Data views"')
    ).toBeLessThan(toolbarSource.indexOf('transferAction === "csvImport"'))
    expect(tabsSource).toContain('className="ml-auto flex items-center gap-2"')
    expect(tabsSource).not.toContain("masterSelectionSummary")
    expect(companyWideScopeSource).not.toContain("Production Unit")
    expect(companyWideScopeSource).not.toContain(
      "Full Software / Not Applicable"
    )
    expect(source).toContain("!selectedMasterIsCompanyWide")
  })
})
