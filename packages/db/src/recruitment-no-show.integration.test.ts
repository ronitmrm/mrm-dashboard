import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"
import { migrateDatabase } from "./migrate"
import { createRecruitmentRepository } from "./recruitment"
import { createRecruitmentEmploymentLetterRepository } from "./recruitment-employment-letter-repository"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString, max: 1 })
const repository = createRecruitmentRepository({ pool })
const letters = createRecruitmentEmploymentLetterRepository({ pool })
beforeAll(() => migrateDatabase({ connectionString }), 120_000)
afterAll(() => pool.end())

test.each(["non-joining", "joining"])(
  "candidate replacement preserves outgoing combined posts through appointment and %s",
  async (outcome) => {
    const f = await fixture()
    await pool.query(
      "UPDATE recruitment.applications SET willing_to_join=NULL WHERE id=$1",
      [f.applicationId]
    )
    await pool.query(
      "UPDATE recruitment.job_posts SET status='Open',closed_on=NULL WHERE id=$1",
      [f.jobId]
    )
    await pool.query(
      `UPDATE recruitment.posts SET status='Resigned', employee_name='Outgoing Employee',
    employee_code='104',last_working_date=current_date+10,joining_date=NULL,appointed_application_id=NULL
    WHERE id=ANY($1::uuid[])`,
      [f.postIds]
    )
    for (const round of ["Screening Round", "Department Round", "HR Round"]) {
      await pool.query(
        `INSERT INTO recruitment.interviews
      (organization_id,application_id,round_name,status,source_system,source_table,source_id)
      VALUES ($1,$2,$3,'Approved','test','interviews',$4)`,
        [f.organizationId, f.applicationId, round, randomUUID()]
      )
    }
    await repository.completeCandidateAppointment({
      organizationId: f.organizationId,
      applicationId: f.applicationId,
      willingToJoin: "yes",
      joiningDate: "2026-01-01",
      salaryBeforeProbation: 10000,
      salaryAfterProbationMinimum: 12000,
      salaryAfterProbationMaximum: 14000,
    })
    const posts = (await repository.listPosts(f.organizationId)).filter(
      (post) => f.postIds.some((id) => id === post.id)
    )
    expect(posts).toHaveLength(2)
    for (const post of posts)
      expect(post).toMatchObject({
        employeeName: "Outgoing Employee",
        employeeCode: "104",
        status: "Resigned",
        replacementAppointments: [
          expect.objectContaining({
            applicationId: f.applicationId,
            status: "Pending",
          }),
        ],
      })
    const workspace = await repository.getJobWorkspace(
      f.organizationId,
      f.jobId
    )
    expect(workspace?.job.status).toBe("Closed")
    expect(workspace?.applications[0]?.canRecordDidNotJoin).toBe(true)
    await expect(
      repository.assignEmployee({
        organizationId: f.organizationId,
        postId: f.postIds[0]!,
        employeeEvent: "Replacement Joined",
        employeeCode: "205",
      })
    ).rejects.toThrow("last working date")
    if (outcome === "joining") {
      await pool.query(
        "UPDATE recruitment.posts SET last_working_date=current_date-1 WHERE id=ANY($1::uuid[])",
        [f.postIds]
      )
      await repository.assignEmployee({
        organizationId: f.organizationId,
        postId: f.postIds[0]!,
        employeeEvent: "Replacement Joined",
        employeeCode: "205",
      })
      for (const post of (await repository.listPosts(f.organizationId)).filter(
        (post) => f.postIds.some((id) => id === post.id)
      )) {
        expect(post).toMatchObject({
          employeeName: "No-Show Candidate",
          employeeCode: "205",
          status: "Occupied",
          replacementAppointments: [
            expect.objectContaining({
              applicationId: f.applicationId,
              status: "Joined",
              outgoingEmployeeName: "Outgoing Employee",
              outgoingEmployeeCode: "104",
            }),
          ],
        })
      }
      expect(
        (await repository.getJobWorkspace(f.organizationId, f.jobId))
          ?.applications[0]?.canRecordDidNotJoin
      ).toBe(false)
      await expect(
        repository.recordCandidateDidNotJoin({
          organizationId: f.organizationId,
          applicationId: f.applicationId,
          didNotJoinOn: "2026-01-02",
          reason: "Late no-show report",
        })
      ).rejects.toThrow("joined")
      return
    }
    await repository.recordCandidateDidNotJoin({
      organizationId: f.organizationId,
      applicationId: f.applicationId,
      didNotJoinOn: "2026-01-02",
      reason: "Candidate did not attend",
    })
    const cancelled = (await repository.listPosts(f.organizationId)).filter(
      (post) => f.postIds.some((id) => id === post.id)
    )
    for (const post of cancelled)
      expect(post).toMatchObject({
        employeeName: "Outgoing Employee",
        employeeCode: "104",
        status: "Resigned",
        replacementAppointments: [
          expect.objectContaining({ status: "Cancelled" }),
        ],
      })
    expect(
      (await repository.getJobWorkspace(f.organizationId, f.jobId))?.job.status
    ).toBe("Open")
  },
  60_000
)

