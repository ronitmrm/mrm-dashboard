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
  test("rejects replacing an occupied employee before the post is vacated", async () => {
    const postId = "00000000-0000-4000-8000-000000000001"
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("SELECT id, employee_name, employee_code")) {
        return {
          rows: [
            {
              can_replace: false,
              combined_role_id: null,
              employee_code: "EMP-1",
              employee_name: "Current Employee",
              id: postId,
              last_working_date: null,
              status: "Occupied",
            },
          ],
        }
      }
      return { rows: [] }
    })
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await expect(
      repository.assignEmployee({
        employeeCode: "EMP-2",
        employeeEvent: "Joined",
        employeeName: "Replacement Employee",
        organizationId: "00000000-0000-4000-8000-000000000010",
        postId,
      })
    ).rejects.toThrow("vacate the post before assigning a different person")
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("UPDATE recruitment.posts")
      )
    ).toBe(false)
  })

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
      employeeCode: "104",
      employeeEvent: "Appointed",
      employeeName: "Combined employee",
      organizationId: "00000000-0000-4000-8000-000000000010",
      postId: selectedPostId,
    })

    const updateCall = query.mock.calls.find(([statement]) =>
      statement.includes("UPDATE recruitment.posts")
    )
    expect(updateCall?.[1]?.[7]).toEqual([selectedPostId, relatedPostId])
  })

  test("corrects the employee ID for the same occupied employee", async () => {
    const postId = "00000000-0000-4000-8000-000000000001"
    const query = vi.fn(
      async (statement: string, parameters?: readonly unknown[]) => {
        if (statement.includes("SELECT id, employee_name, employee_code")) {
          return {
            rows: [
              {
                can_replace: false,
                combined_role_id: null,
                employee_code: "10A4",
                employee_name: "Current Employee",
                id: postId,
                last_working_date: null,
                status: "Occupied",
              },
            ],
          }
        }
        if (statement.includes("UPDATE recruitment.posts")) {
          return { rows: [{ id: postId }] }
        }
        return { rows: [], parameters }
      }
    )
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await repository.assignEmployee({
      employeeCode: "104",
      employeeEvent: "Joined",
      employeeName: "Current Employee",
      organizationId: "00000000-0000-4000-8000-000000000010",
      postId,
    })

    const update = (
      query.mock.calls as unknown as Array<[string, unknown[]]>
    ).find(([statement]) => statement.includes("UPDATE recruitment.posts"))
    expect(update?.[1]?.[1]).toBe("104")
  })

  test("corrects both name and numeric ID in explicit correction mode", async () => {
    const postId = "00000000-0000-4000-8000-000000000001"
    const query = vi.fn(
      async (statement: string, parameters?: readonly unknown[]) => {
        if (statement.includes("SELECT id, employee_name, employee_code")) {
          return {
            rows: [
              {
                can_replace: false,
                combined_role_id: null,
                employee_code: "104",
                employee_name: "Currnt Employee",
                id: postId,
                last_working_date: null,
                status: "Occupied",
              },
            ],
          }
        }
        if (statement.includes("UPDATE recruitment.posts")) {
          return { rows: [{ id: postId }] }
        }
        return { rows: [], parameters }
      }
    )
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await repository.assignEmployee({
      employeeCode: "105",
      employeeEvent: "Joined",
      employeeName: "Current Employee",
      identityCorrection: true,
      organizationId: "00000000-0000-4000-8000-000000000010",
      postId,
    })

    const update = (
      query.mock.calls as unknown as Array<[string, unknown[]]>
    ).find(([statement]) => statement.includes("UPDATE recruitment.posts"))
    expect(update?.[1]?.slice(0, 3)).toEqual([
      "Current Employee",
      "105",
      "Occupied",
    ])
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

  test("requires a CSV assignment target to be vacant", async () => {
    const postId = "00000000-0000-4000-8000-000000000001"
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("lower(post.post_code) AS target_code")) {
        return {
          rowCount: 1,
          rows: [
            {
              combined_role_id: null,
              employee_code: "EMP-1",
              employee_name: "Existing Employee",
              is_primary: false,
              post_code: "POST-01",
              post_id: postId,
              post_status: "Occupied",
              target_code: "post-01",
              target_type: "individual",
            },
          ],
        }
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
            employeeCode: "EMP-2",
            employeeEvent: "Joined",
            employeeName: "New Employee",
            rowNumber: 2,
            targetCode: "POST-01",
            targetType: "individual",
          },
        ],
        organizationId: "00000000-0000-4000-8000-000000000010",
        requireVacantTargets: true,
      })
    ).rejects.toThrow(
      "Individual Posts row 2: POST-01 is occupied. Vacate it manually before bulk assignment."
    )
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("UPDATE recruitment.posts")
      )
    ).toBe(false)
  })
})

