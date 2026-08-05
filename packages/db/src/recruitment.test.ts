import { describe, expect, test } from "vitest"

import { deriveRecruitmentPostStatus } from "./recruitment"

describe("deriveRecruitmentPostStatus", () => {
  test("marks a post occupied when an employee code is assigned", () => {
    expect(
      deriveRecruitmentPostStatus({
        employeeCode: "EMP-104",
        employeeName: null,
        storedStatus: "Vacant",
      })
    ).toBe("Occupied")
  })

  test("marks a post vacant when no employee is assigned", () => {
    expect(
      deriveRecruitmentPostStatus({
        employeeCode: " ",
        employeeName: null,
        storedStatus: "Occupied",
      })
    ).toBe("Vacant")
  })

  test("keeps a deliberately inactive post inactive", () => {
    expect(
      deriveRecruitmentPostStatus({
        employeeCode: "EMP-104",
        employeeName: "Assigned employee",
        storedStatus: "Inactive",
      })
    ).toBe("Inactive")
  })
})
