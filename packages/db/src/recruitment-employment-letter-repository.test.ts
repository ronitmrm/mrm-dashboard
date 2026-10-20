import type { Pool, PoolClient } from "pg"
import { describe, expect, it, vi } from "vitest"

import {
  createRecruitmentEmploymentLetterRepository,
  insertOfferRevision,
} from "./recruitment-employment-letter-repository"

const appointmentDetails = {
  confirmationEffectiveDate: "2026-10-18",
  postalAddress: "42 Test Road, Jamnagar",
  probationLength: 1,
  probationUnit: "months" as const,
  dutyStartTime: "09:00",
  dutyEndTime: "20:00",
  minimumWeeklyHours: 60,
  probationCompletedOn: "2026-10-17",
  grossMonthlySalary: 30000,
  reportsTo: "Ankit Khattar",
  signatoryName: "Ankit Khattar",
  signatoryDesignation: "Engineering Head",
  workLocation: "Mrmpl-Forging",
}

function combinedOfferFixture(superseded = false) {
  const members = [
    { designation: "HOD", department: "Ppac Conventional-02 Planner" },
    { designation: "HOD", department: "Ppac Forging Planner" },
  ]
  const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
    if (sql.includes("WHERE supersedes_letter_id"))
      return { rows: superseded && parameters?.[0] === "letter-1" ? [{ id: "newer-letter" }] : [] }
    if (sql.includes("JOIN recruitment.combined_role_posts"))
      return { rows: members }
    if (sql.includes("application.status AS application_status"))
      return {
        rows: [
          {
            application_status: "Approved",
            candidate_name: "Combined Candidate",
            ...members[0],
            joining_date: "2026-10-20",
            post_id: "post-1",
            salary_before_probation: "15000",
            salary_after_probation_minimum: "18000",
            salary_after_probation_maximum: "22000",
            willing_to_join: true,
          },
        ],
      }
    if (sql.includes("SELECT id, post_id"))
      return {
        rows: [
          {
            id: "letter-1",
            post_id: "post-1",
            employee_name: "Combined Candidate",
            employee_code: "558",
            joining_date: "2026-09-17",
            last_working_date: null,
            details: {},
            file_available: true,
            ...members[0],
            reference_number: sql.includes("letter_type = 'appointment'")
              ? "MRMPL-HR-202627-AL-1"
              : "MRMPL-HR-202627-OL-1",
          },
        ],
      }
    if (sql.includes("SELECT post.employee_name"))
      return {
        rows: [
          {
            employee_name: "Combined Candidate",
            employee_code: "558",
            status: "Occupied",
            joining_date: "2026-09-17",
            last_working_date: null,
            ...members[0],
          },
        ],
      }
    if (sql.includes("nextval")) return { rows: [{ value: "2" }] }
    if (sql.includes("INSERT INTO recruitment.employment_letters"))
      return { rows: [{ id: "letter-2" }] }
    return { rows: [] }
  })
  const client = { query, release: vi.fn() } as unknown as PoolClient
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool
  return {
    client,
    pool,
    query,
    identity: {
      designation:
        "HOD (Ppac Conventional-02 Planner) & HOD (Ppac Forging Planner)",
      department: "Ppac Conventional-02 Planner & Ppac Forging Planner",
    },
    details: {
      dutyStartTime: "09:00",
      dutyEndTime: "18:00",
      payPeriod: "month" as const,
      postalAddress: "Jamnagar",
      probationLength: 3,
      probationUnit: "months" as const,
      signatoryName: "Ankit Khattar",
      signatoryDesignation: "Director",
      salaryAfterProbationMinimum: 18000,
      salaryAfterProbationMaximum: 22000,
    },
  }
}

