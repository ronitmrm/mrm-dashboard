import type { Pool, PoolClient } from "pg"
import { describe, expect, test, vi } from "vitest"

import {
  createRecruitmentRepository,
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

describe("assignEmployee", () => {
  test("assigns the employee to every post in a combined role", async () => {
    const selectedPostId = "00000000-0000-4000-8000-000000000001"
    const relatedPostId = "00000000-0000-4000-8000-000000000002"
    const query = vi.fn(
      async (statement: string, parameters?: readonly unknown[]) => {
        if (statement.includes("FROM recruitment.combined_role_posts")) {
          return {
            rowCount: 2,
            rows: [
              {
                employee_code: null,
                employee_name: null,
                id: selectedPostId,
              },
              {
                employee_code: null,
                employee_name: null,
                id: relatedPostId,
              },
            ],
          }
        }
        if (statement.includes("SELECT id, employee_name, employee_code")) {
          return {
            rowCount: 1,
            rows: [
              {
                combined_role_id: "00000000-0000-4000-8000-000000000003",
                employee_code: null,
                employee_name: null,
                id: selectedPostId,
              },
            ],
          }
        }
        if (statement.includes("UPDATE recruitment.posts")) {
          return {
            rowCount: 2,
            rows: [{ id: selectedPostId }, { id: relatedPostId }],
          }
        }
        return { rowCount: 0, rows: [], parameters }
      }
    )
    const client = {
      query,
      release: vi.fn(),
    } as unknown as PoolClient
    const pool = {
      connect: vi.fn(async () => client),
    } as unknown as Pool
    const repository = createRecruitmentRepository({ pool })

    await repository.assignEmployee({
      employeeCode: "EMP-104",
      employeeEvent: "Appointed",
      employeeName: "Combined employee",
      organizationId: "00000000-0000-4000-8000-000000000010",
      postId: selectedPostId,
    })

    const updateCall = query.mock.calls.find(([statement]) =>
      statement.includes("UPDATE recruitment.posts")
    )
    expect(updateCall?.[1]?.[4]).toEqual([selectedPostId, relatedPostId])
  })

  test("rejects a bulk workbook before updating when any target is invalid", async () => {
    const combinedPostId = "00000000-0000-4000-8000-000000000001"
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("lower(combined.vacancy_code)")) {
        return {
          rowCount: 1,
          rows: [{ post_id: combinedPostId, target_code: "cmb-1" }],
        }
      }
      if (statement.includes("lower(post_code) AS target_code")) {
        return { rowCount: 0, rows: [] }
      }
      return { rowCount: 0, rows: [] }
    })
    const client = {
      query,
      release: vi.fn(),
    } as unknown as PoolClient
    const pool = {
      connect: vi.fn(async () => client),
    } as unknown as Pool
    const repository = createRecruitmentRepository({ pool })

    await expect(
      repository.bulkAssignEmployees({
        assignments: [
          {
            employeeCode: "EMP-1",
            employeeEvent: "Joined",
            employeeName: "Combined employee",
            rowNumber: 2,
            targetCode: "CMB-1",
            targetType: "combined",
          },
          {
            employeeCode: "EMP-2",
            employeeEvent: "Joined",
            employeeName: "Individual employee",
            rowNumber: 8,
            targetCode: "BAD-POST",
            targetType: "individual",
          },
        ],
        organizationId: "00000000-0000-4000-8000-000000000010",
      })
    ).rejects.toThrow(
      "Individual Posts row 8: BAD-POST is not an available individual post."
    )
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("UPDATE recruitment.posts")
      )
    ).toBe(false)
  })
})

describe("job workspace", () => {
  test("returns one job with its applications and every interview round", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("count(application.id)::int AS applicant_count")) {
        return {
          rows: [
            {
              applicant_count: 1,
              id: "job-1",
              job_number: "JOB-1",
              post_code: "QC-IN-1",
              post_date: "2026-08-06",
              status: "Open",
              target_date: "2026-08-20",
              title: "Inspector / Quality Control",
              vacancy_code: "QC-IN-1",
            },
          ],
        }
      }
      if (statement.includes("count(interview.id)::int AS interview_count")) {
        return {
          rows: [
            {
              candidate_email: "candidate@example.com",
              candidate_id: "candidate-1",
              candidate_name: "Candidate One",
              candidate_phone: "9999999999",
              current_company: null,
              experience: "4 years",
              id: "application-1",
              interview_at: "2026-08-08 10:00:00+00",
              interview_count: 2,
              joining_date: null,
              planned_round: "Department Round",
              status: "Interview",
            },
          ],
        }
      }
      if (statement.includes("FROM recruitment.interviews interview")) {
        return {
          rows: [
            {
              application_id: "application-1",
              candidate_name: "Candidate One",
              comments: "Strong fundamentals",
              created_at: "2026-08-06 09:00:00+00",
              id: "interview-1",
              interviewer_name: "Manager",
              joining_date: null,
              round_name: "Screening Round",
              scheduled_at: "2026-08-07 10:00:00+00",
              score: "8",
              status: "Approved",
              updated_at: "2026-08-07 11:00:00+00",
            },
            {
              application_id: "application-1",
              candidate_name: "Candidate One",
              comments: null,
              created_at: "2026-08-07 11:05:00+00",
              id: "interview-2",
              interviewer_name: null,
              joining_date: null,
              round_name: "Department Round",
              scheduled_at: "2026-08-08 10:00:00+00",
              score: null,
              status: "Scheduled",
              updated_at: "2026-08-07 11:05:00+00",
            },
          ],
        }
      }
      return { rows: [] }
    })
    const repository = createRecruitmentRepository({
      pool: { query } as unknown as Pool,
    })

    const workspace = await repository.getJobWorkspace(
      "organization-1",
      "job-1"
    )

    expect(workspace?.job.jobNumber).toBe("JOB-1")
    expect(workspace?.applications[0]).toEqual(
      expect.objectContaining({
        candidateName: "Candidate One",
        interviewCount: 2,
      })
    )
    expect(workspace?.interviews).toEqual([
      expect.objectContaining({ roundName: "Screening Round", score: 8 }),
      expect.objectContaining({
        roundName: "Department Round",
        status: "Scheduled",
      }),
    ])
  })

  test("stores a schedule on the interview round as well as the application", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("UPDATE recruitment.applications")) {
        return { rows: [{ id: "application-1" }] }
      }
      return { rows: [] }
    })
    const client = {
      query,
      release: vi.fn(),
    } as unknown as PoolClient
    const pool = {
      connect: vi.fn(async () => client),
    } as unknown as Pool
    const repository = createRecruitmentRepository({ pool })

    await repository.scheduleInterview({
      applicationId: "application-1",
      interviewAt: "2026-08-08T10:00",
      organizationId: "organization-1",
      plannedRound: "Department Round",
    })

    expect(
      query.mock.calls.some(
        ([statement]) =>
          statement.includes("INSERT INTO recruitment.interviews") &&
          statement.includes("'Scheduled'") &&
          statement.includes("scheduled_at")
      )
    ).toBe(true)
  })
})

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
