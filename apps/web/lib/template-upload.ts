import { normalizeUserEnteredPayload } from "@workspace/db/user-entry-text"

import { dedupeCsvImportRows } from "./auto-coded-master-import"
import { parseRmInwardUploadDate } from "./rm-inward-date"

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
  const rows = parseCsv(csvText)
    .map((row) => normalizeImportedPayload(row, entryType))
    .map((payload) => normalizeUserEnteredPayload(payload))
    .filter((row) => Object.values(row).some((value) => text(value)))
  if (entryType === "rm_inward") {
    const failures = rows.flatMap((row, index) => {
      const date = parseRmInwardUploadDate(row.rmInwardDate)
      return date ? [] : [`Row ${index + 2}: RM Inward Date "${text(row.rmInwardDate) || "blank"}" must be DD-MM-YYYY (e.g. 21-09-2026).`]
    })
    if (failures.length) {
      throw new TemplateUploadError(
        `Import failed; no rows saved. ${failures.slice(0, 10).join(" ")}${failures.length > 10 ? ` ${failures.length - 10} more row(s) failed.` : ""}`
      )
    }
    for (const row of rows) {
      row.rmInwardDate = parseRmInwardUploadDate(row.rmInwardDate)!
    }
  }
  return dedupeCsvImportRows(entryType, rows)
}

function decodeDataUrl(value: string) {
  const [, encoded = value] = value.split(",", 2)
  return Buffer.from(encoded, "base64")
    .toString("utf8")
    .replace(/^\uFEFF/, "")
}

function parseCsv(csvText: string): Array<Record<string, unknown>> {
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
    } else if (char === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else if (char !== "\r") {
      cell += char
    }
  }

  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }

  const [headers = [], ...bodyRows] = rows
  const cleanHeaders = headers.map((header) => header.trim()).filter(Boolean)
  return bodyRows
    .filter((bodyRow) => bodyRow.some((value) => value.trim()))
    .map((bodyRow) =>
      Object.fromEntries(
        cleanHeaders.map((header, index) => [
          header,
          bodyRow[index]?.trim() ?? "",
        ])
      )
    )
}

const machineMasterTextFields = new Set([
  "machinemodelno",
  "machineserialno",
  "machinestabiliserno",
  "machinemcbno",
])

function normalizeImportedPayload(
  row: Record<string, unknown>,
  entryType: string
) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      entryType === "machine_master" &&
      machineMasterTextFields.has(key.toLowerCase().replace(/[^a-z0-9]/g, ""))
        ? text(value)
        : normalizeImportedValue(value),
    ])
  )
}

function normalizeImportedValue(value: unknown) {
  const cleaned = text(value)
  if (cleaned === "") return ""
  const numericValue = Number(cleaned)
  return Number.isFinite(numericValue) && /^-?\d+(\.\d+)?$/.test(cleaned)
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