describe("updateCombinedRole", () => {
  test("applies the selected template and occupied employee to every combined post", async () => {
    const organizationId = "00000000-0000-4000-8000-000000000010"
    const combinedRoleId = "00000000-0000-4000-8000-000000000020"
    const primaryPostId = "00000000-0000-4000-8000-000000000030"
    const memberPostId = "00000000-0000-4000-8000-000000000031"
    const templateId = "00000000-0000-4000-8000-000000000040"
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("SELECT * FROM recruitment.combined_roles")) {
        return {
          rows: [
            {
              id: combinedRoleId,
              name: "Combined maintenance",
              status: "Active",
              vacancy_code: "CMB-1",
            },
          ],
        }
      }
      if (
        statement.includes("SELECT id FROM recruitment.requirement_templates")
      ) {
        return { rows: [{ id: templateId }] }
      }
      if (statement.includes("SELECT id, post_code, status")) {
        return {
          rows: [
            {
              appointedApplicationId: "00000000-0000-4000-8000-000000000050",
              employeeCode: "104",
              employeeName: "Combined Employee",
              id: primaryPostId,
              joiningDate: "2026-08-20",
              lastWorkingDate: null,
              post_code: "POST-1",
              status: "Occupied",
            },
            {
              appointedApplicationId: null,
              employeeCode: null,
              employeeName: null,
              id: memberPostId,
              joiningDate: null,
              lastWorkingDate: null,
              post_code: "POST-2",
              status: "Vacant",
            },
          ],
        }
      }
      if (statement.includes("SELECT DISTINCT post.post_code")) {
        return { rows: [] }
      }
      if (
        statement.includes(
          "SELECT post_id FROM recruitment.combined_role_posts"
        )
      ) {
        return {
          rows: [{ post_id: primaryPostId }, { post_id: memberPostId }],
        }
      }
      if (statement.includes("UPDATE recruitment.combined_roles")) {
        return { rows: [{ id: combinedRoleId }] }
      }
      return { rows: [] }
    })
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: {
        connect: vi.fn(async () => client),
      } as unknown as Pool,
    })

    await repository.updateCombinedRole({
      combinedRoleId,
      name: "Combined maintenance",
      organizationId,
      postIds: [primaryPostId, memberPostId],
      primaryPostId,
      requirementTemplateCode: "JRT-0001",
    })

    const updatePosts = (
      query.mock.calls as unknown as Array<[string, unknown[]]>
    ).find(([statement]) => statement.includes("requirement_template_id = $3"))
    expect(updatePosts?.[0]).toContain("employee_code = CASE")
    expect(updatePosts?.[1]).toEqual([
      combinedRoleId,
      "CMB-1",
      templateId,
      true,
      "Combined Employee",
      "104",
      "Occupied",
      "2026-08-20",
      null,
      "00000000-0000-4000-8000-000000000050",
      null,
      organizationId,
      [primaryPostId, memberPostId],
    ])
  })
})

describe("createCombinedRole", () => {
  test("copies an existing occupant to every newly combined post", async () => {
    const organizationId = "00000000-0000-4000-8000-000000000010"
    const combinedRoleId = "00000000-0000-4000-8000-000000000020"
    const primaryPostId = "00000000-0000-4000-8000-000000000030"
    const memberPostId = "00000000-0000-4000-8000-000000000031"
    const applicationId = "00000000-0000-4000-8000-000000000050"
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("SELECT post.id, post.post_code")) {
        return {
          rows: [
            {
              appointedApplicationId: applicationId,
              belongs_to_active_combined_role: false,
              employeeCode: "104",
              employeeName: "Combined Employee",
              id: primaryPostId,
              joiningDate: "2026-08-20",
              lastWorkingDate: null,
              post_code: "POST-1",
              status: "Occupied",
            },
            {
              appointedApplicationId: null,
              belongs_to_active_combined_role: false,
              employeeCode: null,
              employeeName: null,
              id: memberPostId,
              joiningDate: null,
              lastWorkingDate: null,
              post_code: "POST-2",
              status: "Vacant",
            },
          ],
        }
      }
      if (
        statement.includes(
          "SELECT vacancy_code FROM recruitment.combined_roles"
        )
      ) {
        return { rows: [] }
      }
      if (statement.includes("INSERT INTO recruitment.combined_roles")) {
        return { rows: [{ id: combinedRoleId }] }
      }
      return { rows: [] }
    })
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await repository.createCombinedRole({
      organizationId,
      postIds: [primaryPostId, memberPostId],
      primaryPostId,
    })

    const updatePosts = (
      query.mock.calls as unknown as Array<[string, unknown[]]>
    ).find(([statement]) => statement.includes("SET combined_role_id = $1"))
    expect(updatePosts?.[0]).toContain("employee_code = CASE")
    expect(updatePosts?.[1]).toEqual([
      combinedRoleId,
      expect.any(String),
      true,
      "Combined Employee",
      "104",
      "Occupied",
      "2026-08-20",
      null,
      applicationId,
      null,
      organizationId,
      [primaryPostId, memberPostId],
    ])
  })
})

