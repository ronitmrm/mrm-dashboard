import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("Production operational page loading", () => {
  it("keeps direct operational API payloads out of dashboard-state normalization", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )
    const loader = source.slice(
      source.indexOf("function usePostgresOperationalPage"),
      source.indexOf("async function savePostgresDashboardEntry")
    )

    expect(loader).toContain("setResult({ data: body, url })")
    expect(loader).not.toContain("mergeDashboardStateResponse")
  })

  it("makes first-piece inspection device-independent", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )
    const firstPiecePage = source.slice(
      source.indexOf("export function FirstPieceInspectionPage"),
      source.indexOf("function HourlyQualityCheckShell")
    )

    expect(firstPiecePage).toContain("shopFloorQueueRows(productionControl)")
    expect(firstPiecePage).toContain('roleTaskMatches(row, "quality")')
    expect(firstPiecePage).toContain("readStoredFirstPieceInspectionTasks()")
    expect(firstPiecePage).toContain(
      'className="grid w-full min-w-0 gap-4 text-foreground"'
    )
    expect(firstPiecePage).toContain("@5xl/main:grid-cols-3")
    expect(firstPiecePage).not.toContain("max-w-6xl")
    expect(firstPiecePage).not.toContain("Example Only")
    expect(firstPiecePage).not.toContain("Filled Dummy Inspection")

    const firstPiecePanel = source.slice(
      source.indexOf("function FirstPieceInspectionPanel"),
      source.indexOf("function ShopFloorItemSummary")
    )
    expect(firstPiecePanel).toContain("@2xl/main:flex")
    expect(firstPiecePanel).toContain("@6xl/main:table-cell")

    const firstPieceForm = source.slice(
      source.indexOf("function FirstPieceInspectionForm"),
      source.indexOf("function FirstPieceReadingControl")
    )
    expect(firstPieceForm).toContain("@5xl/main:hidden")
    expect(firstPieceForm).toContain("@4xl/main:grid-cols-5")
    expect(firstPieceForm).toContain("hidden overflow-auto @5xl/main:block")
  })

  it("handles rejected CSV imports without an unhandled browser error", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )
    const importHandler = source.slice(
      source.indexOf("async function importEntryFile"),
      source.indexOf(
        "return (",
        source.indexOf("async function importEntryFile")
      )
    )

    expect(importHandler).toContain("{ throwOnError: true }")
    expect(importHandler).toContain("catch {")
    expect(importHandler.indexOf("catch {")).toBeLessThan(
      importHandler.indexOf("finally {")
    )
  })

  it("loads the Production Dashboard across every Production Unit", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )
    const panel = source.slice(
      source.indexOf("function ProductionDashboardPanel"),
      source.indexOf("function ProductionControlPanel")
    )

    for (const floor of ["conventional", "conventional-02", "cnc", "forging"]) {
      expect(panel).toContain(`/api/dashboard?floor=${floor}`)
    }
    expect(panel).toContain("universalProductionDashboardRows")
    expect(panel).toContain("Production Unit")
    expect(panel).toContain("row.productionUnit")
    expect(panel).toContain("<Table excelFilters>")
    expect(panel).not.toContain("MachineMasterColumnFilter")
    expect(panel).not.toContain("Search Work Orders")
  })

  it("keeps machine identity entry in Master Data and opens history from Machines", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )
    const workspace = source.slice(
      source.indexOf("function CentralMachineMasterWorkspace"),
      source.indexOf("function MachineMasterPanel")
    )
    const panel = source.slice(
      source.indexOf("function MachineMasterPanel"),
      source.indexOf("function MaintenancePanel")
    )

    expect(workspace).not.toContain("<DataEntryPanel")
    expect(panel).not.toContain(">Add Machine</Button>")
    expect(panel).not.toContain(">Edit</Button>")
    expect(panel).toContain("Open Machine Master")
    expect(panel).toMatch(/<TileField\s+label="Machine Status"/)
    expect(panel).toMatch(/<TileField\s+label="Remarks"/)
    expect(panel).toContain("useSyncExternalStore(")
    expect(panel).toContain("machineMasterQueryFromLocation()")
    expect(panel).not.toContain("const [selectedMachineNo] = useState")
  })

  it("loads Mechanical scheduled work across every Production Unit", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )
    const workspace = source.slice(
      source.indexOf("function UniversalMaintenanceWorkspace"),
      source.indexOf("function ProductionDashboardPanel")
    )

    for (const floor of ["conventional", "conventional-02", "cnc", "forging"]) {
      expect(workspace).toContain(`/api/dashboard?floor=${floor}`)
    }
    expect(workspace).toContain("combinedMachineMasterProductionControl")
    expect(workspace).toContain("<MaintenancePanel")
  })

  it("combines approved Mechanical requests with scheduled work", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )
    const panel = source.slice(
      source.indexOf("function MaintenancePanel"),
      source.indexOf("function MaintenanceReportDetail")
    )

    expect(panel).toContain("unifiedMechanicalWorkRows(dueRows, requestRows)")
    expect(panel).toContain("<TableHead>Work Type</TableHead>")
    expect(panel).toContain('work.priority === "Urgent"')
    expect(panel).toContain("markMaintenanceDone(scheduled)")
  })

  it("keeps production-unit and connection badges out of the dashboard header", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )
    const headerStart = source.indexOf('<header className="sticky top-0')
    const header = source.slice(
      headerStart,
      source.indexOf("</header>", headerStart)
    )

    expect(header).toContain("<HeaderActions")
    expect(header).not.toContain("selectedProductionFloor.shortLabel")
    expect(header).not.toContain("dashboardStatusLabel")
  })
  it("locks the selected operational form and provides a selection return path", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )
    const tabsSource = readFileSync(
      new URL("./operational-workspace-tabs.tsx", import.meta.url),
      "utf8"
    )
    const dataEntryPanel = source.slice(
      source.indexOf("function DataEntryPanel"),
      source.indexOf("function OperationalTablesPanel")
    )
    const tablePanel = source.slice(
      source.indexOf("function OperationalTablesPanel"),
      source.indexOf("function MasterTablesPanel")
    )

    expect(dataEntryPanel).toContain(
      "operationalEntrySelectionFromContext(searchParams)"
    )
    expect(tablePanel).toContain(
      "operationalEntrySelectionFromContext(searchParams)"
    )
    expect(tabsSource).toContain("Back to Operational Entry Selection")
    expect(tabsSource).toContain("withOperationalEntrySelectionContext")
    expect(tabsSource).not.toContain("operationalEntrySelectionSummary")
    expect(tabsSource.indexOf("<nav")).toBeLessThan(
      tabsSource.indexOf('className="ml-auto flex items-center gap-2"')
    )
    expect(dataEntryPanel).toContain("csvDownloadAction={")
    expect(dataEntryPanel).toContain("csvImportAction={csvImportAction}")
  })
})
