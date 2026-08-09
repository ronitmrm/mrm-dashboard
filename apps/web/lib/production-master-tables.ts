export function rowsForProductionMaster<T extends Record<string, unknown>>(
  entryType: string,
  rows: T[]
) {
  return rows.filter((row) => {
    const rowEntryType =
      typeof row.entryType === "string" ? row.entryType.trim() : ""
    return !rowEntryType || rowEntryType === entryType
  })
}
