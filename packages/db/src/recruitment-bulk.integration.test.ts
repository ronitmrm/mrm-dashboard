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
})