describe("recruitment employment letter repository", () => {
  it("includes both combined posts in a joined employee's appointment letter", async () => {
    const { pool, identity } = combinedOfferFixture()
    const repository = createRecruitmentEmploymentLetterRepository({ pool })
    const record = await repository.issue({
      organizationId: "organization-1",
      postId: "post-1",
      type: "appointment",
      issuedOn: "2026-10-20",
      details: appointmentDetails,
    })
    expect(record.letter.identity).toMatchObject({
      ...identity,
      employeeCode: "558",
    })
  })

  it("regenerates an appointment as a linked revision while retaining the issued PDF", async () => {
    const { pool, query, identity } = combinedOfferFixture()
    const repository = createRecruitmentEmploymentLetterRepository({ pool })
    const renderPdf = vi.fn(async () => Buffer.from("%PDF-new-appointment"))
    await expect(repository.reviseAppointment({
      organizationId: "organization-1",
      previousLetterId: "letter-1",
      issuedOn: "2026-10-20",
      details: appointmentDetails,
      reason: "Use the new format and both posts",
      renderPdf,
    })).resolves.toMatchObject({ id: "letter-2", reference: "MRMPL-HR-202627-AL-2" })
    expect(renderPdf).toHaveBeenCalledWith(expect.objectContaining({
      identity: expect.objectContaining({ ...identity, combinedPosts: true, employeeCode: "558" }),
    }))
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("post.status = 'Occupied'"),
      ["post-1", "organization-1", "558", "2026-09-17"]
    )
    const inserted = query.mock.calls.find(([sql]) => sql.includes("INSERT INTO recruitment.employment_letters"))
    expect(inserted?.[1]).toContain("letter-1")
    expect(inserted?.[1]).toContainEqual(Buffer.from("%PDF-new-appointment"))
    expect(inserted?.[1]?.[10]).toContain('"combinedPosts":true')
    expect(query.mock.calls.some(([sql]) => sql.includes("UPDATE recruitment.employment_letters"))).toBe(false)
    expect(query.mock.calls.some(([sql]) => sql.includes("appointment.revised"))).toBe(true)
    expect(query).toHaveBeenCalledWith("COMMIT")
  })

  it("rejects editing an appointment revision that another edit has superseded", async () => {
    const { pool, query } = combinedOfferFixture(true)
    const repository = createRecruitmentEmploymentLetterRepository({ pool })
    const renderPdf = vi.fn(async () => Buffer.from("%PDF-new-appointment"))
    await expect(repository.reviseAppointment({
      organizationId: "organization-1",
      previousLetterId: "letter-1",
      issuedOn: "2026-10-20",
      details: appointmentDetails,
      reason: "Use the new format",
      renderPdf,
    })).rejects.toThrow("has changed")
    expect(renderPdf).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledWith("ROLLBACK")
    expect(query.mock.calls.some(([sql]) => sql.includes("INSERT INTO recruitment.employment_letters"))).toBe(false)
  })

  it("includes both combined posts when issuing an offer with the same designation", async () => {
    const { pool, identity, details } = combinedOfferFixture()
    const repository = createRecruitmentEmploymentLetterRepository({ pool })
    const record = await repository.issue({
      organizationId: "organization-1",
      applicationId: "application-1",
      type: "offer",
      issuedOn: "2026-10-20",
      details,
    })
    expect(record.letter.identity).toMatchObject(identity)
  })

  it("corrects the missing combined post when revising an older offer", async () => {
    const { client, identity, details } = combinedOfferFixture()
    const renderPdf = vi.fn(async () => Buffer.from("%PDF-revised"))
    await insertOfferRevision(client, {
      organizationId: "organization-1",
      applicationId: "application-1",
      previousLetterId: "letter-1",
      joiningDate: "2026-10-20",
      salary: 15000,
      issuedOn: "2026-10-20",
      reason: "Include both combined posts",
      details,
      renderPdf,
    })
    expect(renderPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining(identity),
      })
    )
  })

  it("lists offer letters for the selected job within the organization", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const repository = createRecruitmentEmploymentLetterRepository({
      pool: { query } as unknown as Pool,
    })
    await expect(
      repository.listForJob("organization-1", "job-1")
    ).resolves.toEqual([])
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /letter\.organization_id = \$1[\s\S]*application\.job_post_id = \$2[\s\S]*letter\.letter_type = 'offer'/
      ),
      ["organization-1", "job-1"]
    )
  })
  it("lists only offer letters linked to the selected candidate", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          application_id: "application-1",
          department: "Human Resources",
          designation: "HOD",
          details: {},
          employee_code: null,
          employee_name: "Harsh Maniar",
          file_available: true,
          id: "letter-1",
          issued_on: "2026-09-04",
          joining_date: "2026-09-15",
          last_working_date: null,
          letter_type: "offer",
          post_code: "HR-HO-2",
          post_id: "post-1",
          reference_number: "MRMPL-HR-202627-OL-1",
        },
      ],
    })
    const repository = createRecruitmentEmploymentLetterRepository({
      pool: { query } as unknown as Pool,
    })

    await expect(
      repository.listForCandidate("organization-1", "candidate-1")
    ).resolves.toEqual([
      expect.objectContaining({
        id: "letter-1",
        letterType: "offer",
        referenceNumber: "MRMPL-HR-202627-OL-1",
      }),
    ])
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /application\.candidate_id = \$2[\s\S]*letter\.letter_type = 'offer'/
      ),
      ["organization-1", "candidate-1"]
    )
  })
})
