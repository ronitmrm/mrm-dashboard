export const IST_TIME_ZONE = "Asia/Kolkata"

type DateTimeValue = Date | number | string | null | undefined

function parsedDate(value: DateTimeValue) {
  if (value === null || value === undefined || value === "") return null
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
  return format(value, {
    day: "2-digit",
    month: "short",
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
    month: "short",
    year: "numeric",
  })
}

export function istDateValue(value: DateTimeValue = new Date()) {
  return istParts(value)?.date ?? ""
}

export function istDateTimeInputValue(value: DateTimeValue = new Date()) {
  const parts = istParts(value)
  return parts ? `${parts.date}T${parts.time}` : ""
}

export function istDateTimeInputToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return ""
  const date = new Date(`${value}:00.000+05:30`)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}
