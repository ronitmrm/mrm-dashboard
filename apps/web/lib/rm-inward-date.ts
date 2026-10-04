const legacyMonths = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const

function validIsoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null
}

export function parseRmInwardUploadDate(value: unknown) {
  if (typeof value !== "string") return null
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim())
  if (!match) return null
  return validIsoDate(Number(match[3]), Number(match[2]), Number(match[1]))
}

export function formatRmInwardDate(value: unknown) {
  if (typeof value !== "string") return String(value ?? "")
  const cleaned = value.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleaned)
  const legacy = /^(\d{2})-([A-Za-z]{3})-(\d{2})$/.exec(cleaned)
  const month = legacy
    ? legacyMonths.findIndex((name) => name.toLowerCase() === legacy[2]?.toLowerCase()) + 1
    : 0
  const normalized = iso
    ? validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    : legacy && month
      ? validIsoDate(2000 + Number(legacy[3]), month, Number(legacy[1]))
      : parseRmInwardUploadDate(cleaned)
  if (!normalized) return cleaned
  const [year, numericMonth, day] = normalized.split("-")
  return `${day}-${numericMonth}-${year}`
}
