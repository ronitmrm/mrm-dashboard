export const maxBrowserImportRows = 25;
export const maxMachineMasterBrowserImportRows = 250;

const exportUnavailableError =
  "Dashboard exports are not implemented yet. Use controlled workbook exports instead of placeholder files.";

export function exportUnavailablePayload(path: string) {
  if (path !== "data-export" && path !== "export-workbook") return null;
  return {
    status: 501,
    error: exportUnavailableError,
  };
}

export function browserImportPolicy(entryType: string, rowCount: number) {
  const rowLimit =
    entryType === "machine_master"
      ? maxMachineMasterBrowserImportRows
      : maxBrowserImportRows;

  if (rowCount <= rowLimit) {
    return { ok: true as const };
  }

  if (entryType === "machine_master") {
    return {
      ok: false as const,
      status: 413,
      error: `Machine Master browser imports are limited to ${rowLimit} rows. Split the CSV into smaller files.`,
    };
  }

  return {
    ok: false as const,
    status: 413,
    error: `Browser imports are limited to ${maxBrowserImportRows} rows. Use pnpm import:entry:dry-run followed by the controlled import script for bulk data.`,
  };
}
