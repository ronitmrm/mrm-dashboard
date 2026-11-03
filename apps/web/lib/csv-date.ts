import { formatCalendarDate, parseCalendarDateInput } from "@workspace/ui/lib/calendar-date"

export function parseCsvDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{2}-\d{2}-\d{4}$/.test(value)) return null
  return parseCalendarDateInput(value.replaceAll("-", "/"))
}

export function formatCsvDate(value: unknown) {
  const date = formatCalendarDate(value)
  return parseCalendarDateInput(date) ? date.replaceAll("/", "-") : date
}

export function isCsvDateColumn(column: string) {
  const key = column.trim().replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_")
  return key.split("_").includes("date") || [
    "rm inward date", "po date", "machine installation date", "effective from",
    "setup date", "prod date", "production date", "date of birth", "last working date",
    "valid from", "joined", "left", "joined on", "ended on", "received on", "due on",
    "received", "next followup",
  ].some((name) => name.replaceAll(" ", "") === key.replaceAll("_", ""))
}

export function csvDateValue(value: unknown, rowNumber: number, column: string) {
  const text = String(value ?? "").trim()
  if (!text) return ""
  const date = parseCsvDate(text)
  if (!date) {
    throw new Error(`CSV row ${rowNumber}: ${column} "${text}" must be a valid date in DD-MM-YYYY format (e.g. 21-09-2026). No rows were imported.`)
  }
  return date
}

export function validateCsvDateCells(row: Record<string, unknown>, rowNumber: number) {
  for (const [column, value] of Object.entries(row)) {
    if (isCsvDateColumn(column)) csvDateValue(value, rowNumber, column)
  }
}

export function formatCsvDates(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).map(([column, value]) => [
    column, isCsvDateColumn(column) && value ? formatCsvDate(value) : value,
  ]))
}
