import type { Pool, PoolClient } from "pg"
import { describe, expect, test, vi } from "vitest"

import {
  createRecruitmentRepository,
  deriveRecruitmentEmployeeAssignment,
  deriveRecruitmentPostStatus,
  isActiveRecruitmentApplicationStatus,
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
    const query = vi.fn(async (statement: string, _parameters?: unknown[]) => {
      void _parameters
      if (statement.includes("lower(combined.vacancy_code)")) {
        return {
          rowCount: 1,
          rows: [
            {
              post_id: combinedPostId,
              target_code: "cmb-1",
              target_type: "combined",
            },
          ],
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
        nextRound: "Technical Round",
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
    const query = vi.fn(async (statement: string, _parameters?: unknown[]) => {
      void _parameters
      if (
        statement.includes("SELECT id") &&
        statement.includes("FROM recruitment.applications")
      ) {
        return { rows: [{ id: "application-1", status: "Assigned" }] }
      }
      if (statement.includes("SELECT round_name, status")) {
        return { rows: [] }
      }
      if (statement.includes("UPDATE recruitment.applications")) {
        return { rows: [{ id: "application-1", status: "Interview" }] }
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
    })

    expect(
      query.mock.calls.some(
        ([statement]) =>
          statement.includes("INSERT INTO recruitment.interviews") &&
          statement.includes("'Scheduled'") &&
          statement.includes("scheduled_at")
      )
    ).toBe(true)
    expect(
      query.mock.calls.some(
        ([statement, parameters]) =>
          statement.includes("INSERT INTO recruitment.interviews") &&
          parameters?.[2] === "Screening Round"
      )
    ).toBe(true)
  })

  test("rejects a manually supplied later outcome round", async () => {
    const query = vi.fn(async (statement: string) => {
      if (
        statement.includes("SELECT id") &&
        statement.includes("FROM recruitment.applications")
      ) {
        return { rows: [{ id: "application-1", status: "Interview" }] }
      }
      if (statement.includes("SELECT round_name, status")) {
        return { rows: [] }
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

    await expect(
      repository.recordInterview({
        applicationId: "application-1",
        organizationId: "organization-1",
        questionScores: {},
        roundName: "Technical Round",
        status: "Approved",
      })
    ).rejects.toThrow("The next required round is Screening Round.")
  })

  test("stores every preset question score with the interview", async () => {
    const query = vi.fn(async (statement: string, _parameters?: unknown[]) => {
      void _parameters
      if (
        statement.includes("SELECT id") &&
        statement.includes("FROM recruitment.applications")
      ) {
        return { rows: [{ id: "application-1", status: "Interview" }] }
      }
      if (statement.includes("SELECT round_name, status")) {
        return { rows: [] }
      }
      if (statement.includes("INSERT INTO recruitment.interviews")) {
        return { rows: [{ id: "interview-1" }] }
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

    await repository.recordInterview({
      applicationId: "application-1",
      interviewerName: "HR Manager",
      organizationId: "organization-1",
      questionScores: {
        availability_suitability: 3,
        communication_clarity: 4,
        relevant_experience: 5,
        role_understanding: 4,
        screening_recommendation: 5,
      },
      roundName: "Screening Round",
      status: "Approved",
    })

    const insertCall = query.mock.calls.find(([statement]) =>
      statement.includes("INSERT INTO recruitment.interviews")
    )
    const storedScores = JSON.parse(String(insertCall?.[1]?.[5]))
    expect(storedScores.overall).toBe(4.2)
    expect(storedScores.questions).toEqual(
      expect.objectContaining({
        communication_clarity: 4,
        relevant_experience: 5,
      })
    )
  })
})

describe("candidate application cycles", () => {
  test.each(["Assigned", "Interview", "Hold"])(
    "treats %s as an active application",
    (status) => {
      expect(isActiveRecruitmentApplicationStatus(status)).toBe(true)
    }
  )

  test.each(["Approved", "Rejected", "Withdrawn"])(
    "treats %s as a closed application",
    (status) => {
      expect(isActiveRecruitmentApplicationStatus(status)).toBe(false)
    }
  )

  test("does not reopen a closed application for another interview", async () => {
    const query = vi.fn(async (statement: string) => {
      if (
        statement.includes("SELECT id, status") &&
        statement.includes("FROM recruitment.applications")
      ) {
        return { rows: [{ id: "application-1", status: "Rejected" }] }
      }
      return { rows: [] }
    })
    const client = {
      query,
      release: vi.fn(),
    } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: {
        connect: vi.fn(async () => client),
      } as unknown as Pool,
    })

    await expect(
      repository.scheduleInterview({
        applicationId: "application-1",
        interviewAt: "2026-08-10T10:00",
        organizationId: "organization-1",
      })
    ).rejects.toThrow("This candidate application is closed.")
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("SELECT round_name, status")
      )
    ).toBe(false)
  })

  test("rejects a second active application for the same candidate and job", async () => {
    const query = vi.fn(async (statement: string) => {
      if (
        statement.includes("SELECT candidate.name AS candidate_name") &&
        statement.includes("status IN ('Assigned', 'Interview', 'Hold')")
      ) {
        return { rows: [{ candidate_name: "Candidate One" }] }
      }
      return { rows: [] }
    })
    const client = {
      query,
      release: vi.fn(),
    } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: {
        connect: vi.fn(async () => client),
      } as unknown as Pool,
    })

    await expect(
      repository.assignCandidate({
        candidateId: "candidate-1",
        jobId: "job-1",
        organizationId: "organization-1",
      })
    ).rejects.toThrow("Candidate One already has an active application")
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("INSERT INTO recruitment.applications")
      )
    ).toBe(false)
  })

  test("creates a new application cycle without overwriting closed history", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("SELECT candidate.name AS candidate_name")) {
        return { rows: [] }
      }
      if (statement.includes("INSERT INTO recruitment.applications")) {
        return {
          rows: [{ candidate_id: "candidate-1", id: "application-2" }],
        }
      }
      return { rows: [] }
    })
    const client = {
      query,
      release: vi.fn(),
    } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: {
        connect: vi.fn(async () => client),
      } as unknown as Pool,
    })

    await expect(
      repository.assignCandidate({
        candidateId: "candidate-1",
        jobId: "job-1",
        organizationId: "organization-1",
      })
    ).resolves.toEqual({ id: "application-2" })

    const insertStatement = query.mock.calls.find(([statement]) =>
      statement.includes("INSERT INTO recruitment.applications")
    )?.[0]
    expect(insertStatement).toContain(
      "WHERE status IN ('Assigned', 'Interview', 'Hold')"
    )
    expect(insertStatement).toContain("DO NOTHING")
    expect(insertStatement).not.toContain("DO UPDATE")
  })

  test("assigns multiple selected candidates to one job atomically", async () => {
    const query = vi.fn(
      async (statement: string, _parameters?: readonly unknown[]) => {
        void _parameters
        if (statement.includes("SELECT candidate.name AS candidate_name")) {
          return { rows: [] }
        }
        if (statement.includes("INSERT INTO recruitment.applications")) {
          return {
            rows: [
              { candidate_id: "candidate-2", id: "application-2" },
              { candidate_id: "candidate-1", id: "application-1" },
            ],
          }
        }
        return { rows: [] }
      }
    )
    const client = {
      query,
      release: vi.fn(),
    } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: {
        connect: vi.fn(async () => client),
      } as unknown as Pool,
    })

    await expect(
      repository.assignCandidates({
        candidateIds: ["candidate-1", "candidate-2"],
        jobId: "job-1",
        organizationId: "organization-1",
      })
    ).resolves.toHaveLength(2)

    const insertCall = query.mock.calls.find(([statement]) =>
      statement.includes("INSERT INTO recruitment.applications")
    )
    expect(insertCall?.[1]?.[4]).toEqual(["candidate-1", "candidate-2"])
    const auditCalls = query.mock.calls.filter(([statement]) =>
      statement.includes("INSERT INTO audit.events")
    )
    expect(auditCalls).toHaveLength(1)
    const auditEvents = JSON.parse(String(auditCalls[0]![1]![0])) as Array<{
      metadata: {
        candidateId: string
        commandId: string
        commandOrdinal: number
        selectionOrdinal: number
      }
      sourceId: string
      targetId: string
    }>
    const commandId = auditEvents[0]!.metadata.commandId
    expect(auditEvents).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({
          candidateId: "candidate-1",
          commandId,
          commandOrdinal: 0,
          selectionOrdinal: 0,
        }),
        sourceId: `recruitment:${commandId}:000000`,
        targetId: "application-1",
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          candidateId: "candidate-2",
          commandId,
          commandOrdinal: 1,
          selectionOrdinal: 1,
        }),
        sourceId: `recruitment:${commandId}:000001`,
        targetId: "application-2",
      }),
    ])
  })

  test("rolls back the complete selection when one candidate becomes unavailable", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("SELECT candidate.name AS candidate_name")) {
        return { rows: [] }
      }
      if (statement.includes("INSERT INTO recruitment.applications")) {
        return {
          rows: [{ candidate_id: "candidate-1", id: "application-1" }],
        }
      }
      return { rows: [] }
    })
    const client = {
      query,
      release: vi.fn(),
    } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: {
        connect: vi.fn(async () => client),
      } as unknown as Pool,
    })

    await expect(
      repository.assignCandidates({
        candidateIds: ["candidate-1", "candidate-2"],
        jobId: "job-1",
        organizationId: "organization-1",
      })
    ).rejects.toThrow("One or more selected candidates could not be assigned")
    expect(query).toHaveBeenCalledWith("ROLLBACK")
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("INSERT INTO audit.events")
      )
    ).toBe(false)
  })

  test("lists the jobs where each candidate has an active application", async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          active_application_job_ids: ["job-1", "job-2"],
          application_count: 3,
          current_company: null,
          departments: ["Quality Control"],
          email: "candidate@example.com",
          event_count: 1,
          experience: "4 years",
          id: "candidate-1",
          name: "Candidate One",
          phone: "9999999999",
          source: "Referral",
          status: "Active",
        },
      ],
    }))
    const repository = createRecruitmentRepository({
      pool: { query } as unknown as Pool,
    })

    await expect(repository.listCandidates("organization-1")).resolves.toEqual([
      expect.objectContaining({
        activeApplicationJobIds: ["job-1", "job-2"],
        applicationCount: 3,
        id: "candidate-1",
      }),
    ])
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
