type ImportRow = Record<string, unknown>

function text(value: unknown) {
  return String(value ?? "").trim()
}

export function firstMissingPlanningItemRow(
  rows: ImportRow[],
  missingItemUids: readonly string[]
) {
  const missing = new Set(missingItemUids.map((value) => value.toLowerCase()))
  const index = rows.findIndex((row) =>
    missing.has(text(row.partNo).toLowerCase())
  )
  if (index < 0) return null
  return {
    csvRow: index + 2,
    itemUid: text(rows[index]!.partNo),
  }
}

export function firstDuplicateRouteSetup(rows: ImportRow[]) {
  const firstRowByKey = new Map<string, number>()
  for (const [index, row] of rows.entries()) {
    const itemUid = text(row.partNo)
    const optionNumber = text(row.optionNumber)
    const setupNumber = text(row.setupNo)
    if (!itemUid || !optionNumber || !setupNumber) continue
    const key = `${itemUid}|${optionNumber}|${setupNumber}`.toLowerCase()
    const firstIndex = firstRowByKey.get(key)
    if (firstIndex !== undefined) {
      return {
        csvRows: [firstIndex + 2, index + 2] as const,
        itemUid,
        optionNumber,
        setupNumber,
      }
    }
    firstRowByKey.set(key, index)
  }
  return null
}

export function planningImportValidationError(
  entryType: string,
  rows: ImportRow[],
  missingItemUids: readonly string[]
) {
  const issues: string[] = []
  if (entryType === "route") {
    const duplicate = firstDuplicateRouteSetup(rows)
    if (duplicate) {
      issues.push(
        `CSV rows ${duplicate.csvRows[0]} and ${duplicate.csvRows[1]} repeat setup ${duplicate.setupNumber} for product ${duplicate.itemUid}, option ${duplicate.optionNumber}. Each setup number must be unique; the setupNo and numberOfSetups columns appear reversed in this file.`
      )
    }
  }
  const missingRow =
    entryType === "route"
      ? null
      : firstMissingPlanningItemRow(rows, missingItemUids)
  if (missingRow) {
    issues.push(
      `CSV row ${missingRow.csvRow}: Part "${missingRow.itemUid}" has no Route Master. Import its Route Master first, then import this file again.`
    )
  }
  if (!issues.length) return null
  const name = entryType.replaceAll("_", " ")
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} CSV needs correction before import. ${issues.join(" ")}`
}

export function planningImportRowError(
  entryType: string,
  index: number,
  row: ImportRow,
  error: unknown
) {
  const rawName = entryType.replaceAll("_", " ")
  const name = `${rawName.charAt(0).toUpperCase()}${rawName.slice(1)}`
  const item = text(row.partNo || row.partCode)
  const option = text(row.optionNumber)
  const setup = text(row.setupNo)
  const context = [
    item ? `product ${item}` : "",
    option ? `option ${option}` : "",
    setup ? `setup ${setup}` : "",
  ]
    .filter(Boolean)
    .join(", ")
  const detail = error instanceof Error ? error.message : "Import failed."
  return `${name} CSV row ${index + 2}${context ? ` (${context})` : ""}: ${detail}`
}
