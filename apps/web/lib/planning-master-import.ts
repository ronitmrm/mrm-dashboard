import { parseProductionFloorCode } from "@workspace/db"

type ImportRow = Record<string, unknown>

function text(value: unknown) {
  return String(value ?? "").trim()
}

function importedField(row: ImportRow, names: string[]) {
  const normalizedNames = new Set(
    names.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, ""))
  )
  for (const [name, value] of Object.entries(row)) {
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, "")
    if (normalizedNames.has(normalizedName) && text(value)) return value
  }
  return undefined
}

export function machineMasterImportPayload(
  row: ImportRow,
  fallbackProductionFloor: unknown
): ImportRow {
  const requestedProductionFloor =
    importedField(row, ["productionFloorCode", "productionUnit"]) ??
    fallbackProductionFloor
  return {
    ...row,
    productionFloorCode:
      parseProductionFloorCode(requestedProductionFloor) ??
      text(requestedProductionFloor),
  }
}

export function workOrderNumberForPayload(row: ImportRow) {
  const fgPoNumber = text(row.fgPoNo)
  const partCode = text(row.partCode)
  return fgPoNumber && partCode
    ? `${fgPoNumber}::${partCode}`
    : text(row.jcNo)
}

function workOrderImportIssues(rows: ImportRow[]) {
  const issues: string[] = []
  const firstRowByJobCard = new Map<string, number>()
  const firstRowByLine = new Map<
    string,
    { csvRow: number; fgPoNumber: string; partCode: string }
  >()
  let duplicateJobCard: string | null = null
  let duplicateLine: string | null = null

  for (const [index, row] of rows.entries()) {
    const csvRow = index + 2
    const jobCard = text(row.jcNo)
    const fgPoNumber = text(row.fgPoNo)
    const partCode = text(row.partCode)

    if (jobCard && !duplicateJobCard) {
      const key = jobCard.toLowerCase()
      const firstRow = firstRowByJobCard.get(key)
      if (firstRow !== undefined) {
        duplicateJobCard = `CSV rows ${firstRow} and ${csvRow} repeat Job Card ${jobCard}. Each Job Card must identify exactly one line.`
      } else {
        firstRowByJobCard.set(key, csvRow)
      }
    }

    if (fgPoNumber && partCode && !duplicateLine) {
      const key = `${fgPoNumber}\u0000${partCode}`.toLowerCase()
      const firstLine = firstRowByLine.get(key)
      if (firstLine) {
        duplicateLine = `CSV rows ${firstLine.csvRow} and ${csvRow} repeat FG PO ${firstLine.fgPoNumber} with Part Code ${firstLine.partCode}. That combination may appear only once in a Work Order.`
      } else {
        firstRowByLine.set(key, { csvRow, fgPoNumber, partCode })
      }
    }
  }

  if (duplicateJobCard) issues.push(duplicateJobCard)
  if (duplicateLine) issues.push(duplicateLine)
  return issues
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
  if (entryType === "work_order") {
    issues.push(...workOrderImportIssues(rows))
  }
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
