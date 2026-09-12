import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"
import { migrateDatabase } from "./migrate"
import { createRecruitmentRepository } from "./recruitment"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString, max: 1 })
const repository = createRecruitmentRepository({ pool })
beforeAll(() => migrateDatabase({ connectionString }), 120_000)
afterAll(() => pool.end())

test("deleting a grouping preserves its approved posts and employee assignments", async () => {
  const { organizationId, combinedRoleId } = await fixture()
  const before = await repository.listPosts(organizationId)
  await expect(
    repository.deleteCombinedRole({
      organizationId: randomUUID(),
      combinedRoleId,
    })
  ).rejects.toThrow("not found")
  await repository.deleteCombinedRole({ organizationId, combinedRoleId })
  expect(await repository.listCombinedRoles(organizationId)).toEqual([])
  const posts = await repository.listPosts(organizationId)
  expect(posts).toHaveLength(2)
  for (const post of posts) {
    const original = before.find((row) => row.id === post.id)!
    expect(post).toMatchObject({
      postCode: original.postCode,
      vacancyCode: original.postCode,
      combinedRoleId: null,
      employeeName: "Test Employee",
      employeeCode: "104",
      status: "Occupied",
    })
  }
})

test("a linked job blocks deletion and retains the combined membership", async () => {
  const { organizationId, combinedRoleId, postIds } = await fixture()
  const jobId = randomUUID()
  await pool.query(
    `INSERT INTO recruitment.job_posts
    (id, organization_id, post_id, job_number, vacancy_code, title, status,
      closed_on, source_system, source_table, source_id)
    VALUES ($1::uuid,$2,$3,$1::text,'CR-1','Test job','Closed',current_date,
      'test','jobs',$1::text)`,
    [jobId, organizationId, postIds[0]]
  )
  const before = await repository.listCombinedRoles(organizationId)
  await expect(
    repository.deleteCombinedRole({ organizationId, combinedRoleId })
  ).rejects.toThrow("linked job post")
  expect(await repository.listCombinedRoles(organizationId)).toEqual(before)
})

async function fixture() {
  const organizationId = randomUUID(),
    departmentId = randomUUID(),
    designationId = randomUUID(),
    combinedRoleId = randomUUID()
  const postIds = [randomUUID(), randomUUID()]
  await pool.query(
    "INSERT INTO core.organizations (id, code, name) VALUES ($1::uuid,$1::text,'Combined deletion test')",
    [organizationId]
  )
  await pool.query(
    `INSERT INTO recruitment.departments
    (id, organization_id, code, name, source_system, source_table, source_id)
    VALUES ($1::uuid,$2,'QA','QA','test','departments',$1::text)`,
    [departmentId, organizationId]
  )
  await pool.query(
    `INSERT INTO recruitment.designations
    (id, organization_id, code, name, source_system, source_table, source_id)
    VALUES ($1::uuid,$2,'AS','Assistant','test','designations',$1::text)`,
    [designationId, organizationId]
  )
  await pool.query(
    `INSERT INTO recruitment.combined_roles
    (id, organization_id, name, vacancy_code, source_system, source_table, source_id)
    VALUES ($1::uuid,$2,'Combined test','CR-1','test','combined_roles',$1::text)`,
    [combinedRoleId, organizationId]
  )
  for (const [index, postId] of postIds.entries()) {
    await pool.query(
      `INSERT INTO recruitment.posts
      (id, organization_id, department_id, designation_id, combined_role_id,
        vacancy_number, post_code, vacancy_code, employee_name, employee_code,
        status, source_system, source_table, source_id)
      VALUES ($1::uuid,$2,$3,$4,$5,$1::text,$1::text,'CR-1','Test Employee','104',
        'Occupied','test','posts',$1::text)`,
      [postId, organizationId, departmentId, designationId, combinedRoleId]
    )
    await pool.query(
      `INSERT INTO recruitment.combined_role_posts
      (combined_role_id, post_id, is_primary) VALUES ($1,$2,$3)`,
      [combinedRoleId, postId, index === 0]
    )
  }
  return { organizationId, combinedRoleId, postIds }
}
