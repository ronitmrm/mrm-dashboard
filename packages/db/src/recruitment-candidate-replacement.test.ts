import type { Pool, PoolClient } from "pg"
import { expect, test, vi } from "vitest"
import { createRecruitmentRepository } from "./recruitment"

function fixture() {
  const post = {
    id: "00000000-0000-4000-8000-000000000001",
    combined_role_id: null,
    employee_name: "Outgoing Employee",
    employee_code: "104",
    status: "Resigned",
    last_working_date: "2099-09-26",
    can_replace: false,
    appointed_application_id: null as string | null,
  }
  const application = {
    id: "00000000-0000-4000-8000-000000000002",
    candidate_id: "00000000-0000-4000-8000-000000000003",
    candidate_name: "Incoming Candidate",
    job_id: "00000000-0000-4000-8000-000000000004",
    post_id: post.id,
    status: "Approved",
    willing_to_join: null as boolean | null,
    joining_date: "2026-09-10",
    today: "2026-09-10",
    job_status: "Open",
  }
  const replacements: Array<{
    id: string
    post_id: string
    employee_name: string
    employee_code: string | null
    application_id: string | null
    status: string
  }> = []
  const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
    if (sql.includes("SELECT application.id"))
      return { rows: [{ ...application }] }
    if (sql.includes("SELECT round_name, status"))
      return {
        rows: [
          { round_name: "Screening Round", status: "Approved" },
          { round_name: "Department Round", status: "Approved" },
          { round_name: "HR Round", status: "Approved" },
        ],
      }
    if (
      sql.includes("SELECT id, employee_name, employee_code") ||
      sql.includes("SELECT post.id, post.status")
    )
      return { rows: [{ ...post }] }
    if (sql.includes("INSERT INTO recruitment.post_replacements"))
      replacements.push({
        id: "reservation-1",
        post_id: post.id,
        employee_name: String(values[2]),
        employee_code: values[3] as string | null,
        application_id: values[5] as string | null,
        status: "Pending",
      })
    if (
      sql.includes("SELECT id, post_id, employee_name") ||
      sql.includes("SELECT post_id, application_id")
    )
      return { rows: replacements.filter((row) => row.status === "Pending") }
    if (sql.includes("UPDATE recruitment.post_replacements")) {
      for (const row of replacements)
        row.status = sql.includes("'Joined'") ? "Joined" : "Cancelled"
    }
    if (sql.includes("UPDATE recruitment.posts")) {
      post.employee_name = String(values[0])
      post.employee_code = String(values[1])
      post.status = String(values[2])
      post.appointed_application_id = values[6] as string | null
    }
    if (sql.includes("UPDATE recruitment.applications")) {
      application.status = sql.includes("'Did Not Join'")
        ? "Did Not Join"
        : String(values[0])
      application.willing_to_join = true
    }
    if (sql.includes("FROM recruitment.posts post"))
      return {
        rows: [
          {
            ...post,
            replacement_appointments: replacements.map((row) => ({
              employeeName: row.employee_name,
              status: row.status,
              applicationId: row.application_id,
            })),
          },
        ],
      }
    return { rows: [{ id: post.id }], rowCount: 1 }
  })
  const client = { query, release: vi.fn() } as unknown as PoolClient
  const repository = createRecruitmentRepository({
    pool: { query, connect: async () => client } as unknown as Pool,
  })
  const organizationId = "00000000-0000-4000-8000-000000000010"
  const appoint = () =>
    repository.completeCandidateAppointment({
      organizationId,
      applicationId: application.id,
      willingToJoin: "yes",
      joiningDate: "2026-09-10",
      salaryBeforeProbation: 15000,
      salaryAfterProbationMinimum: 15000,
      salaryAfterProbationMaximum: 20000,
    })
  return { repository, organizationId, application, post, appoint }
}

test("candidate appointment during notice preserves the outgoing employee and reserves the application", async () => {
  const f = fixture()
  await f.appoint()
  expect((await f.repository.listPosts(f.organizationId))[0]).toMatchObject({
    employeeName: "Outgoing Employee",
    employeeCode: "104",
    status: "Resigned",
    lastWorkingDate: "2099-09-26",
    replacementAppointments: [
      {
        employeeName: "Incoming Candidate",
        status: "Pending",
        applicationId: f.application.id,
      },
    ],
  })
})

test("candidate non-joining cancels their reservation without clearing the outgoing employee", async () => {
  const f = fixture()
  await f.appoint()
  await expect(
    f.repository.recordCandidateDidNotJoin({
      organizationId: f.organizationId,
      applicationId: f.application.id,
      didNotJoinOn: "2026-09-10",
      reason: "Candidate declined joining",
    })
  ).resolves.toMatchObject({
    jobId: f.application.job_id,
    releasedPostCount: 1,
  })
  expect((await f.repository.listPosts(f.organizationId))[0]).toMatchObject({
    employeeName: "Outgoing Employee",
    employeeCode: "104",
    status: "Resigned",
    replacementAppointments: [
      { status: "Cancelled", applicationId: f.application.id },
    ],
  })
})
