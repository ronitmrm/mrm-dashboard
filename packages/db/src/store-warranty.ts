export function isWarrantyDayCount(value?: string | null): value is string {
  const period = value?.trim()
  return Boolean(period && /^\d+$/.test(period) &&
    Number.isSafeInteger(Number(period)) && Number(period) > 0)
}

export function warrantyPeriodDays(value?: string | null) {
  const period = value?.trim()
  if (!period) return null
  if (!isWarrantyDayCount(period)) {
    throw new Error("Warranty Period must be a positive whole number of days.")
  }
  return Number(period)
}

export function warrantyEndDate(installedOn?: string | null, days?: number | null) {
  if (!installedOn || days === null || days === undefined) return null
  const date = new Date(`${installedOn}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(installedOn) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== installedOn
  ) {
    throw new Error("Installation Date must be a valid calendar date.")
  }
  date.setUTCDate(date.getUTCDate() + days)
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Warranty Period is too large.")
  }
  const end = date.toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new Error("Warranty Period is too large.")
  }
  return end
}
