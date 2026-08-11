import { describe, expect, it } from "vitest"

import { APPROVED_POST_FILTER_COLUMNS } from "./approved-post-filter-columns"

describe("Employee Master filters", () => {
  it("renders each filter below its matching Employee Master column", () => {
    const expectedKeys = [
      "postCode",
      "vacancyCode",
      "department",
      "designation",
      "template",
      "employeeName",
      "employeeCode",
      "joiningDate",
      "lastWorkingDate",
      "status",
    ]

    expect(APPROVED_POST_FILTER_COLUMNS.map((column) => column.key)).toEqual(
      expectedKeys
    )
  })
})
