import { formatCalendarDate, isIsoCalendarDate, parseCalendarDateInput } from "@workspace/ui/lib/calendar-date"

export const IST_TIME_ZONE = "Asia/Kolkata"

type DateTimeValue = Date | number | string | null | undefined

function parsedDate(value: DateTimeValue) {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}[T ]/.test(value)) {
      if (!isIsoCalendarDate(value.slice(0, 10))) return null
    } else {
      const calendar = parseCalendarDateInput(formatCalendarDate(value))
      return calendar ? new Date(`${calendar}T00:00:00Z`) : null
    }
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function format(value: DateTimeValue, options: Intl.DateTimeFormatOptions) {
  const date = parsedDate(value)
  if (!date) return "-"
  return new Intl.DateTimeFormat("en-GB", {
    ...options,
    timeZone: IST_TIME_ZONE,
  }).format(date)
}

function istParts(value: DateTimeValue) {
  const date = parsedDate(value)
  if (!date) return null
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: IST_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ""
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  }
}

export function formatIstDate(value: DateTimeValue) {
  if (typeof value === "string" && isIsoCalendarDate(value)) return formatCalendarDate(value)
  return format(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export function formatIstTime(value: DateTimeValue) {
  return format(value, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  })
}

export function formatIstDateTime(value: DateTimeValue) {
  return format(value, {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export function istDateValue(value: DateTimeValue = new Date()) {
  return istParts(value)?.date ?? ""
}

export function isPastOrTodayIstDate(value: string, today = istDateValue()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function istDateTimeInputValue(value: DateTimeValue = new Date()) {
  const parts = istParts(value)
  return parts ? `${parts.date}T${parts.time}` : ""
}

export function istDateTimeInputToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value) || !isIsoCalendarDate(value.slice(0, 10))) return ""
  const date = new Date(`${value}:00.000+05:30`)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}

export function istDateTimeInputParts(value: string) {
  const [date = "", time = ""] = value.split("T", 2)
  return { date, time }
}
