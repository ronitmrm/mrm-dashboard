import { normalizeUserEnteredPayload } from "@workspace/db/user-entry-text"

import { dedupeCsvImportRows } from "./auto-coded-master-import"
import { csvDateValue, isCsvDateColumn } from "./csv-date"

export class TemplateUploadError extends Error {
  readonly status = 400
}

export function parseTemplateUpload(
  entryType: string,
  fileName: string,
  fileBase64: string,
  knownEntryTypes: ReadonlySet<string>
) {
  if (!knownEntryTypes.has(entryType)) {
    throw new TemplateUploadError(`Unknown import entry type: ${entryType}`)
  }
  if (!fileName.toLowerCase().endsWith(".csv")) {
    throw new TemplateUploadError(
      "Upload the filled CSV template downloaded from this screen."
    )
  }
  const csvText = decodeDataUrl(fileBase64)
  const rows = parseCsv(csvText, entryType)
    .map((row) => normalizeImportedPayload(row, entryType))
    .map((payload) => normalizeUserEnteredPayload(payload))
    .filter((row) => Object.values(row).some((value) => text(value)))
  if (!rows.length) {
    throw new TemplateUploadError(
      "The CSV contains no data rows. Fill the template before uploading."
    )
  }
  if (entryType === "rm_inward") {
    const failures = rows.flatMap((row, index) => {
      const errors = text(row.rmInwardDate) ? [] : [`CSV row ${index + 2}: RM Inward Date is required in DD/MM/YYYY format (e.g. 21/09/2026).`]
      const quantity = Number(row.rmInwardKg)
      if (!Number.isFinite(quantity) || quantity <= 0) {
        errors.push(`Row ${index + 2}: RM Inward Kg "${text(row.rmInwardKg) || "blank"}" must be a positive number.`)
      }
      return errors.length ? [errors.join(" ")] : []
    })
    if (failures.length) {
      throw new TemplateUploadError(
        `Import failed; no rows saved. ${failures.slice(0, 10).join(" ")}${failures.length > 10 ? ` ${failures.length - 10} more row(s) failed.` : ""}`
      )
    }
  }
  return dedupeCsvImportRows(entryType, rows)
}

function normalizeDateCells(row: Record<string, unknown>, rowNumber: number) {
  try {
    return Object.fromEntries(Object.entries(row).map(([column, value]) => [
      column, isCsvDateColumn(column) ? csvDateValue(value, rowNumber, column) : value,
    ]))
  } catch (error) {
    throw new TemplateUploadError(error instanceof Error ? error.message : "Invalid CSV date.")
  }
}

function decodeDataUrl(value: string) {
  const [, encoded = value] = value.split(",", 2)
  return Buffer.from(encoded, "base64")
    .toString("utf8")
    .replace(/^\uFEFF/, "")
}

const csvFieldsByEntryType = new Map([
  ["rm_inward", [
    "jcNo", "rmPoNo", "partCode", "rmInwardDate", "rmInwardKg", "rmLocation",
  ]],
  ["work_order", [
    "jcNo", "partCode", "fgPoNo", "rmPoNo", "poDate", "orderPcs", "orderKg", "requiredRmKg",
  ]],
])

function csvHeader(entryType: string, header: string) {
  const trimmed = header.trim()
  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "")
  return csvFieldsByEntryType.get(entryType)
    ?.find((field) => field.toLowerCase() === normalized) ?? trimmed
}

function parseCsv(csvText: string, entryType: string): Array<Record<string, unknown>> {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index]
    const next = csvText[index + 1]

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ",") {
      row.push(cell)
      cell = ""
    } else if (char === "\n" || char === "\r") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
      if (char === "\r" && next === "\n") index += 1
    } else {
      cell += char
    }
  }

  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }

  const [headers = [], ...bodyRows] = rows
  const cleanHeaders = headers.map((header) => csvHeader(entryType, header)).filter(Boolean)
  const duplicate = cleanHeaders.find((header, index) => cleanHeaders.indexOf(header) !== index)
  if (duplicate) {
    throw new TemplateUploadError(`Duplicate CSV column: ${duplicate}. Keep one column per field.`)
  }
  return bodyRows.flatMap((bodyRow, rowIndex) =>
    bodyRow.some((value) => value.trim())
      ? [normalizeDateCells(Object.fromEntries(
        cleanHeaders.map((header, index) => [
          header,
          bodyRow[index]?.trim() ?? "",
        ])
      ), rowIndex + 2)]
      : []
  )
}

const machineMasterTextFields = new Set([
  "machinemodelno",
  "machineserialno",
  "machinestabiliserno",
  "machinemcbno",
])
const workOrderQuantityFields = new Set(["orderPcs", "orderKg", "requiredRmKg"])

function normalizeImportedPayload(
  row: Record<string, unknown>,
  entryType: string
) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      (entryType === "machine_master" &&
        machineMasterTextFields.has(key.toLowerCase().replace(/[^a-z0-9]/g, ""))) ||
      (entryType === "rm_inward" && key === "rmLocation")
        ? text(value)
        : normalizeImportedValue(
            value,
            (entryType === "rm_inward" && key === "rmInwardKg") ||
              (entryType === "work_order" && workOrderQuantityFields.has(key))
          ),
    ])
  )
}

function normalizeImportedValue(value: unknown, allowGrouping: boolean) {
  const cleaned = text(value)
  if (cleaned === "") return ""
  const numericText = allowGrouping && /^-?(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d+)?$/.test(cleaned)
    ? cleaned.replaceAll(",", "")
    : cleaned
  const numericValue = Number(numericText)
  return Number.isFinite(numericValue) && /^-?\d+(\.\d+)?$/.test(numericText)
    ? numericValue
    : cleaned
}

function text(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : value === undefined || value === null
      ? ""
      : String(value)
}