describe("masters", () => {
  test.each([
    ["department", "departments", "Human Resources", "HR"],
    ["designation", "designations", "Assistant", "AS"],
  ] as const)(
    "generates the %s code from its name",
    async (kind, table, name, expectedCode) => {
      const query = vi.fn(
        async (
          ...args: [statement: string, parameters?: readonly unknown[]]
        ) => {
          const [statement] = args
          if (statement.includes(`INSERT INTO recruitment.${table}`)) {
            return {
              rows: [
                {
                  code: expectedCode,
                  id: "00000000-0000-4000-8000-000000000020",
                },
              ],
            }
          }
          return { rows: [] }
        }
      )
      const client = { query, release: vi.fn() } as unknown as PoolClient
      const repository = createRecruitmentRepository({
        pool: { connect: vi.fn(async () => client) } as unknown as Pool,
      })

      await expect(
        repository.upsertMaster({
          kind,
          name,
          organizationId: "00000000-0000-4000-8000-000000000010",
        })
      ).resolves.toMatchObject({ code: expectedCode })

      const insert = query.mock.calls.find(([statement]) =>
        statement.includes(`INSERT INTO recruitment.${table}`)
      )
      expect(insert?.[1]?.[1]).toBe(expectedCode)
    }
  )

  test("adds the next suffix when a name-derived code is already used", async () => {
    const query = vi.fn(
      async (...args: [statement: string, parameters?: readonly unknown[]]) => {
        const [statement] = args
        if (statement.includes("SELECT code FROM recruitment.departments")) {
          return { rows: [{ code: "QA" }, { code: "QA-2" }] }
        }
        if (statement.includes("INSERT INTO recruitment.departments")) {
          return {
            rows: [
              {
                code: "QA-3",
                id: "00000000-0000-4000-8000-000000000020",
              },
            ],
          }
        }
        return { rows: [] }
      }
    )
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await expect(
      repository.upsertMaster({
        kind: "department",
        name: "Quality Analytics",
        organizationId: "00000000-0000-4000-8000-000000000010",
      })
    ).resolves.toMatchObject({ code: "QA-3" })

    const insert = query.mock.calls.find(([statement]) =>
      statement.includes("INSERT INTO recruitment.departments")
    )
    expect(insert?.[1]?.[1]).toBe("QA-3")
  })

  test("rejects a reused name", async () => {
    const query = vi.fn(async (statement: string) => {
      if (
        statement.includes("SELECT code, name FROM recruitment.departments")
      ) {
        return { rows: [{ code: "DEP001", name: "Human Resources" }] }
      }
      return { rows: [] }
    })
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await expect(
      repository.upsertMaster({
        kind: "department",
        name: "Human Resources",
        organizationId: "00000000-0000-4000-8000-000000000010",
      })
    ).rejects.toThrow('name "Human Resources" is already used')
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("INSERT INTO recruitment.departments")
      )
    ).toBe(false)
  })

  test("can rename a department while clearing its existing references", async () => {
    const departmentId = "00000000-0000-4000-8000-000000000020"
    const organizationId = "00000000-0000-4000-8000-000000000010"
    const actorUserId = "00000000-0000-4000-8000-000000000030"
    const query = vi.fn(
      async (...args: [statement: string, parameters?: readonly unknown[]]) => {
        const [statement] = args
        if (statement.includes("recruitment.rename_department_master")) {
          return {
            rows: [
              {
                cleared_candidate_count: 3,
                cleared_post_count: 2,
                cleared_template_count: 1,
                id: departmentId,
                updated_job_count: 4,
              },
            ],
          }
        }
        return { rows: [] }
      }
    )
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await expect(
      repository.renameDepartmentMaster({
        actorUserId,
        departmentId,
        name: "People And Culture",
        organizationId,
        referenceMode: "clear",
      })
    ).resolves.toEqual({
      clearedCandidateCount: 3,
      clearedPostCount: 2,
      clearedTemplateCount: 1,
      id: departmentId,
      updatedJobCount: 4,
    })
    expect(
      query.mock.calls.find(([statement]) =>
        statement.includes("recruitment.rename_department_master")
      )?.[1]
    ).toEqual([
      organizationId,
      departmentId,
      "People And Culture",
      true,
      actorUserId,
    ])
  })
})

