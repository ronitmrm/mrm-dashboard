function isoDate(year: number, month: number, day: number) {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return null
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** The only accepted format for newly typed/imported calendar dates. */
export function parseCalendarDateInput(value: unknown) {
  if (typeof value !== "string") return null
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  return match ? isoDate(Number(match[3]), Number(match[2]), Number(match[1])) : null
}

export function isIsoCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return Boolean(match && isoDate(Number(match[1]), Number(match[2]), Number(match[3])) === value)
}

/** Display existing calendar values without using the browser's ambiguous date parser. */
export function formatCalendarDate(value: unknown): string {
  if (value === null || value === undefined) return ""
  const text = String(value).trim()
  let iso = isIsoCalendarDate(text) ? text : parseCalendarDateInput(text)
  if (!iso) {
    // Existing workbook date columns use day/month/year, including two-digit years.
    const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(text)
    const named = /^(\d{1,2})[- ]([A-Za-z]{3,9})[- ](\d{2}|\d{4})$/.exec(text)
    const match = numeric ?? named
    if (match) {
      const names = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
      const label = match[2]!.toLowerCase()
      const month = numeric ? Number(match[2]) : names.findIndex((name) => name === label || name.slice(0, 3) === label || (name === "september" && label === "sept")) + 1
      const year = Number(match[3]) + (match[3]!.length === 2 ? 2000 : 0)
      iso = isoDate(year, month, Number(match[1]))
    }
  }
  if (!iso) return text
  const [year, month, day] = iso.split("-")
  return `${day}/${month}/${year}`
}

export function calendarInputDisplay(value: string, withTime = false) {
  const [date = "", time = ""] = value.split("T")
  if (!isIsoCalendarDate(date)) return value
  return `${formatCalendarDate(date)}${withTime ? ` ${time}` : ""}`
}

export function parseCalendarInput(value: string, withTime = false) {
  if (!withTime) return parseCalendarDateInput(value)
  const match = /^(\d{2}\/\d{2}\/\d{4}) (\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?$/.exec(value)
  const date = match ? parseCalendarDateInput(match[1]) : null
  if (!match || !date || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59) return null
  return `${date}T${match[2]}:${match[3]}${match[4] ? `:${match[4]}${match[5] ?? ""}` : ""}`
}
