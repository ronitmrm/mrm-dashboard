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

function recordRows(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter(
    (row): row is Record<string, unknown> =>
      typeof row === "object" && row !== null && !Array.isArray(row)
  )
}

export function dataEntryRowsForProductionMaster(
  entryType: string,
  dataEntry: Record<string, unknown>
) {
  return recordRows(dataEntry.rows).filter(
    (row) => row.entryType === entryType
  )
}