describe("combined job templates", () => {
  test("prefers the template explicitly selected on the combined posts", async () => {
    const postId = "00000000-0000-4000-8000-000000000001"
    const combinedRoleId = "00000000-0000-4000-8000-000000000002"
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("SELECT selected.combined_role_id")) {
        return {
          rows: [{ combined_role_id: combinedRoleId, post_id: postId }],
        }
      }
      if (statement.includes("FROM recruitment.job_posts job")) {
        return { rowCount: 0, rows: [] }
      }
      if (statement.includes("INSERT INTO recruitment.job_posts")) {
        expect(statement).toContain(
          "candidate.id = post.requirement_template_id"
        )
        expect(statement).toContain("candidate.combined_role_id = combined.id")
        expect(
          statement.indexOf("candidate.id = post.requirement_template_id")
        ).toBeLessThan(
          statement.indexOf("candidate.combined_role_id = combined.id) DESC")
        )
        return { rows: [{ id: "job-1" }] }
      }
      return { rows: [] }
    })
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await repository.createJobFromPost({
      organizationId: "00000000-0000-4000-8000-000000000010",
      postId,
    })

    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("INSERT INTO recruitment.job_posts")
      )
    ).toBe(true)
  })
})

describe("candidate conversation logs", () => {
  const organizationId = "00000000-0000-4000-8000-000000000010"
  const eventId = "00000000-0000-4000-8000-000000000011"

  test("includes the candidate department in conversation rows", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("FROM recruitment.candidate_events event")) {
        return {
          rows: [
            {
              candidate_id: "00000000-0000-4000-8000-000000000012",
              candidate_name: "Candidate",
              candidate_phone: "9999999999",
              department: "Quality",
              event_type: "Phone Call",
              id: eventId,
              job_number: null,
              notes: "Follow up tomorrow",
              occurred_at: "2026-08-10T10:00:00.000Z",
              title: "Follow-up",
            },
          ],
        }
      }
      return { rows: [] }
    })
    const repository = createRecruitmentRepository({
      pool: { query } as unknown as Pool,
    })

    const events = await repository.listCandidateEvents(organizationId)

    expect(events[0]?.department).toBe("Quality")
    expect(query.mock.calls[0]?.[0]).toContain(
      "department.id = candidate.preferred_department_id"
    )
  })

  test("edits a log inside its organization and writes an audit record", async () => {
    const query = vi.fn(
      async (statement: string, _parameters?: readonly unknown[]) => {
        void _parameters
        if (statement.includes("SELECT * FROM recruitment.candidate_events")) {
          return {
            rows: [
              {
                event_type: "Phone Call",
                id: eventId,
                notes: "Original",
                title: "Initial Contact",
              },
            ],
          }
        }
        if (statement.includes("UPDATE recruitment.candidate_events")) {
          return {
            rows: [
              {
                event_type: "WhatsApp",
                id: eventId,
                notes: "Updated",
                title: "Follow-up",
              },
            ],
          }
        }
        return { rows: [] }
      }
    )
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await repository.updateCandidateEvent({
      eventId,
      eventType: "WhatsApp",
      notes: "Updated",
      organizationId,
      title: "Follow-up",
    })

    const updateCall = query.mock.calls.find(([statement]) =>
      statement.includes("UPDATE recruitment.candidate_events")
    )
    expect(updateCall?.[1]).toEqual([
      "WhatsApp",
      "Follow-up",
      "Updated",
      eventId,
      organizationId,
    ])
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("INSERT INTO audit.events")
      )
    ).toBe(true)
  })

  test("deletes a log inside its organization and retains audit evidence", async () => {
    const query = vi.fn(
      async (statement: string, _parameters?: readonly unknown[]) => {
        void _parameters
        if (statement.includes("recruitment.delete_candidate_event")) {
          return {
            rows: [
              {
                deleted_event: {
                  event_type: "Phone Call",
                  id: eventId,
                  notes: "Remove me",
                  title: "Follow-up",
                },
              },
            ],
          }
        }
        return { rows: [] }
      }
    )
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await repository.deleteCandidateEvent({ eventId, organizationId })

    const deleteActionCall = query.mock.calls.find(([statement]) =>
      statement.includes("recruitment.delete_candidate_event")
    )
    expect(deleteActionCall?.[1]).toEqual([organizationId, eventId])
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("DELETE FROM recruitment.candidate_events")
      )
    ).toBe(false)
    const auditCall = query.mock.calls.find(([statement]) =>
      statement.includes("INSERT INTO audit.events")
    )
    expect(auditCall?.[1]?.[0]).toContain("recruitment.candidate_event.deleted")
    expect(auditCall?.[1]?.[0]).toContain("Remove me")
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
        return {
          rows: [
            {
              round_name: "Screening Round",
              scheduled_at: "2026-08-08 10:00:00+00",
              status: "Scheduled",
            },
          ],
        }
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
      roundName: "Screening Round",
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

  test("rejects scheduling a round other than the next required round", async () => {
    const query = vi.fn(async (statement: string) => {
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
        return { rows: [{ id: "application-1" }] }
      }
      return { rows: [] }
    })
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: {
        connect: vi.fn(async () => client),
      } as unknown as Pool,
    })
    const input = {
      applicationId: "application-1",
      interviewAt: "2026-08-10T10:00",
      organizationId: "organization-1",
      roundName: "Technical Round",
    }

    await expect(repository.scheduleInterview(input)).rejects.toThrow(
      "The next required round is Screening Round."
    )
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("UPDATE recruitment.applications")
      )
    ).toBe(false)
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

  test("rejects scoring before the required round is scheduled", async () => {
    const query = vi.fn(async (statement: string) => {
      if (
        statement.includes("SELECT id") &&
        statement.includes("FROM recruitment.applications")
      ) {
        return { rows: [{ id: "application-1", status: "Assigned" }] }
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
      repository.recordInterview({
        applicationId: "application-1",
        organizationId: "organization-1",
        questionScores: {},
        roundName: "Screening Round",
        status: "Approved",
      })
    ).rejects.toThrow("must be scheduled before scoring is allowed")
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
        return {
          rows: [
            {
              round_name: "Screening Round",
              scheduled_at: "2026-08-08 10:00:00+00",
              status: "Scheduled",
            },
          ],
        }
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

  test("updates a completed interview round without changing its decision", async () => {
    const query = vi.fn(async (statement: string, _parameters?: unknown[]) => {
      void _parameters
      if (
        statement.includes("SELECT *") &&
        statement.includes("FROM recruitment.interviews")
      ) {
        return {
          rows: [
            {
              id: "interview-1",
              round_name: "Screening Round",
              status: "Approved",
            },
          ],
        }
      }
      if (statement.includes("UPDATE recruitment.interviews")) {
        return {
          rows: [
            {
              id: "interview-1",
              round_name: "Screening Round",
              status: "Approved",
            },
          ],
        }
      }
      return { rows: [] }
    })
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await repository.updateInterviewRound({
      comments: "Updated comments",
      interviewAt: "2026-08-08T10:30:00.000Z",
      interviewId: "interview-1",
      interviewerName: "HR Manager",
      organizationId: "organization-1",
      questionScores: {
        availability_suitability: 4,
        communication_clarity: 4,
        relevant_experience: 5,
        role_understanding: 4,
        screening_recommendation: 5,
      },
    })

    const updateCall = query.mock.calls.find(([statement]) =>
      statement.includes("UPDATE recruitment.interviews")
    )
    expect(updateCall?.[1]).toEqual(
      expect.arrayContaining([
        "interview-1",
        "organization-1",
        "Updated comments",
      ])
    )
    expect(updateCall?.[1]).toContain("Approved")
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("UPDATE recruitment.applications")
      )
    ).toBe(false)
  })

  test("changes the latest approved round to rejected and closes the application", async () => {
    const query = vi.fn(async (statement: string, _parameters?: unknown[]) => {
      void _parameters
      if (
        statement.includes("SELECT *") &&
        statement.includes("FROM recruitment.interviews")
      ) {
        return {
          rows: [
            {
              application_id: "application-1",
              id: "interview-2",
              round_name: "Technical Round",
              status: "Approved",
            },
          ],
        }
      }
      if (statement.includes("FROM recruitment.applications")) {
        return {
          rows: [{ status: "Interview", willing_to_join: null }],
        }
      }
      if (statement.includes("SELECT id, round_name")) return { rows: [] }
      if (statement.includes("UPDATE recruitment.interviews")) {
        return {
          rows: [
            {
              application_id: "application-1",
              id: "interview-2",
              round_name: "Technical Round",
              status: "Rejected",
            },
          ],
        }
      }
      if (statement.includes("UPDATE recruitment.applications")) {
        return { rows: [{ id: "application-1", status: "Rejected" }] }
      }
      return { rows: [] }
    })
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await repository.updateInterviewRound({
      comments: "Does not meet requirements",
      interviewAt: "2026-08-08T10:30:00.000Z",
      interviewId: "interview-2",
      interviewerName: "HR Manager",
      organizationId: "organization-1",
      questionScores: {
        independent_working: 2,
        practical_problem_solving: 2,
        process_equipment_knowledge: 2,
        quality_safety_awareness: 2,
        technical_knowledge: 2,
      },
      status: "Rejected",
    })

    const interviewUpdate = query.mock.calls.find(([statement]) =>
      statement.includes("UPDATE recruitment.interviews")
    )
    expect(interviewUpdate?.[1]).toContain("Rejected")
    const applicationUpdate = query.mock.calls.find(([statement]) =>
      statement.includes("UPDATE recruitment.applications")
    )
    expect(applicationUpdate?.[1]).toEqual([
      "Rejected",
      null,
      "application-1",
      "organization-1",
    ])
  })

  test("saves final HR approval before appointment details", async () => {
    const query = vi.fn(
      async (statement: string, parameters?: readonly unknown[]) => {
        void parameters
        if (
          statement.includes("SELECT id, status") &&
          statement.includes("FROM recruitment.applications")
        ) {
          return { rows: [{ id: "application-1", status: "Interview" }] }
        }
        if (statement.includes("SELECT round_name, status")) {
          return {
            rows: [
              { round_name: "Screening Round", status: "Approved" },
              { round_name: "Technical Round", status: "Approved" },
              {
                round_name: "HR Round",
                scheduled_at: "2026-08-11 10:00:00+00",
                status: "Scheduled",
              },
            ],
          }
        }
        if (statement.includes("INSERT INTO recruitment.interviews")) {
          return { rows: [{ id: "interview-1" }] }
        }
        return { rows: [] }
      }
    )
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await repository.recordInterview({
      applicationId: "application-1",
      organizationId: "organization-1",
      questionScores: {
        final_hiring_recommendation: 5,
        motivation_retention: 4,
        policy_shift_acceptance: 4,
        reliability_discipline: 5,
        team_fit: 5,
      },
      roundName: "HR Round",
      status: "Approved",
    })

    const applicationUpdate = query.mock.calls.find(([statement]) =>
      statement.includes("UPDATE recruitment.applications")
    )
    expect(applicationUpdate?.[1]).toEqual([
      "Approved",
      null,
      "application-1",
      "organization-1",
    ])
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("application.willing_to_join")
      )
    ).toBe(false)
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("UPDATE recruitment.posts")
      )
    ).toBe(false)
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("UPDATE recruitment.job_posts")
      )
    ).toBe(false)
  })
})

