import { createHash } from "node:crypto"

type ImportRow = Record<string, unknown>

const autoCodeFieldByEntryType = {
  maintenance_checklist_master: "checklistCode",
  rejection_reason_master: "code",
  rejection_remark_master: "code",
  rejection_type_master: "code",
  setup_checklist_master: "checklistCode",
} as const

type AutoCodedMasterEntryType = keyof typeof autoCodeFieldByEntryType

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim()
}

function savedMasterCode(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return ""
  }
  return text((value as ImportRow).code)
}

function autoCodedEntryType(
  entryType: string
): entryType is AutoCodedMasterEntryType {
  return Object.hasOwn(autoCodeFieldByEntryType, entryType)
}

function stableImportValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableImportValue)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith("__"))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableImportValue(entry)])
  )
}

function csvImportRowIdentity(entryType: string, row: ImportRow) {
  const comparableRow = { ...row }
  if (autoCodedEntryType(entryType)) {
    delete comparableRow[autoCodeFieldByEntryType[entryType]]
  }
  return JSON.stringify(stableImportValue(comparableRow))
}

function checklistGroupKey(row: ImportRow, codeField: string) {
  const uploadedCode = text(row[codeField]).toLowerCase()
  if (uploadedCode) return `code:${uploadedCode}`
  const title = text(row.checklistTitle || row.title).toLowerCase()
  return title ? `title:${title}` : "file"
}

export function autoCodedMasterTemplateFields(
  entryType: string,
  fields: string[]
) {
  if (!autoCodedEntryType(entryType)) return fields
  const codeField = autoCodeFieldByEntryType[entryType]
  return fields.filter((field) => field !== codeField)
}

export function dedupeCsvImportRows(entryType: string, rows: ImportRow[]) {
  const identities = new Set<string>()
  const uniqueRows: ImportRow[] = []
  for (const row of rows) {
    const identity = csvImportRowIdentity(entryType, row)
    if (identities.has(identity)) continue
    identities.add(identity)
    uniqueRows.push(row)
  }
  return {
    duplicateCount: rows.length - uniqueRows.length,
    rows: uniqueRows,
  }
}

export function csvImportRowSourceId(entryType: string, row: ImportRow) {
  const identity = csvImportRowIdentity(entryType, row)
  return `csv:${createHash("sha256")
    .update(entryType)
    .update("\0")
    .update(identity)
    .digest("hex")}`
}

export async function importAutoCodedMasterRows(
  entryType: string,
  rows: ImportRow[],
  save: (row: ImportRow) => Promise<unknown>
) {
  if (!autoCodedEntryType(entryType)) {
    for (const row of rows) await save(row)
    return rows.length
  }

  const codeField = autoCodeFieldByEntryType[entryType]
  const checklistImport = codeField === "checklistCode"
  const generatedCodes = new Map<string, string>()

  for (const [index, row] of rows.entries()) {
    const groupKey = checklistImport
      ? checklistGroupKey(row, codeField)
      : `row:${index}`
    const generatedCode = generatedCodes.get(groupKey) ?? ""
    const saved = await save({ ...row, [codeField]: generatedCode })
    const savedCode = savedMasterCode(saved)
    if (!generatedCode) {
      if (!savedCode) {
        throw new Error(`Generated code missing for ${entryType}.`)
      }
      generatedCodes.set(groupKey, savedCode)
    }
  }

  return rows.length
}
