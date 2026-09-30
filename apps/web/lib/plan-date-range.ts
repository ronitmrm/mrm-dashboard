import { istDateValue } from "./date-time"

export function planDateRange(start?: string, end?: string, month?: string) {
  const today = istDateValue()
  const initialMonth = !start && !end && month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ? month : today.slice(0, 7)
  const defaultStart = `${initialMonth}-01`
  const defaultEnd = new Date(Date.UTC(Number(initialMonth.slice(0, 4)), Number(initialMonth.slice(5, 7)), 0))
    .toISOString().slice(0, 10)
  const valid = (value: string | undefined) =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  const from = valid(start) ? start! : defaultStart
  const to = valid(end) ? end! : defaultEnd
  return from <= to ? { from, to } : { from: defaultStart, to: defaultEnd }
}