describe("job lifecycle", () => {
  test("closes an open recruitment job while retaining its history", async () => {
    const jobId = "00000000-0000-4000-8000-000000000101"
    const organizationId = "00000000-0000-4000-8000-000000000102"
    const query = vi.fn(
      async (statement: string, values?: readonly unknown[]) => {
        void values
        if (statement.includes("SELECT * FROM recruitment.job_posts")) {
          return { rows: [{ id: jobId, status: "Open" }] }
        }
        if (statement.includes("UPDATE recruitment.job_posts")) {
          return { rows: [{ id: jobId, status: "Closed" }] }
        }
        return { rows: [] }
      }
    )
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await repository.closeJob({ jobId, organizationId })

    expect(
      query.mock.calls.some(
        ([statement, values]) =>
          statement.includes("SET status = 'Closed'") &&
          values?.includes(jobId) &&
          values?.includes(organizationId)
      )
    ).toBe(true)
  })

  test("deletes an empty recruitment job through the guarded database command", async () => {
    const jobId = "00000000-0000-4000-8000-000000000111"
    const organizationId = "00000000-0000-4000-8000-000000000112"
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("recruitment.delete_job_post")) {
        return {
          rows: [
            {
              deleted_job: {
                id: jobId,
                job_number: "HO-1",
                status: "Open",
              },
            },
          ],
        }
      }
      return { rows: [] }
    })
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await repository.deleteJob({ jobId, organizationId })

    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("SELECT recruitment.delete_job_post")
      )
    ).toBe(true)
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("DELETE FROM recruitment.job_posts")
      )
    ).toBe(false)
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
        roundName: "Screening Round",
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

