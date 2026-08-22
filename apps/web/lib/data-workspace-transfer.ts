export type DataWorkspaceView = "dataEntry" | "masterTables"

export type DataWorkspaceTransferAction = "csvImport" | "export"

export function dataWorkspaceTransferAction(
  view: DataWorkspaceView,
  availability: { csvImport: boolean; export: boolean }
): DataWorkspaceTransferAction | null {
  if (view === "dataEntry") {
    return availability.csvImport ? "csvImport" : null
  }
  return availability.export ? "export" : null
}
