import { describe, expect, test } from "vitest"

import {
  deriveRecruitmentEmployeeAssignment,
  deriveRecruitmentPostStatus,
  recruitmentPostDeletionBlocker,
} from "./recruitment"
import {
  nextRecruitmentCombinedRoleIdentity,
  nextRecruitmentPostIdentity,
  nextRecruitmentTemplateCode,
  recruitmentAdvisoryLockKey,
} from "./recruitment-codes"

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

  test.each(["Appointed", "Occupied", "Resigned"])(
    "keeps the software-driven %s status when a person is assigned",
    (storedStatus) => {
      expect(
        deriveRecruitmentPostStatus({
          employeeCode: "EMP-104",
          employeeName: "Assigned employee",
          storedStatus,
        })
      ).toBe(storedStatus)
    }
  )
})

describe("deriveRecruitmentEmployeeAssignment", () => {
  test("records an appointment before the person joins", () => {
    expect(
      deriveRecruitmentEmployeeAssignment({
        employeeCode: "EMP-104",
        employeeEvent: "Appointed",
        employeeName: "New employee",
      })
    ).toEqual({
      employeeCode: "EMP-104",
      employeeName: "New employee",
      status: "Appointed",
    })
  })

  test("changes an existing appointment to occupied when the person joins", () => {
    expect(
      deriveRecruitmentEmployeeAssignment({
        currentEmployeeCode: "EMP-104",
        currentEmployeeName: "New employee",
        employeeEvent: "Joined",
      })
    ).toEqual({
      employeeCode: "EMP-104",
      employeeName: "New employee",
      status: "Occupied",
    })
  })

  test("retains the employee identity when they resign", () => {
    expect(
      deriveRecruitmentEmployeeAssignment({
        currentEmployeeCode: "EMP-104",
        currentEmployeeName: "New employee",
        employeeEvent: "Resigned",
      })
    ).toEqual({
      employeeCode: "EMP-104",
      employeeName: "New employee",
      status: "Resigned",
    })
  })

  test("clears the assignment and returns the post to vacant", () => {
    expect(
      deriveRecruitmentEmployeeAssignment({
        currentEmployeeCode: "EMP-104",
        currentEmployeeName: "New employee",
        employeeEvent: "Removed",
      })
    ).toEqual({ employeeCode: null, employeeName: null, status: "Vacant" })
  })
})

describe("recruitmentPostDeletionBlocker", () => {
  test("allows an unassigned post with no linked records to be deleted", () => {
    expect(
      recruitmentPostDeletionBlocker({
        combinedRoleLinks: 0,
        employeeCode: null,
        employeeName: null,
        jobPostLinks: 0,
      })
    ).toBeNull()
  })

  test("protects an assigned post", () => {
    expect(
      recruitmentPostDeletionBlocker({
        combinedRoleLinks: 0,
        employeeCode: "EMP-104",
        employeeName: "Assigned employee",
        jobPostLinks: 0,
      })
    ).toContain("employee assignment")
  })

  test("protects posts used by combined roles or job posts", () => {
    expect(
      recruitmentPostDeletionBlocker({
        combinedRoleLinks: 1,
        jobPostLinks: 0,
      })
    ).toContain("combined role")
    expect(
      recruitmentPostDeletionBlocker({
        combinedRoleLinks: 0,
        jobPostLinks: 1,
      })
    ).toContain("job post")
  })
})

describe("nextRecruitmentTemplateCode", () => {
  test("shows the next sequential JRT code", () => {
    expect(
      nextRecruitmentTemplateCode(["JRT-0001", "JRT-0012", "LEGACY-CODE"])
    ).toBe("JRT-0013")
  })

  test("starts an empty template register at JRT-0001", () => {
    expect(nextRecruitmentTemplateCode([])).toBe("JRT-0001")
  })
})

describe("nextRecruitmentPostIdentity", () => {
  test("generates the next post identity for a department and designation", () => {
    expect(
      nextRecruitmentPostIdentity({
        departmentCode: "CK",
        designationCode: "WK",
        existingPostCodes: ["CK-WK-1", "CK-WK-10", "CK-HD-2", "AF-WK-30"],
      })
    ).toEqual({
      postCode: "CK-WK-11",
      vacancyCode: "CK-WK-11",
      vacancyNumber: "11",
    })
  })

  test("waits until department and designation are selected", () => {
    expect(
      nextRecruitmentPostIdentity({
        departmentCode: "CK",
        designationCode: "",
        existingPostCodes: ["CK-WK-1"],
      })
    ).toBeNull()
  })
})

describe("nextRecruitmentCombinedRoleIdentity", () => {
  test("generates the next combined-role identity", () => {
    expect(
      nextRecruitmentCombinedRoleIdentity(["CMB-1", "CMB-8", "LEGACY"])
    ).toEqual({
      defaultName: "Combined 9",
      vacancyCode: "CMB-9",
    })
  })

  test("starts an empty combined-role register at CMB-1", () => {
    expect(nextRecruitmentCombinedRoleIdentity([])).toEqual({
      defaultName: "Combined 1",
      vacancyCode: "CMB-1",
    })
  })
})

describe("recruitmentAdvisoryLockKey", () => {
  test("builds one normalized text key for PostgreSQL advisory locks", () => {
    expect(recruitmentAdvisoryLockKey([" ORG-ID ", "AF", "Hd"])).toBe(
      "org-id:af:hd"
    )
  })
})