describe("candidate appointment completion", () => {
  test("completes appointment terms for an already approved candidate", async () => {
    const applicationId = "00000000-0000-4000-8000-000000000101"
    const candidateId = "00000000-0000-4000-8000-000000000102"
    const jobId = "00000000-0000-4000-8000-000000000103"
    const organizationId = "00000000-0000-4000-8000-000000000104"
    const postId = "00000000-0000-4000-8000-000000000105"
    const query = vi.fn(
      async (statement: string, values?: readonly unknown[]) => {
        void values
        if (statement.includes("application.willing_to_join")) {
          return {
            rows: [
              {
                candidate_id: candidateId,
                candidate_name: "Rakesh Harebha",
                id: applicationId,
                job_id: jobId,
                post_id: postId,
                status: "Approved",
                willing_to_join: null,
              },
            ],
          }
        }
        if (statement.includes("SELECT round_name, status")) {
          return {
            rows: [
              { round_name: "Screening Round", status: "Approved" },
              { round_name: "Department Round", status: "Approved" },
              { round_name: "HR Round", status: "Approved" },
            ],
          }
        }
        if (statement.includes("SELECT id, employee_name, employee_code")) {
          return {
            rows: [
              {
                can_replace: true,
                combined_role_id: null,
                employee_code: null,
                employee_name: null,
                id: postId,
                last_working_date: null,
                status: "Vacant",
              },
            ],
          }
        }
        if (statement.includes("UPDATE recruitment.posts")) {
          return { rows: [{ id: postId }] }
        }
        return { rows: [] }
      }
    )
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await repository.completeCandidateAppointment({
      actorUserId: "00000000-0000-4000-8000-000000000106",
      applicationId,
      joiningDate: "2026-08-08",
      organizationId,
      salaryAfterProbationMaximum: 20000,
      salaryAfterProbationMinimum: 15000,
      salaryBeforeProbation: 15000,
      willingToJoin: "yes",
    })

    const applicationUpdate = query.mock.calls.find(([statement]) =>
      statement.includes("UPDATE recruitment.applications")
    )
    expect(applicationUpdate?.[1]).toEqual([
      "Approved",
      "2026-08-08",
      true,
      15000,
      15000,
      20000,
      "00000000-0000-4000-8000-000000000106",
      applicationId,
      organizationId,
    ])
    expect(
      query.mock.calls.some(
        ([statement, values]) =>
          statement.includes("UPDATE recruitment.posts") &&
          values?.includes("Rakesh Harebha") &&
          values?.includes("Appointed") &&
          values?.includes("2026-08-08")
      )
    ).toBe(true)
  })

  test("records a mid-process withdrawal reason in candidate history", async () => {
    const applicationId = "00000000-0000-4000-8000-000000000111"
    const candidateId = "00000000-0000-4000-8000-000000000112"
    const jobId = "00000000-0000-4000-8000-000000000113"
    const organizationId = "00000000-0000-4000-8000-000000000114"
    const reason = "Accepted another job offer"
    const query = vi.fn(
      async (statement: string, values?: readonly unknown[]) => {
        void values
        if (
          statement.includes("SELECT application.id, application.status") &&
          statement.includes("candidate.name")
        ) {
          return {
            rows: [
              {
                candidate_id: candidateId,
                candidate_name: "Candidate One",
                id: applicationId,
                job_id: jobId,
                job_title: "Assistant",
                status: "Interview",
              },
            ],
          }
        }
        if (statement.includes("UPDATE recruitment.applications")) {
          return { rows: [{ id: applicationId, status: "Withdrawn" }] }
        }
        if (statement.includes("INSERT INTO recruitment.candidate_events")) {
          return { rows: [{ id: "00000000-0000-4000-8000-000000000115" }] }
        }
        return { rows: [] }
      }
    )
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createRecruitmentRepository({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    })

    await repository.withdrawCandidateApplication({
      actorUserId: "00000000-0000-4000-8000-000000000116",
      applicationId,
      organizationId,
      reason,
    })

    expect(
      query.mock.calls.some(
        ([statement, values]) =>
          statement.includes("UPDATE recruitment.applications") &&
          statement.includes("status = 'Withdrawn'") &&
          values?.includes(applicationId)
      )
    ).toBe(true)
    expect(
      query.mock.calls.some(
        ([statement, values]) =>
          statement.includes("INSERT INTO recruitment.candidate_events") &&
          statement.includes("'Candidate Withdrawal'") &&
          values?.includes(reason) &&
          values?.includes(applicationId)
      )
    ).toBe(true)
  })
})

