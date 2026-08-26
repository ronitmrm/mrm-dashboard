import { describe, expect, test } from "vitest"

import {
  deriveCombinedPostAssignment,
  deriveRecruitmentEmployeeAssignment,
  deriveRecruitmentPostStatus,
  listRecruitableApprovedPosts,
  resolveRecruitmentEmployeeAssignmentTarget,
} from "./recruitment-domain"

const post = (postCode: string, status: string) => ({ postCode, status })

describe("deriveRecruitmentPostStatus", () => {
  test("keeps an appointment appointed before the joining date", () => {
    expect(
      deriveRecruitmentPostStatus({
        currentDate: "2026-08-11",
        employeeName: "Candidate One",
        joiningDate: "2026-08-12",
        storedStatus: "Appointed",
      })
    ).toBe("Appointed")
  })

  test("keeps an appointment appointed after the planned joining date", () => {
    expect(
      deriveRecruitmentPostStatus({
        currentDate: "2026-08-12",
        employeeName: "Candidate One",
        joiningDate: "2026-08-11",
        storedStatus: "Appointed",
      })
    ).toBe("Appointed")
  })

  test("does not show a name-only assignment as occupied", () => {
    expect(
      deriveRecruitmentPostStatus({
        employeeName: "Candidate One",
        storedStatus: "Occupied",
      })
    ).toBe("Appointed")
  })
})

describe("deriveRecruitmentEmployeeAssignment", () => {
  test("rejects joining a candidate without an employee ID", () => {
    expect(() =>
      deriveRecruitmentEmployeeAssignment({
        currentEmployeeName: "Candidate One",
        employeeEvent: "Joined",
      })
    ).toThrow("Employee ID is required before the candidate can join.")
  })

  test("rejects alphabetic characters in an employee ID", () => {
    expect(() =>
      deriveRecruitmentEmployeeAssignment({
        employeeCode: "10A4",
        employeeEvent: "Joined",
        employeeName: "Candidate One",
      })
    ).toThrow("Employee ID must contain numbers only.")
  })
})

describe("deriveCombinedPostAssignment", () => {
  test("uses an occupied member for every post in a combined role", () => {
    expect(
      deriveCombinedPostAssignment([
        {
          appointedApplicationId: null,
          employeeCode: null,
          employeeName: null,
          joiningDate: null,
          lastWorkingDate: null,
          status: "Vacant",
        },
        {
          appointedApplicationId: "application-1",
          employeeCode: "104",
          employeeName: "Candidate One",
          joiningDate: "2026-08-20",
          lastWorkingDate: null,
          status: "Occupied",
        },
      ])
    ).toEqual({
      appointedApplicationId: "application-1",
      employeeCode: "104",
      employeeName: "Candidate One",
      joiningDate: "2026-08-20",
      lastWorkingDate: null,
      status: "Occupied",
    })
  })

  test("rejects combining posts occupied by different employees", () => {
    expect(() =>
      deriveCombinedPostAssignment([
        {
          appointedApplicationId: null,
          employeeCode: "104",
          employeeName: "Candidate One",
          joiningDate: null,
          lastWorkingDate: null,
          status: "Occupied",
        },
        {
          appointedApplicationId: null,
          employeeCode: "105",
          employeeName: "Candidate Two",
          joiningDate: null,
          lastWorkingDate: null,
          status: "Occupied",
        },
      ])
    ).toThrow("Combined approved posts are assigned to different employees.")
  })
})

describe("listRecruitableApprovedPosts", () => {
  test("includes vacant and resigned posts without an open job", () => {
    const result = listRecruitableApprovedPosts(
      [
        post("QC-IN-1", "Vacant"),
        post("QC-IN-2", "Resigned"),
        post("QC-IN-3", "Occupied"),
      ],
      []
    )

    expect(result.map((entry) => entry.postCode)).toEqual([
      "QC-IN-1",
      "QC-IN-2",
    ])
  })

  test("excludes a post that already has an open recruitment job", () => {
    const result = listRecruitableApprovedPosts(
      [post("QC-IN-1", "Vacant"), post("QC-IN-2", "Resigned")],
      [{ postCode: "QC-IN-2", status: "Open" }]
    )

    expect(result.map((entry) => entry.postCode)).toEqual(["QC-IN-1"])
  })

  test("ignores closed jobs and jobs without an approved post", () => {
    const result = listRecruitableApprovedPosts(
      [post("QC-IN-1", "Vacant"), post("QC-IN-2", "Resigned")],
      [
        { postCode: "QC-IN-1", status: "Closed" },
        { postCode: null, status: "Open" },
      ]
    )

    expect(result.map((entry) => entry.postCode)).toEqual([
      "QC-IN-1",
      "QC-IN-2",
    ])
  })

  test("shows one primary vacancy for a combined role", () => {
    const result = listRecruitableApprovedPosts(
      [
        {
          combinedRoleId: "combined-1",
          isPrimaryCombinedPost: true,
          postCode: "PR-OP-1",
          status: "Vacant",
        },
        {
          combinedRoleId: "combined-1",
          isPrimaryCombinedPost: false,
          postCode: "QC-IN-1",
          status: "Vacant",
        },
      ],
      []
    )

    expect(result.map((entry) => entry.postCode)).toEqual(["PR-OP-1"])
  })
})

describe("resolveRecruitmentEmployeeAssignmentTarget", () => {
  test("maps any combined-role member to its primary employee assignment", () => {
    const posts = [
      {
        combinedRoleId: "combined-1",
        id: "primary-post",
        isPrimaryCombinedPost: true,
      },
      {
        combinedRoleId: "combined-1",
        id: "manager-post",
        isPrimaryCombinedPost: false,
      },
    ]

    expect(
      resolveRecruitmentEmployeeAssignmentTarget(posts, "manager-post")?.id
    ).toBe("primary-post")
  })
})