async function fixture(joined = false) {
  const organizationId = randomUUID(),
    departmentId = randomUUID(),
    designationId = randomUUID()
  const candidateId = randomUUID(),
    jobId = randomUUID(),
    applicationId = randomUUID()
  const postIds = [randomUUID(), randomUUID()],
    otherPostId = randomUUID(),
    combinedId = randomUUID()
  await pool.query(
    "INSERT INTO core.organizations (id, code, name) VALUES ($1::uuid, $1::text, 'No-show test')",
    [organizationId]
  )
  await pool.query(
    "INSERT INTO recruitment.departments (id, organization_id, code, name, source_system, source_table, source_id) VALUES ($1::uuid,$2,'QA','QA','test','departments',$1::text)",
    [departmentId, organizationId]
  )
  await pool.query(
    "INSERT INTO recruitment.designations (id, organization_id, code, name, source_system, source_table, source_id) VALUES ($1::uuid,$2,'AS','Assistant','test','designations',$1::text)",
    [designationId, organizationId]
  )
  await pool.query(
    "INSERT INTO recruitment.combined_roles (id, organization_id, name, vacancy_code, source_system, source_table, source_id) VALUES ($1::uuid,$2,'Combined role','CR-1','test','combined_roles',$1::text)",
    [combinedId, organizationId]
  )
  for (const id of [...postIds, otherPostId]) {
    await pool.query(
      `INSERT INTO recruitment.posts (id, organization_id, department_id, designation_id, vacancy_number, post_code, vacancy_code, source_system, source_table, source_id)
      VALUES ($1::uuid,$2,$3,$4,$1::text,$1::text,$1::text,'test','posts',$1::text)`,
      [id, organizationId, departmentId, designationId]
    )
  }
  await pool.query(
    "UPDATE recruitment.posts SET combined_role_id = $1 WHERE id = ANY($2::uuid[])",
    [combinedId, postIds]
  )
  await pool.query(
    "INSERT INTO recruitment.combined_role_posts (combined_role_id, post_id, is_primary) VALUES ($1::uuid,$2,true),($1,$3,false)",
    [combinedId, ...postIds]
  )
  await pool.query(
    "INSERT INTO recruitment.candidates (id, organization_id, name, phone, source_system, source_table, source_id) VALUES ($1::uuid,$2,'No-show Candidate','1234567890','test','candidates',$1::text)",
    [candidateId, organizationId]
  )
  await pool.query(
    `INSERT INTO recruitment.job_posts (id, organization_id, post_id, job_number, vacancy_code, title, status, closed_on, source_system, source_table, source_id)
    VALUES ($1::uuid,$2,$3,$1::text,'CR-1','Combined role','Closed',current_date,'test','jobs',$1::text)`,
    [jobId, organizationId, postIds[0]]
  )
  await pool.query(
    `INSERT INTO recruitment.applications (id, organization_id, candidate_id, job_post_id, status, willing_to_join, joining_date, salary_before_probation, salary_after_probation_minimum, salary_after_probation_maximum, source_system, source_table, source_id)
    VALUES ($1::uuid,$2,$3,$4,'Approved',true,'2026-01-01',10000,12000,14000,'test','applications',$1::text)`,
    [applicationId, organizationId, candidateId, jobId]
  )
  await pool.query(
    "UPDATE recruitment.posts SET status=$1, employee_name='No-show Candidate', employee_code=$2, appointed_application_id=$3, joining_date='2026-01-01' WHERE id=ANY($4::uuid[])",
    [
      joined ? "Occupied" : "Appointed",
      joined ? "123" : null,
      applicationId,
      postIds,
    ]
  )
  await pool.query(
    "UPDATE recruitment.posts SET status='Occupied',employee_name='Other Employee',employee_code='456' WHERE id=$1",
    [otherPostId]
  )
  const letterId = randomUUID()
  await pool.query(
    `INSERT INTO recruitment.employment_letters (id, organization_id, letter_type, application_id, post_id, employee_name, designation, department, joining_date, reference_number, issued_on, pdf_bytes, pdf_file_name, pdf_sha256, generated_at, source_system, source_table, source_id)
    VALUES ($1::uuid,$2,'offer',$3,$4,'No-show Candidate','Assistant','QA','2026-01-01','TEST-OFFER','2025-12-01',decode('504446','hex'),'test.pdf',repeat('a',64),now(),'test','letters',$1::text)`,
    [letterId, organizationId, applicationId, postIds[0]]
  )
  return {
    organizationId,
    candidateId,
    applicationId,
    jobId,
    postIds,
    otherPostId,
    letterId,
  }
}