describe("deriveRecruitmentPostStatus", () => {
  test("marks a post occupied when an employee code is assigned", () => {
    expect(
      deriveRecruitmentPostStatus({
        employeeCode: "104",
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
        employeeCode: "104",
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
          employeeCode: "104",
          employeeName: "Assigned employee",
          storedStatus,
        })
      ).toBe(storedStatus)
    }
  )
})

describe("upsertCandidate", () => {
  test("edits an existing candidate by id and replaces the preferred department", async () => {
    const candidateId = "00000000-0000-4000-8000-000000000001"
    const departmentId = "00000000-0000-4000-8000-000000000002"
    const designationId = "00000000-0000-4000-8000-000000000003"
    const query = vi.fn(
      async (statement: string, _parameters?: readonly unknown[]) => {
        void _parameters
        if (statement.includes("SELECT id FROM recruitment.departments")) {
          return { rowCount: 1, rows: [{ id: departmentId }] }
        }
        if (statement.includes("SELECT id FROM recruitment.designations")) {
          return { rowCount: 1, rows: [{ id: designationId }] }
        }
        if (statement.includes("UPDATE recruitment.candidates")) {
          return { rowCount: 1, rows: [{ id: candidateId }] }
        }
        return { rowCount: 0, rows: [] }
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

    await repository.upsertCandidate({
      candidateId,
      departmentCode: "QA",
      designationCode: "INSPECTOR",
      currentCompany: "ACME INDUSTRIES",
      name: "RAKESH HAREBHA",
      organizationId: "00000000-0000-4000-8000-000000000010",
      phone: "9999999999",
    })

    const updateCall = query.mock.calls.find(([statement]) =>
      statement.includes("UPDATE recruitment.candidates")
    )
    expect(updateCall?.[1]?.[1]).toBe("Rakesh Harebha")
    expect(updateCall?.[1]?.[4]).toBe("Acme Industries")
    expect(updateCall?.[1]?.[8]).toBe(designationId)
    expect(updateCall?.[1]?.[10]).toBe(candidateId)
    const replaceDepartmentCall = query.mock.calls.find(([statement]) =>
      statement.includes("recruitment.replace_candidate_department")
    )
    expect(replaceDepartmentCall?.[1]).toEqual([
      "00000000-0000-4000-8000-000000000010",
      candidateId,
      departmentId,
    ])
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("DELETE FROM recruitment.candidate_departments")
      )
    ).toBe(false)
  })
})

