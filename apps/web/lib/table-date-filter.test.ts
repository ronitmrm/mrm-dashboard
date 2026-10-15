import { expect, test } from "vitest"
import {
  groupTableFilterDates,
  tableFilterDate,
  tableDateSearchText,
} from "@workspace/ui/lib/table-date-filter"
import {
  filterRowsByTableColumns,
  sortRowsByTableColumn,
} from "@workspace/ui/lib/table-filter-state"

test("groups dates by year/month/day while retaining exact values for filtering and sorting", () => {
  const values = ["26-Mar-26", "2026-03-26", "15-Jan-26", "31/12/2025", "-"]
  const grouped = groupTableFilterDates(values)
  expect(grouped.years.map((year) => year.year)).toEqual([2026, 2025])
  expect(grouped.years[0]?.months.map((month) => month.label)).toEqual([
    "January",
    "March",
  ])
  const march = grouped.years[0]!.months[1]!
  expect(march.days).toEqual([{ day: 26, values: ["26-Mar-26", "2026-03-26"] }])
  expect(grouped.otherValues).toEqual(["-"])
  expect(tableDateSearchText("26-Mar-26")).toContain("2026 March 26")
  const rows = values.map((date) => ({ date }))
  expect(
    filterRowsByTableColumns(
      rows,
      [{ index: 0, label: "PO Date", options: values }],
      { 0: march.values },
      (row) => [row.date]
    )
  ).toEqual(rows.slice(0, 2))
  expect(
    sortRowsByTableColumn(rows, { columnIndex: 0, direction: "asc" }, (row) => [
      row.date,
    ]).map((row) => row.date)
  ).toEqual(["31/12/2025", "15-Jan-26", "26-Mar-26", "2026-03-26", "-"])
  expect(
    sortRowsByTableColumn(
      rows,
      { columnIndex: 0, direction: "desc" },
      (row) => [row.date]
    )[0]?.date
  ).toBe("26-Mar-26")
})

test("keeps invalid dates and ordinary codes outside the date hierarchy", () => {
  expect(tableFilterDate("30-Feb-26")).toBeNull()
  expect(groupTableFilterDates(["P2287", "179", "30-Feb-26"]).years).toEqual([])
})