test("non-joining releases only the reserved posts, reopens the same job and retains the offer and reason", async () => {
  const f = await fixture()
  const input = {
    organizationId: f.organizationId,
    applicationId: f.applicationId,
    didNotJoinOn: "2026-01-02",
    reason: "Candidate did not attend on the agreed joining date",
  }
  await expect(
    repository.recordCandidateDidNotJoin({
      ...input,
      organizationId: randomUUID(),
    })
  ).rejects.toThrow("not found")
  await expect(
    repository.recordCandidateDidNotJoin({ ...input, reason: " " })
  ).rejects.toThrow("reason")
  await expect(
    repository.recordCandidateDidNotJoin({
      ...input,
      didNotJoinOn: "2025-12-31",
    })
  ).rejects.toThrow("joining date")
  await expect(
    repository.recordCandidateDidNotJoin({
      ...input,
      didNotJoinOn: "2099-01-01",
    })
  ).rejects.toThrow("future")
  await expect(
    repository.recordCandidateDidNotJoin(input)
  ).resolves.toMatchObject({ jobId: f.jobId, releasedPostCount: 2 })
  const workspace = await repository.getJobWorkspace(f.organizationId, f.jobId)
  expect(workspace?.job.status).toBe("Open")
  expect(workspace?.applications).toContainEqual(
    expect.objectContaining({
      id: f.applicationId,
      status: "Did Not Join",
      joiningDate: "2026-01-01",
      didNotJoinOn: input.didNotJoinOn,
      didNotJoinReason: input.reason,
      canRecordDidNotJoin: false,
    })
  )
  const posts = await repository.listPosts(f.organizationId)
  for (const id of f.postIds)
    expect(posts).toContainEqual(
      expect.objectContaining({
        id,
        status: "Vacant",
        employeeName: null,
        employeeCode: null,
      })
    )
  expect(posts).toContainEqual(
    expect.objectContaining({
      id: f.otherPostId,
      status: "Occupied",
      employeeName: "Other Employee",
    })
  )
  expect(await letters.listForJob(f.organizationId, f.jobId)).toContainEqual(
    expect.objectContaining({
      id: f.letterId,
      fileAvailable: true,
      referenceNumber: "TEST-OFFER",
    })
  )
  expect(
    await repository.listCandidateEvents(f.organizationId, f.candidateId)
  ).toContainEqual(
    expect.objectContaining({ eventType: "Did Not Join", notes: input.reason })
  )
  await expect(repository.recordCandidateDidNotJoin(input)).rejects.toThrow(
    "already"
  )
}, 60_000)

test("a joined or replaced appointment cannot release posts or reopen the job", async () => {
  const f = await fixture(true)
  const input = {
    organizationId: f.organizationId,
    applicationId: f.applicationId,
    didNotJoinOn: "2026-01-02",
    reason: "No-show reported",
  }
  await expect(repository.recordCandidateDidNotJoin(input)).rejects.toThrow(
    "joined"
  )
  expect(
    (await repository.getJobWorkspace(f.organizationId, f.jobId))?.job.status
  ).toBe("Closed")
  await pool.query(
    "UPDATE recruitment.posts SET status='Appointed', employee_code=NULL WHERE id=ANY($1::uuid[])",
    [f.postIds]
  )
  await pool.query(
    "UPDATE recruitment.posts SET appointed_application_id=NULL WHERE id=$1",
    [f.postIds[1]]
  )
  await expect(repository.recordCandidateDidNotJoin(input)).rejects.toThrow(
    "reserved"
  )
  expect(
    (await repository.getJobWorkspace(f.organizationId, f.jobId))?.job.status
  ).toBe("Closed")
}, 60_000)