describe("deriveRecruitmentEmployeeAssignment", () => {
  test("records an appointment before the person joins", () => {
    expect(
      deriveRecruitmentEmployeeAssignment({
        employeeCode: "104",
        employeeEvent: "Appointed",
        employeeName: "New employee",
      })
    ).toEqual({
      employeeCode: "104",
      employeeName: "New employee",
      lastWorkingDate: null,
      status: "Appointed",
    })
  })

  test("changes an existing appointment to occupied when the person joins", () => {
    expect(
      deriveRecruitmentEmployeeAssignment({
        currentEmployeeCode: "104",
        currentEmployeeName: "New employee",
        employeeEvent: "Joined",
      })
    ).toEqual({
      employeeCode: "104",
      employeeName: "New employee",
      lastWorkingDate: null,
      status: "Occupied",
    })
  })

  test("retains the employee identity when they resign", () => {
    expect(
      deriveRecruitmentEmployeeAssignment({
        currentEmployeeCode: "104",
        currentEmployeeName: "New employee",
        employeeEvent: "Resigned",
        lastWorkingDate: "2026-08-31",
      })
    ).toEqual({
      employeeCode: "104",
      employeeName: "New employee",
      lastWorkingDate: "2026-08-31",
      status: "Resigned",
    })
  })

  test("clears the assignment and returns the post to vacant", () => {
    expect(
      deriveRecruitmentEmployeeAssignment({
        currentEmployeeCode: "104",
        currentEmployeeName: "New employee",
        employeeEvent: "Removed",
      })
    ).toEqual({
      employeeCode: null,
      employeeName: null,
      lastWorkingDate: null,
      status: "Vacant",
    })
  })

  test("requires a last working date for a resignation", () => {
    expect(() =>
      deriveRecruitmentEmployeeAssignment({
        currentEmployeeCode: "104",
        employeeEvent: "Resigned",
      })
    ).toThrow("Last working date is required")
  })
})

describe("listInterviewRecords", () => {
  test("returns global round results with job and candidate context", async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          application_id: "application-1",
          candidate_name: "Candidate One",
          comments: "Strong practical knowledge",
          created_at: "2026-08-09T04:00:00.000Z",
          id: "interview-1",
          interviewer_name: "Manager One",
          job_id: "job-1",
          job_number: "JOB-001",
          job_title: "Maintenance Engineer",
          joining_date: null,
          question_scores: { technical_knowledge: 4 },
          round_name: "Technical Round",
          scheduled_at: "2026-08-09T05:30:00.000Z",
          score: "4",
          status: "Approved",
          updated_at: "2026-08-09T06:00:00.000Z",
        },
      ],
    }))
    const repository = createRecruitmentRepository({
      pool: { query } as unknown as Pool,
    })

    const rows = await repository.listInterviewRecords("organization-1")

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("JOIN recruitment.job_posts job"),
      ["organization-1"]
    )
    expect(rows).toEqual([
      expect.objectContaining({
        candidateName: "Candidate One",
        jobNumber: "JOB-001",
        jobTitle: "Maintenance Engineer",
        questionScores: { technical_knowledge: 4 },
        roundName: "Technical Round",
        score: 4,
      }),
    ])
  })
})

describe("listInterviews", () => {
  test("includes the job and approved-post context needed for scheduling", async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          application_id: "application-1",
          approved_rounds: [],
          candidate_id: "candidate-1",
          candidate_name: "Candidate One",
          interview_at: null,
          job_id: "job-1",
          job_number: "JOB-001",
          job_title: "Maintenance Engineer",
          joining_date: null,
          latest_round: null,
          latest_status: null,
          planned_round: null,
          post_code: "ME-AS-1",
          scheduled_rounds: [],
          status: "Assigned",
        },
      ],
    }))
    const repository = createRecruitmentRepository({
      pool: { query } as unknown as Pool,
    })

    const rows = await repository.listInterviews("organization-1")

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "LEFT JOIN recruitment.posts post ON post.id = job.post_id"
      ),
      ["organization-1"]
    )
    expect(rows[0]).toEqual(
      expect.objectContaining({
        applicationId: "application-1",
        candidateId: "candidate-1",
        jobId: "job-1",
        jobNumber: "JOB-001",
        nextRound: "Screening Round",
        postCode: "ME-AS-1",
      })
    )
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
        employeeCode: "104",
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
