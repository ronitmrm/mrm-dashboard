const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

export function tableFilterDate(value: string) {
  const text = value.trim()
  let year: number
  let month: number
  let day: number
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ,·])/.exec(text)
  const named = /^(\d{1,2})[- ]([a-z]{3,9})[- ](\d{4}|\d{2})(?:$|[, ·])/i.exec(
    text
  )
  const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:$|[, ])/.exec(text)
  if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else if (named) {
    year = Number(named[3]) + (named[3]!.length === 2 ? 2000 : 0)
    month =
      monthNames.findIndex((name) =>
        name.toLowerCase().startsWith(named[2]!.toLowerCase())
      ) + 1
    day = Number(named[1])
  } else if (numeric) {
    year = Number(numeric[3])
    month = Number(numeric[2])
    day = Number(numeric[1])
  } else return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    year < 1000 ||
    month < 1 ||
    month > 12 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null
  const clock =
    /(?:[, ]+|T)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(am|pm))?/i.exec(text)
  let time = date.getTime()
  if (clock) {
    let hour = Number(clock[1])
    const minute = Number(clock[2])
    const second = Number(clock[3] ?? 0)
    if (clock[4])
      hour = (hour % 12) + (clock[4].toLowerCase() === "pm" ? 12 : 0)
    if (hour < 24 && minute < 60 && second < 60)
      time += ((hour * 60 + minute) * 60 + second) * 1000
  }
  return {
    year,
    month,
    day,
    monthLabel: monthNames[month - 1]!,
    time: iso && text.includes("T") ? Date.parse(text) || time : time,
  }
}

type DateDay = { day: number; values: string[] }
type DateMonth = {
  month: number
  label: string
  values: string[]
  days: DateDay[]
}
type DateYear = { year: number; values: string[]; months: DateMonth[] }

export function groupTableFilterDates(options: string[]) {
  const years = new Map<number, Map<number, Map<number, string[]>>>()
  const otherValues: string[] = []
  for (const option of options) {
    const date = tableFilterDate(option)
    if (!date) {
      otherValues.push(option)
      continue
    }
    const months =
      years.get(date.year) ?? new Map<number, Map<number, string[]>>()
    const days = months.get(date.month) ?? new Map<number, string[]>()
    days.set(date.day, [...(days.get(date.day) ?? []), option])
    months.set(date.month, days)
    years.set(date.year, months)
  }
  const grouped: DateYear[] = [...years]
    .sort(([a], [b]) => b - a)
    .map(([year, months]) => {
      const groupedMonths = [...months]
        .sort(([a], [b]) => a - b)
        .map(([month, days]) => {
          const groupedDays = [...days]
            .sort(([a], [b]) => a - b)
            .map(([day, values]) => ({ day, values }))
          return {
            month,
            label: monthNames[month - 1]!,
            days: groupedDays,
            values: groupedDays.flatMap((day) => day.values),
          }
        })
      return {
        year,
        months: groupedMonths,
        values: groupedMonths.flatMap((month) => month.values),
      }
    })
  return { years: grouped, otherValues }
}

export function tableDateSearchText(value: string) {
  const date = tableFilterDate(value)
  return date ? `${value} ${date.year} ${date.monthLabel} ${date.day}` : value
}
