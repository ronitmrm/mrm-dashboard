import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { migrateDatabase } from "./migrate"
import { createRecruitmentRepository } from "./recruitment"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })

beforeAll(async () => {
  await migrateDatabase({ connectionString })
})

afterAll(async () => {
  await pool.end()
})

describe("PostgreSQL recruitment bulk operations", () => {
  test("assigns one hundred candidates with constant statements and complete audit", async () => {
    const suffix = randomUUID()
    const organization = await pool.query<{ id: string }>(
      `
        INSERT INTO core.organizations (code, name)
        VALUES ($1, 'Recruitment Bulk Test')
        RETURNING id
      `,
      [`REC-BULK-${suffix}`]
    )
    const organizationId = organization.rows[0]!.id
    const candidates = await pool.query<{ id: string }>(
      `
        WITH inserted AS (
          INSERT INTO recruitment.candidates (
            organization_id, name, phone, source_system, source_table,
            source_id
          )
          SELECT $1, 'Candidate ' || candidate_number,
            $2 || '-' || lpad(candidate_number::text, 3, '0'),
            'test', 'candidates', $3 || ':' || candidate_number
          FROM generate_series(1, 101) AS candidate_number
          RETURNING id, phone
        )
        SELECT id FROM inserted ORDER BY phone
      `,
      [organizationId, `PHONE-${suffix}`, `candidate-${suffix}`]
    )
    const jobs = await pool.query<{ id: string }>(
      `
        WITH inserted AS (
          INSERT INTO recruitment.job_posts (
            organization_id, job_number, vacancy_code, title,
            source_system, source_table, source_id
          )
          VALUES
            ($1, $2, $2, 'Single assignment', 'test', 'job_posts', $2),
            ($1, $3, $3, 'Bulk assignment', 'test', 'job_posts', $3)
          RETURNING id, job_number
        )
        SELECT id FROM inserted ORDER BY job_number
      `,
      [organizationId, `JOB-A-${suffix}`, `JOB-B-${suffix}`]
    )

    const trackedPool = new Pool({ connectionString, max: 1 })
    let statementCount = 0
    trackedPool.on("connect", (client) => {
      const originalQuery = client.query.bind(client)
      client.query = ((...args: Parameters<typeof client.query>) => {
        statementCount += 1
        return originalQuery(...args)
      }) as typeof client.query
    })
    const repository = createRecruitmentRepository({ pool: trackedPool })

    try {
      const single = await repository.assignCandidates({
        candidateIds: [candidates.rows[0]!.id],
        jobId: jobs.rows[0]!.id,
        organizationId,
      })
      const singleStatementCount = statementCount
      statementCount = 0
      const bulk = await repository.assignCandidates({
        candidateIds: candidates.rows.slice(1).map((candidate) => candidate.id),
        jobId: jobs.rows[1]!.id,
        organizationId,
      })
      const bulkStatementCount = statementCount

      expect(single).toHaveLength(1)
      expect(bulk).toHaveLength(100)
      expect(bulkStatementCount).toBe(singleStatementCount)
      const applicationIds = [...single, ...bulk].map(
        (application) => application.id
      )
      const audits = await pool.query<{
        candidate_id: string
        target_id: string
      }>(
        `
          SELECT target_id::text, metadata->>'candidateId' AS candidate_id
          FROM audit.events
          WHERE organization_id = $1
            AND event_type = 'recruitment.application.assigned'
            AND target_id = ANY($2::uuid[])
        `,
        [organizationId, applicationIds]
      )
      expect(audits.rows).toHaveLength(101)
      expect(audits.rows.map((audit) => audit.candidate_id).sort()).toEqual(
        candidates.rows.map((candidate) => candidate.id).sort()
      )
    } finally {
      await repository.close()
      await trackedPool.end()
    }
  })

  test("applies a one-hundred-row employee workbook with bounded statements", async () => {
    const suffix = randomUUID()
    const organization = await pool.query<{ id: string }>(
      `
        INSERT INTO core.organizations (code, name)
        VALUES ($1, 'Employee Bulk Test')
        RETURNING id
      `,
      [`EMP-BULK-${suffix}`]
    )
    const organizationId = organization.rows[0]!.id
    const department = await pool.query<{ id: string }>(
      `
        INSERT INTO recruitment.departments (
          organization_id, code, name, source_system, source_table, source_id
        )
        VALUES ($1, $2, 'Bulk Department', 'test', 'departments', $2)
        RETURNING id
      `,
      [organizationId, `DEP-${suffix}`]
    )
    const designation = await pool.query<{ id: string }>(
      `
        INSERT INTO recruitment.designations (
          organization_id, code, name, source_system, source_table, source_id
        )
        VALUES ($1, $2, 'Bulk Designation', 'test', 'designations', $2)
        RETURNING id
      `,
      [organizationId, `DES-${suffix}`]
    )
    const combinedRole = await pool.query<{ id: string }>(
      `
        INSERT INTO recruitment.combined_roles (
          organization_id, name, vacancy_code, source_system, source_table,
          source_id
        )
        VALUES ($1, 'Bulk Combined Role', $2, 'test', 'combined_roles', $2)
        RETURNING id
      `,
      [organizationId, `CMB-${suffix}`]
    )
    const combinedRoleId = combinedRole.rows[0]!.id
    const posts = await pool.query<{ id: string; post_code: string }>(
      `
        WITH inserted AS (
          INSERT INTO recruitment.posts (
            organization_id, department_id, designation_id,
            combined_role_id, vacancy_number, post_code, vacancy_code,
            source_system, source_table, source_id
          )
          SELECT $1, $2, $3,
            CASE WHEN post_number > 100 THEN $4::uuid ELSE NULL END,
            post_number::text,
            $5 || '-' || lpad(post_number::text, 3, '0'),
            $5 || '-' || lpad(post_number::text, 3, '0'),
            'test', 'posts', $6 || ':' || post_number
          FROM generate_series(1, 102) AS post_number
          RETURNING id, post_code
        )
        SELECT id, post_code FROM inserted ORDER BY post_code
      `,
      [
        organizationId,
        department.rows[0]!.id,
        designation.rows[0]!.id,
        combinedRoleId,
        `POST-${suffix}`,
        `post-${suffix}`,
      ]
    )
    await pool.query(
      `
        INSERT INTO recruitment.combined_role_posts (
          combined_role_id, post_id, is_primary
        )
        VALUES ($1, $2, true), ($1, $3, false)
      `,
      [combinedRoleId, posts.rows[100]!.id, posts.rows[101]!.id]
    )

    const trackedPool = new Pool({ connectionString, max: 1 })
    let statementCount = 0
    trackedPool.on("connect", (client) => {
      const originalQuery = client.query.bind(client)
      client.query = ((...args: Parameters<typeof client.query>) => {
        statementCount += 1
        return originalQuery(...args)
      }) as typeof client.query
    })
    const repository = createRecruitmentRepository({ pool: trackedPool })

    try {
      const single = await repository.bulkAssignEmployees({
        assignments: [
          {
            employeeCode: `EMP-1-${suffix}`,
            employeeEvent: "Joined",
            employeeName: "Single Employee",
            rowNumber: 2,
            targetCode: posts.rows[0]!.post_code,
            targetType: "individual",
          },
        ],
        organizationId,
      })
      const singleStatementCount = statementCount
      statementCount = 0
      const bulk = await repository.bulkAssignEmployees({
        assignments: [
          ...posts.rows.slice(1, 100).map((post, index) => ({
            employeeCode: `EMP-${index + 2}-${suffix}`,
            employeeEvent: "Joined",
            employeeName: `Employee ${index + 2}`,
            rowNumber: index + 2,
            targetCode: post.post_code,
            targetType: "individual" as const,
          })),
          {
            employeeCode: `EMP-CMB-${suffix}`,
            employeeEvent: "Joined",
            employeeName: "Combined Employee",
            rowNumber: 101,
            targetCode: `CMB-${suffix}`,
            targetType: "combined" as const,
          },
        ],
        organizationId,
      })
      const bulkStatementCount = statementCount

      expect(single).toEqual({ assignmentCount: 1, updatedPostCount: 1 })
      expect(bulk).toEqual({ assignmentCount: 100, updatedPostCount: 101 })
      expect(singleStatementCount).toBe(5)
      expect(bulkStatementCount).toBe(6)
      const stored = await pool.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM recruitment.posts
          WHERE organization_id = $1 AND status = 'Occupied'
        `,
        [organizationId]
      )
      const audits = await pool.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM audit.events
          WHERE organization_id = $1
            AND event_type = 'recruitment.employee.occupied'
        `,
        [organizationId]
      )
      expect(Number(stored.rows[0]!.count)).toBe(102)
      expect(Number(audits.rows[0]!.count)).toBe(102)

      const beforeFailure = await pool.query<{
        employee_code: string | null
        employee_name: string | null
        row_version: string
        status: string
      }>(
        `
          SELECT employee_code, employee_name, row_version::text, status
          FROM recruitment.posts
          WHERE id = $1
        `,
        [posts.rows[0]!.id]
      )
      await expect(
        repository.bulkAssignEmployees({
          assignments: [
            {
              employeeEvent: "Removed",
              rowNumber: 202,
              targetCode: posts.rows[0]!.post_code,
              targetType: "individual",
            },
            {
              employeeCode: `EMP-BAD-${suffix}`,
              employeeEvent: "Joined",
              employeeName: "Invalid Employee",
              rowNumber: 203,
              targetCode: `MISSING-${suffix}`,
              targetType: "individual",
            },
          ],
          organizationId,
        })
      ).rejects.toThrow(
        `Individual Posts row 203: MISSING-${suffix} is not an available individual post.`
      )
      const afterFailure = await pool.query<{
        employee_code: string | null
        employee_name: string | null
        row_version: string
        status: string
      }>(
        `
          SELECT employee_code, employee_name, row_version::text, status
          FROM recruitment.posts
          WHERE id = $1
        `,
        [posts.rows[0]!.id]
      )
      const auditsAfterFailure = await pool.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM audit.events
          WHERE organization_id = $1
            AND event_type LIKE 'recruitment.employee.%'
        `,
        [organizationId]
      )
      expect(afterFailure.rows[0]).toEqual(beforeFailure.rows[0])
      expect(Number(auditsAfterFailure.rows[0]!.count)).toBe(102)
    } finally {
      await repository.close()
      await trackedPool.end()
    }
  })
})
