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
      const bulkInput = {
        candidateIds: [
          candidates.rows[1]!.id,
          ...candidates.rows.slice(1).map((candidate) => candidate.id),
        ],
        jobId: jobs.rows[1]!.id,
        organizationId,
      }
      expect(Buffer.byteLength(JSON.stringify(bulkInput))).toBeLessThanOrEqual(
        512 * 1024
      )
      const bulk = await repository.assignCandidates(bulkInput)
      const bulkStatementCount = statementCount

      expect(single).toHaveLength(1)
      expect(bulk).toHaveLength(100)
      expect(Buffer.byteLength(JSON.stringify(bulk))).toBeLessThanOrEqual(
        512 * 1024
      )
      expect(singleStatementCount).toBe(5)
      expect(bulkStatementCount).toBe(5)
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

      const orderedBulkAudits = await pool.query<{
        candidate_id: string
        command_id: string
        command_ordinal: number
        selection_ordinal: number
        source_id: string
        target_id: string
      }>(
        `
          SELECT target_id::text,
            metadata->>'candidateId' AS candidate_id,
            metadata->>'commandId' AS command_id,
            (metadata->>'commandOrdinal')::integer AS command_ordinal,
            (metadata->>'selectionOrdinal')::integer AS selection_ordinal,
            source_id
          FROM audit.events
          WHERE organization_id = $1
            AND event_type = 'recruitment.application.assigned'
            AND target_id = ANY($2::uuid[])
          ORDER BY (metadata->>'commandOrdinal')::integer
        `,
        [organizationId, bulk.map((application) => application.id)]
      )
      const commandId = orderedBulkAudits.rows[0]!.command_id
      expect(orderedBulkAudits.rows.map((audit) => audit.candidate_id)).toEqual(
        candidates.rows.slice(1).map((candidate) => candidate.id)
      )
      expect(orderedBulkAudits.rows.map((audit) => audit.target_id)).toEqual(
        bulk.map((application) => application.id)
      )
      expect(
        orderedBulkAudits.rows.map((audit) => audit.command_ordinal)
      ).toEqual(Array.from({ length: 100 }, (_, index) => index))
      expect(
        orderedBulkAudits.rows.map((audit) => audit.selection_ordinal)
      ).toEqual(Array.from({ length: 100 }, (_, index) => index))
      expect(
        new Set(orderedBulkAudits.rows.map((audit) => audit.command_id))
      ).toEqual(new Set([commandId]))
      expect(orderedBulkAudits.rows.map((audit) => audit.source_id)).toEqual(
        Array.from(
          { length: 100 },
          (_, index) =>
            `recruitment:${commandId}:${String(index).padStart(6, "0")}`
        )
      )

      statementCount = 0
      await expect(
        repository.assignCandidates({
          candidateIds: [],
          jobId: jobs.rows[1]!.id,
          organizationId,
        })
      ).rejects.toThrow("Select at least one candidate.")
      expect(statementCount).toBe(0)

      const oversizedInput = {
        candidateIds: candidates.rows.map((candidate) => candidate.id),
        jobId: jobs.rows[1]!.id,
        organizationId,
      }
      expect(
        Buffer.byteLength(JSON.stringify(oversizedInput))
      ).toBeLessThanOrEqual(512 * 1024)
      await expect(repository.assignCandidates(oversizedInput)).rejects.toThrow(
        "Select no more than 100 candidates."
      )
      expect(statementCount).toBe(0)
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
        VALUES ($1, $2, false), ($1, $3, true)
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
      const bulkInput = {
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
      }
      expect(Buffer.byteLength(JSON.stringify(bulkInput))).toBeLessThanOrEqual(
        512 * 1024
      )
      const bulk = await repository.bulkAssignEmployees(bulkInput)
      const bulkStatementCount = statementCount

      expect(single).toEqual({ assignmentCount: 1, updatedPostCount: 1 })
      expect(bulk).toEqual({ assignmentCount: 100, updatedPostCount: 101 })
      expect(Buffer.byteLength(JSON.stringify(bulk))).toBeLessThanOrEqual(
        512 * 1024
      )
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

      const bulkTargetIds = [
        ...posts.rows.slice(1, 100).map((post) => post.id),
        posts.rows[101]!.id,
        posts.rows[100]!.id,
      ]
      const orderedBulkAudits = await pool.query<{
        command_id: string
        command_ordinal: number
        event_type: string
        post_id: string
        row_number: number
        source_id: string
        target_id: string
      }>(
        `
          SELECT target_id::text,
            event_type,
            metadata->>'commandId' AS command_id,
            (metadata->>'commandOrdinal')::integer AS command_ordinal,
            (metadata->>'rowNumber')::integer AS row_number,
            metadata->>'postId' AS post_id,
            source_id
          FROM audit.events
          WHERE organization_id = $1
            AND event_type = 'recruitment.employee.occupied'
            AND target_id = ANY($2::uuid[])
          ORDER BY (metadata->>'commandOrdinal')::integer
        `,
        [organizationId, bulkTargetIds]
      )
      const commandId = orderedBulkAudits.rows[0]!.command_id
      expect(orderedBulkAudits.rows.map((audit) => audit.target_id)).toEqual(
        bulkTargetIds
      )
      expect(orderedBulkAudits.rows.map((audit) => audit.post_id)).toEqual(
        bulkTargetIds
      )
      expect(orderedBulkAudits.rows.map((audit) => audit.row_number)).toEqual([
        ...Array.from({ length: 99 }, (_, index) => index + 2),
        101,
        101,
      ])
      expect(
        orderedBulkAudits.rows.map((audit) => audit.command_ordinal)
      ).toEqual(Array.from({ length: 101 }, (_, index) => index))
      expect(
        new Set(orderedBulkAudits.rows.map((audit) => audit.command_id))
      ).toEqual(new Set([commandId]))
      expect(orderedBulkAudits.rows.map((audit) => audit.source_id)).toEqual(
        Array.from(
          { length: 101 },
          (_, index) =>
            `recruitment:${commandId}:${String(index).padStart(6, "0")}`
        )
      )

      statementCount = 0
      await expect(
        repository.bulkAssignEmployees({
          assignments: [],
          organizationId,
        })
      ).rejects.toThrow("At least one employee assignment is required.")
      expect(statementCount).toBe(0)

      const oversizedAssignments = Array.from({ length: 101 }, (_, index) => ({
        employeeCode: `EMP-OVERSIZED-${index}-${suffix}`,
        employeeEvent: "Joined",
        employeeName: `Oversized Employee ${index}`,
        rowNumber: index + 2,
        targetCode: posts.rows[0]!.post_code,
        targetType: "individual" as const,
      }))
      expect(
        Buffer.byteLength(JSON.stringify(oversizedAssignments))
      ).toBeLessThanOrEqual(512 * 1024)
      await expect(
        repository.bulkAssignEmployees({
          assignments: oversizedAssignments,
          organizationId,
        })
      ).rejects.toThrow("At most 100 employee assignments are allowed.")
      expect(statementCount).toBe(0)

      await expect(
        repository.bulkAssignEmployees({
          assignments: [
            {
              employeeEvent: "Removed",
              rowNumber: 301,
              targetCode: posts.rows[0]!.post_code,
              targetType: "individual",
            },
            {
              employeeEvent: "Removed",
              rowNumber: 301,
              targetCode: posts.rows[1]!.post_code,
              targetType: "individual",
            },
          ],
          organizationId,
        })
      ).rejects.toThrow("Individual Posts row 301 appears more than once.")
      expect(statementCount).toBe(0)

      const beforeRepeated = await pool.query<{
        row_version: string
      }>(`SELECT row_version::text FROM recruitment.posts WHERE id = $1`, [
        posts.rows[0]!.id,
      ])
      statementCount = 0
      const repeated = await repository.bulkAssignEmployees({
        assignments: [
          {
            employeeCode: `EMP-REPEATED-${suffix}`,
            employeeEvent: "Appointed",
            employeeName: "Repeated Employee",
            rowNumber: 302,
            targetCode: posts.rows[0]!.post_code,
            targetType: "individual",
          },
          {
            employeeEvent: "Removed",
            rowNumber: 301,
            targetCode: posts.rows[0]!.post_code,
            targetType: "individual",
          },
        ],
        organizationId,
      })
      expect(repeated).toEqual({ assignmentCount: 2, updatedPostCount: 2 })
      expect(statementCount).toBe(5)
      const afterRepeated = await pool.query<{
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
      expect(afterRepeated.rows[0]).toEqual({
        employee_code: `EMP-REPEATED-${suffix}`,
        employee_name: "Repeated Employee",
        row_version: String(Number(beforeRepeated.rows[0]!.row_version) + 2),
        status: "Appointed",
      })
      const repeatedAudits = await pool.query<{
        command_id: string
        command_ordinal: number
        event_type: string
        row_number: number
        source_id: string
      }>(
        `
          SELECT event_type,
            metadata->>'commandId' AS command_id,
            (metadata->>'commandOrdinal')::integer AS command_ordinal,
            (metadata->>'rowNumber')::integer AS row_number,
            source_id
          FROM audit.events
          WHERE organization_id = $1
            AND target_id = $2
            AND metadata ? 'commandId'
          ORDER BY occurred_at, (metadata->>'commandOrdinal')::integer
        `,
        [organizationId, posts.rows[0]!.id]
      )
      const repeatedAuditsByCommand = new Map<
        string,
        typeof repeatedAudits.rows
      >()
      for (const audit of repeatedAudits.rows) {
        const events = repeatedAuditsByCommand.get(audit.command_id) ?? []
        events.push(audit)
        repeatedAuditsByCommand.set(audit.command_id, events)
      }
      const repeatedCommand = [...repeatedAuditsByCommand.entries()].find(
        ([, events]) => events.length === 2
      )
      expect(repeatedCommand).toBeDefined()
      const [repeatedCommandId, repeatedCommandEvents] = repeatedCommand!
      expect(repeatedCommandEvents!.map((audit) => audit.event_type)).toEqual([
        "recruitment.employee.vacant",
        "recruitment.employee.appointed",
      ])
      expect(repeatedCommandEvents!.map((audit) => audit.row_number)).toEqual([
        301, 302,
      ])
      expect(
        repeatedCommandEvents!.map((audit) => audit.command_ordinal)
      ).toEqual([0, 1])
      expect(repeatedCommandEvents!.map((audit) => audit.source_id)).toEqual([
        `recruitment:${repeatedCommandId}:000000`,
        `recruitment:${repeatedCommandId}:000001`,
      ])

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
      expect(Number(auditsAfterFailure.rows[0]!.count)).toBe(104)
    } finally {
      await repository.close()
      await trackedPool.end()
    }
  })
})
