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

describe("Department Master rename", () => {
  test("updates linked names everywhere or clears existing selections", async () => {
    const suffix = randomUUID()
    const organization = await pool.query<{ id: string }>(
      `
        INSERT INTO core.organizations (code, name)
        VALUES ($1, 'Department Rename Test')
        RETURNING id
      `,
      [`DEPARTMENT-RENAME-${suffix}`]
    )
    const organizationId = organization.rows[0]!.id
    const department = await pool.query<{ id: string }>(
      `
        INSERT INTO recruitment.departments (
          organization_id, code, name, source_system, source_table, source_id
        ) VALUES ($1, 'PEOPLE', 'Human Resources', 'test', 'departments', $2)
        RETURNING id
      `,
      [organizationId, `department-${suffix}`]
    )
    const departmentId = department.rows[0]!.id
    const designation = await pool.query<{ id: string }>(
      `
        INSERT INTO recruitment.designations (
          organization_id, code, name, source_system, source_table, source_id
        ) VALUES ($1, 'INS', 'Inspector', 'test', 'designations', $2)
        RETURNING id
      `,
      [organizationId, `designation-${suffix}`]
    )
    const designationId = designation.rows[0]!.id
    const template = await pool.query<{ id: string }>(
      `
        INSERT INTO recruitment.requirement_templates (
          organization_id, template_code, name, department_id,
          designation_id, source_system, source_table, source_id
        ) VALUES (
          $1, 'JRT-0001', 'Inspector Template', $2, $3,
          'test', 'templates', $4
        )
        RETURNING id
      `,
      [organizationId, departmentId, designationId, `template-${suffix}`]
    )
    const post = await pool.query<{ id: string }>(
      `
        INSERT INTO recruitment.posts (
          organization_id, department_id, designation_id,
          requirement_template_id, vacancy_number, post_code, vacancy_code,
          source_system, source_table, source_id
        ) VALUES (
          $1, $2, $3, $4, '1', 'PEOPLE-INS-1', 'PEOPLE-INS-1',
          'test', 'posts', $5
        )
        RETURNING id
      `,
      [
        organizationId,
        departmentId,
        designationId,
        template.rows[0]!.id,
        `post-${suffix}`,
      ]
    )
    const candidate = await pool.query<{ id: string }>(
      `
        INSERT INTO recruitment.candidates (
          organization_id, name, phone, preferred_department_id,
          source_system, source_table, source_id
        ) VALUES ($1, 'Candidate', $2, $3, 'test', 'candidates', $4)
        RETURNING id
      `,
      [organizationId, `PHONE-${suffix}`, departmentId, `candidate-${suffix}`]
    )
    await pool.query(
      `
        INSERT INTO recruitment.candidate_departments (
          candidate_id, department_id
        ) VALUES ($1, $2)
      `,
      [candidate.rows[0]!.id, departmentId]
    )
    await pool.query(
      `
        INSERT INTO recruitment.job_posts (
          organization_id, post_id, requirement_template_id, job_number,
          vacancy_code, title, source_system, source_table, source_id
        ) VALUES (
          $1, $2, $3, 'PEOPLE-INS-1', 'PEOPLE-INS-1',
          'Inspector / Human Resources', 'test', 'jobs', $4
        )
      `,
      [organizationId, post.rows[0]!.id, template.rows[0]!.id, `job-${suffix}`]
    )

    const repository = createRecruitmentRepository({ pool })
    const propagated = await repository.renameDepartmentMaster({
      departmentId,
      name: "People And Culture",
      organizationId,
      referenceMode: "propagate",
    })
    expect(propagated).toMatchObject({
      clearedCandidateCount: 0,
      clearedPostCount: 0,
      clearedTemplateCount: 0,
      updatedJobCount: 1,
    })
    expect((await repository.listPosts(organizationId))[0]?.department).toBe(
      "People And Culture"
    )
    expect(
      (await repository.listTemplates(organizationId))[0]?.department
    ).toBe("People And Culture")
    expect(
      (await repository.listCandidates(organizationId))[0]?.departments
    ).toEqual(["People And Culture"])
    expect((await repository.listJobs(organizationId))[0]?.title).toBe(
      "Inspector / People And Culture"
    )

    const cleared = await repository.renameDepartmentMaster({
      departmentId,
      name: "Talent Operations",
      organizationId,
      referenceMode: "clear",
    })
    expect(cleared).toMatchObject({
      clearedCandidateCount: 1,
      clearedPostCount: 1,
      clearedTemplateCount: 1,
      updatedJobCount: 1,
    })
    expect((await repository.listPosts(organizationId))[0]?.department).toBe("")
    expect(
      (await repository.listTemplates(organizationId))[0]?.department
    ).toBeNull()
    const savedCandidate = (await repository.listCandidates(organizationId))[0]
    expect(savedCandidate?.departments).toEqual([])
    expect(savedCandidate?.preferredDepartmentCode).toBeNull()
    expect((await repository.listJobs(organizationId))[0]?.title).toBe("Inspector")
  })
})
