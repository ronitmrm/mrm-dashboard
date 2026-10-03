import { expect, test } from "vitest"

import { warrantyEndDate, warrantyPeriodDays } from "./store-warranty"

test("calculates a unit warranty end from installation date and whole days", () => {
  expect(warrantyEndDate("2024-02-28", warrantyPeriodDays("2"))).toBe("2024-03-01")
  expect(warrantyPeriodDays("003")).toBe(3)
  expect(warrantyEndDate(null, warrantyPeriodDays("365"))).toBeNull()
  expect(() => warrantyPeriodDays("12 months")).toThrow("positive whole number of days")
})
