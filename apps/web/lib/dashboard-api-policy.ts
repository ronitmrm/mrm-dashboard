export const maxBrowserImportRows = 25;

const exportUnavailableError =
  "Dashboard exports are not implemented yet. Use controlled workbook exports instead of placeholder files.";

export function exportUnavailablePayload(path: string) {
  if (path !== "data-export" && path !== "export-workbook") return null;
  return {
    status: 501,
    error: exportUnavailableError,
  };
}

export function browserImportPolicy(_entryType: string, rowCount: number) {
  if (rowCount <= maxBrowserImportRows) {
    return { ok: true as const };
  }

  return {
    ok: false as const,
    status: 413,
    error: `Browser imports are limited to ${maxBrowserImportRows} rows. Use pnpm import:entry:dry-run followed by the controlled import script for bulk data.`,
  };
}
