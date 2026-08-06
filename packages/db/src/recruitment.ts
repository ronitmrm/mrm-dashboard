import { randomUUID } from "node:crypto"

import type { Pool, PoolClient } from "pg"

import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"
import {
  nextRecruitmentCombinedRoleIdentity,
  nextRecruitmentPostIdentity,
  recruitmentAdvisoryLockKey,
} from "./recruitment-codes"

type MutationContext = {
  actorUserId?: string | null
  organizationId: string
}

export type RecruitmentMasterSnapshot = {
  departments: Array<{ code: string; id: string; name: string }>
  designations: Array<{ code: string; id: string; name: string }>
}

export type RecruitmentTemplateRow = {
  department: string | null
  designation: string
  education: string | null
  experienceRequirement: string | null
  gender: string | null
  id: string
  maximumSalary: number | null
  minimumSalary: number | null
  name: string
  roleResponsibilities: string | null
  templateCode: string
}

export type RecruitmentCombinedRoleRow = {
  id: string
  name: string
  postCodes: string[]
  primaryPostCode: string | null
  status: string
  vacancyCode: string | null
}

export type RecruitmentPostRow = {
  department: string
  designation: string
  employeeCode: string | null
  employeeName: string | null
  id: string
  postCode: string
  requirementTemplateCode: string | null
  status: string
  vacancyCode: string
  vacancyNumber: string
}

export type RecruitmentCandidateRow = {
  applicationCount: number
  currentCompany: string | null
  departments: string[]
  email: string | null
  eventCount: number
  experience: string | null
  id: string
  name: string
  phone: string
  source: string | null
  status: string
}

export type RecruitmentJobRow = {
  applicantCount: number
  id: string
  jobNumber: string
  postCode: string | null
  postDate: string
  status: string
  targetDate: string | null
  title: string
  vacancyCode: string
}

export type RecruitmentInterviewRow = {
  applicationId: string
  candidateName: string
  interviewAt: string | null
  joiningDate: string | null
  jobTitle: string
  latestRound: string | null
  latestStatus: string | null
  plannedRound: string | null
  status: string
}

function required(value: unknown, label: string) {
  const normalized = String(value ?? "").trim()
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

function optional(value: unknown) {
  const normalized = String(value ?? "").trim()
  return normalized || null
}

export function deriveRecruitmentPostStatus(input: {
  employeeCode?: string | null
  employeeName?: string | null
  storedStatus?: string | null
}) {
  if (input.storedStatus === "Inactive") return "Inactive"
  if (!optional(input.employeeName) && !optional(input.employeeCode)) {
    return "Vacant"
  }
  if (
    input.storedStatus === "Appointed" ||
    input.storedStatus === "Occupied" ||
    input.storedStatus === "Resigned"
  ) {
    return input.storedStatus
  }
  return "Occupied"
}

export function recruitmentPostDeletionBlocker(input: {
  combinedRoleLinks: number
  employeeCode?: string | null
  employeeName?: string | null
  jobPostLinks: number
}) {
  if (optional(input.employeeName) || optional(input.employeeCode)) {
    return "Remove the employee assignment before deleting this approved post."
  }
  if (input.combinedRoleLinks > 0) {
    return "Edit the combined role and remove this post from it before deleting the approved post."
  }
  if (input.jobPostLinks > 0) {
    return "This approved post cannot be deleted because a job post is linked to it."
  }
  return null
}

export function deriveRecruitmentEmployeeAssignment(input: {
  currentEmployeeCode?: string | null
  currentEmployeeName?: string | null
  employeeCode?: string | null
  employeeEvent?: string | null
  employeeName?: string | null
}) {
  const event = required(input.employeeEvent, "Employee event")
  if (event === "Removed") {
    return { employeeCode: null, employeeName: null, status: "Vacant" }
  }
  const employeeCode =
    optional(input.employeeCode) ?? optional(input.currentEmployeeCode)
  const employeeName =
    optional(input.employeeName) ?? optional(input.currentEmployeeName)
  if (!employeeCode && !employeeName) {
    throw new Error("Employee name or employee code is required.")
  }
  const statuses = {
    Appointed: "Appointed",
    Joined: "Occupied",
    Resigned: "Resigned",
  } as const
  const status = statuses[event as keyof typeof statuses]
  if (!status) throw new Error("Employee event is invalid.")
  return { employeeCode, employeeName, status }
}

function money(value: unknown) {
  const normalized = String(value ?? "")
    .replaceAll(",", "")
    .trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Salary must be a positive number.")
  }
  return parsed
}

async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await operation(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

async function audit(
  client: PoolClient,
  input: MutationContext & {
    afterState?: Record<string, unknown> | null
    beforeState?: Record<string, unknown> | null
    eventType: string
    metadata?: Record<string, unknown>
    reason?: string | null
    targetId: string
    targetTable: string
  }
) {
  await client.query(
    `
      INSERT INTO audit.events (
        organization_id, event_type, target_schema, target_table, target_id,
        actor_user_id, reason, before_state, after_state, metadata,
        source_system, source_table, source_id
      )
      VALUES ($1, $2, 'recruitment', $3, $4, $5, $6, $7, $8, $9,
        'mrm-dashboard', 'recruitment_events', $10)
    `,
    [
      input.organizationId,
      input.eventType,
      input.targetTable,
      input.targetId,
      input.actorUserId ?? null,
      input.reason ?? null,
      input.beforeState ?? null,
      input.afterState ?? null,
      input.metadata ?? {},
      randomUUID(),
    ]
  )
}

type EmployeeAssignmentInput = MutationContext & {
  employeeCode?: string | null
  employeeEvent?: string | null
  employeeName?: string | null
  postId: string
}

async function assignEmployeeInTransaction(
  client: PoolClient,
  input: EmployeeAssignmentInput
) {
  const current = await client.query<{
    combined_role_id: string | null
    employee_code: string | null
    employee_name: string | null
    id: string
  }>(
    `
      SELECT id, employee_name, employee_code, combined_role_id
      FROM recruitment.posts
      WHERE id = $1 AND organization_id = $2 AND status <> 'Inactive'
      FOR UPDATE
    `,
    [required(input.postId, "Approved post"), input.organizationId]
  )
  if (!current.rows[0]) throw new Error("Approved post was not found.")
  const currentPost = current.rows[0]
  const targets = currentPost.combined_role_id
    ? await client.query<{
        employee_code: string | null
        employee_name: string | null
        id: string
      }>(
        `
          SELECT post.id, post.employee_name, post.employee_code
          FROM recruitment.combined_role_posts link
          JOIN recruitment.combined_roles combined
            ON combined.id = link.combined_role_id
          JOIN recruitment.posts post ON post.id = link.post_id
          WHERE link.combined_role_id = $1
            AND combined.organization_id = $2
            AND combined.status = 'Active'
            AND post.organization_id = $2
            AND post.status <> 'Inactive'
          ORDER BY link.is_primary DESC, post.post_code
          FOR UPDATE OF post
        `,
        [currentPost.combined_role_id, input.organizationId]
      )
    : current
  if (!targets.rows.length) {
    throw new Error("The combined role has no active approved posts.")
  }
  const existingAssignment =
    targets.rows.find(
      (post) => optional(post.employee_name) || optional(post.employee_code)
    ) ?? currentPost
  const assignment = deriveRecruitmentEmployeeAssignment({
    currentEmployeeCode: existingAssignment.employee_code,
    currentEmployeeName: existingAssignment.employee_name,
    employeeCode: input.employeeCode,
    employeeEvent: input.employeeEvent,
    employeeName: input.employeeName,
  })
  const targetIds = targets.rows.map((post) => post.id)
  const result = await client.query<{ id: string }>(
    `
      UPDATE recruitment.posts
      SET employee_name = $1, employee_code = $2,
        status = $3,
        updated_by_user_id = $4, updated_at = now(),
        row_version = row_version + 1
      WHERE id = ANY($5::uuid[]) AND organization_id = $6
      RETURNING id
    `,
    [
      assignment.employeeName,
      assignment.employeeCode,
      assignment.status,
      input.actorUserId ?? null,
      targetIds,
      input.organizationId,
    ]
  )
  if (result.rows.length !== targetIds.length) {
    throw new Error("Not every approved post in the assignment was updated.")
  }
  for (const updated of result.rows) {
    await audit(client, {
      ...input,
      eventType: `recruitment.employee.${assignment.status.toLowerCase()}`,
      metadata: {
        assignmentScope: currentPost.combined_role_id
          ? "combined-role"
          : "approved-post",
        combinedRoleId: currentPost.combined_role_id,
        status: assignment.status,
      },
      targetId: updated.id,
      targetTable: "posts",
    })
  }
  const selectedPost = result.rows.find((post) => post.id === currentPost.id)
  if (!selectedPost) throw new Error("Approved post was not found.")
  return { selectedPost, updatedPostCount: result.rows.length }
}

async function organizationIdForCode(pool: Pool, code: string) {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
    [required(code, "Organization code")]
  )
  if (!result.rows[0]) throw new Error("Organization was not found.")
  return result.rows[0].id
}

export function createRecruitmentRepository(options: RepositoryPoolOptions) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    organizationIdForCode: (code: string) => organizationIdForCode(pool, code),

    async count(organizationId: string) {
      const result = await pool.query<{
        candidates: number
        interviews: number
        open_jobs: number
        posts: number
        templates: number
        vacant_posts: number
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM recruitment.candidates
              WHERE organization_id = $1 AND status = 'Active') AS candidates,
            (SELECT count(*)::int FROM recruitment.interviews
              WHERE organization_id = $1) AS interviews,
            (SELECT count(*)::int FROM recruitment.job_posts
              WHERE organization_id = $1 AND status = 'Open') AS open_jobs,
            (SELECT count(*)::int FROM recruitment.posts
              WHERE organization_id = $1) AS posts,
            (SELECT count(*)::int FROM recruitment.requirement_templates
              WHERE organization_id = $1 AND active) AS templates,
            (
              SELECT count(*)::int
              FROM (
                SELECT post.id
                FROM recruitment.posts post
                WHERE post.organization_id = $1
                  AND NOT EXISTS (
                    SELECT 1
                    FROM recruitment.combined_roles combined
                    WHERE combined.id = post.combined_role_id
                      AND combined.organization_id = $1
                      AND combined.status = 'Active'
                  )
                  AND (
                    post.status = 'Resigned'
                    OR (
                      post.status <> 'Inactive'
                      AND NULLIF(BTRIM(post.employee_name), '') IS NULL
                      AND NULLIF(BTRIM(post.employee_code), '') IS NULL
                    )
                  )
                UNION ALL
                SELECT combined.id
                FROM recruitment.combined_roles combined
                JOIN recruitment.combined_role_posts link
                  ON link.combined_role_id = combined.id
                JOIN recruitment.posts post ON post.id = link.post_id
                WHERE combined.organization_id = $1
                  AND combined.status = 'Active'
                  AND post.organization_id = $1
                GROUP BY combined.id
                HAVING count(*) FILTER (
                    WHERE post.status <> 'Inactive'
                  ) > 0
                  AND count(*) FILTER (
                    WHERE post.status <> 'Inactive'
                      AND post.status <> 'Resigned'
                      AND (
                        NULLIF(BTRIM(post.employee_name), '') IS NOT NULL
                        OR NULLIF(BTRIM(post.employee_code), '') IS NOT NULL
                      )
                  ) = 0
              ) vacancy
            ) AS vacant_posts
        `,
        [organizationId]
      )
      const row = result.rows[0]!
      return {
        candidates: row.candidates,
        interviews: row.interviews,
        openJobs: row.open_jobs,
        posts: row.posts,
        templates: row.templates,
        vacantPosts: row.vacant_posts,
      }
    },

    async listMasters(
      organizationId: string
    ): Promise<RecruitmentMasterSnapshot> {
      const [departments, designations] = await Promise.all([
        pool.query<{ code: string; id: string; name: string }>(
          `
            SELECT id, code, name FROM recruitment.departments
            WHERE organization_id = $1 AND active
            ORDER BY name
          `,
          [organizationId]
        ),
        pool.query<{ code: string; id: string; name: string }>(
          `
            SELECT id, code, name FROM recruitment.designations
            WHERE organization_id = $1 AND active
            ORDER BY name
          `,
          [organizationId]
        ),
      ])
      return {
        departments: departments.rows,
        designations: designations.rows,
      }
    },

    async listTemplates(
      organizationId: string
    ): Promise<RecruitmentTemplateRow[]> {
      const result = await pool.query<{
        department: string | null
        designation: string
        education: string | null
        experience_requirement: string | null
        gender: string | null
        id: string
        maximum_salary: string | null
        minimum_salary: string | null
        name: string
        role_responsibilities: string | null
        template_code: string
      }>(
        `
          SELECT template.id, template.template_code, template.name,
            department.name AS department, designation.name AS designation,
            template.gender, template.experience_requirement,
            template.education, template.minimum_salary,
            template.maximum_salary, template.role_responsibilities
          FROM recruitment.requirement_templates template
          LEFT JOIN recruitment.departments department
            ON department.id = template.department_id
          JOIN recruitment.designations designation
            ON designation.id = template.designation_id
          WHERE template.organization_id = $1 AND template.active
          ORDER BY template.updated_at DESC, template.template_code
        `,
        [organizationId]
      )
      return result.rows.map((row) => ({
        department: row.department,
        designation: row.designation,
        education: row.education,
        experienceRequirement: row.experience_requirement,
        gender: row.gender,
        id: row.id,
        maximumSalary:
          row.maximum_salary === null ? null : Number(row.maximum_salary),
        minimumSalary:
          row.minimum_salary === null ? null : Number(row.minimum_salary),
        name: row.name,
        roleResponsibilities: row.role_responsibilities,
        templateCode: row.template_code,
      }))
    },

    async listPosts(organizationId: string): Promise<RecruitmentPostRow[]> {
      const result = await pool.query<{
        department: string
        designation: string
        employee_code: string | null
        employee_name: string | null
        id: string
        post_code: string
        requirement_template_code: string | null
        status: string
        vacancy_code: string
        vacancy_number: string
      }>(
        `
          SELECT post.id, post.post_code, post.vacancy_code,
            post.vacancy_number, post.status, post.employee_name,
            post.employee_code, department.name AS department,
            designation.name AS designation,
            template.template_code AS requirement_template_code
          FROM recruitment.posts post
          JOIN recruitment.departments department ON department.id = post.department_id
          JOIN recruitment.designations designation ON designation.id = post.designation_id
          LEFT JOIN recruitment.requirement_templates template
            ON template.id = post.requirement_template_id
          WHERE post.organization_id = $1
          ORDER BY department.name, designation.name, post.vacancy_number
        `,
        [organizationId]
      )
      return result.rows.map((row) => ({
        department: row.department,
        designation: row.designation,
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
        id: row.id,
        postCode: row.post_code,
        requirementTemplateCode: row.requirement_template_code,
        status: deriveRecruitmentPostStatus({
          employeeCode: row.employee_code,
          employeeName: row.employee_name,
          storedStatus: row.status,
        }),
        vacancyCode: row.vacancy_code,
        vacancyNumber: row.vacancy_number,
      }))
    },

    async listCombinedRoles(
      organizationId: string
    ): Promise<RecruitmentCombinedRoleRow[]> {
      const result = await pool.query<{
        id: string
        name: string
        post_codes: string[] | null
        primary_post_code: string | null
        status: string
        vacancy_code: string | null
      }>(
        `
          SELECT combined.id, combined.name, combined.vacancy_code,
            combined.status,
            COALESCE(
              array_agg(post.post_code ORDER BY post.post_code)
                FILTER (WHERE post.id IS NOT NULL),
              '{}'
            ) AS post_codes,
            max(post.post_code) FILTER (WHERE link.is_primary)
              AS primary_post_code
          FROM recruitment.combined_roles combined
          LEFT JOIN recruitment.combined_role_posts link
            ON link.combined_role_id = combined.id
          LEFT JOIN recruitment.posts post ON post.id = link.post_id
          WHERE combined.organization_id = $1
          GROUP BY combined.id
          ORDER BY (combined.status = 'Active') DESC,
            combined.vacancy_code, combined.name
        `,
        [organizationId]
      )
      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        postCodes: row.post_codes ?? [],
        primaryPostCode: row.primary_post_code,
        status: row.status,
        vacancyCode: row.vacancy_code,
      }))
    },

    async listCandidates(
      organizationId: string
    ): Promise<RecruitmentCandidateRow[]> {
      const result = await pool.query<{
        application_count: number
        current_company: string | null
        departments: string[] | null
        email: string | null
        event_count: number
        experience: string | null
        id: string
        name: string
        phone: string
        source: string | null
        status: string
      }>(
        `
          SELECT candidate.id, candidate.name, candidate.phone, candidate.email,
            candidate.current_company, candidate.experience, candidate.source,
            candidate.status,
            COALESCE(array_agg(DISTINCT department.name)
              FILTER (WHERE department.id IS NOT NULL), '{}') AS departments,
            count(DISTINCT application.id)::int AS application_count,
            count(DISTINCT event.id)::int AS event_count
          FROM recruitment.candidates candidate
          LEFT JOIN recruitment.candidate_departments candidate_department
            ON candidate_department.candidate_id = candidate.id
          LEFT JOIN recruitment.departments department
            ON department.id = candidate_department.department_id
          LEFT JOIN recruitment.applications application
            ON application.candidate_id = candidate.id
          LEFT JOIN recruitment.candidate_events event
            ON event.candidate_id = candidate.id
          WHERE candidate.organization_id = $1
          GROUP BY candidate.id
          ORDER BY candidate.updated_at DESC, candidate.name
          LIMIT 500
        `,
        [organizationId]
      )
      return result.rows.map((row) => ({
        applicationCount: row.application_count,
        currentCompany: row.current_company,
        departments: row.departments ?? [],
        email: row.email,
        eventCount: row.event_count,
        experience: row.experience,
        id: row.id,
        name: row.name,
        phone: row.phone,
        source: row.source,
        status: row.status,
      }))
    },

    async listJobs(organizationId: string): Promise<RecruitmentJobRow[]> {
      const result = await pool.query<{
        applicant_count: number
        id: string
        job_number: string
        post_code: string | null
        post_date: string
        status: string
        target_date: string | null
        title: string
        vacancy_code: string
      }>(
        `
          SELECT job.id, job.job_number, job.vacancy_code, job.title,
            job.post_date::text, job.target_date::text, job.status,
            post.post_code, count(application.id)::int AS applicant_count
          FROM recruitment.job_posts job
          LEFT JOIN recruitment.posts post ON post.id = job.post_id
          LEFT JOIN recruitment.applications application
            ON application.job_post_id = job.id
          WHERE job.organization_id = $1
          GROUP BY job.id, post.post_code
          ORDER BY (job.status = 'Open') DESC, job.post_date DESC, job.title
        `,
        [organizationId]
      )
      return result.rows.map((row) => ({
        applicantCount: row.applicant_count,
        id: row.id,
        jobNumber: row.job_number,
        postCode: row.post_code,
        postDate: row.post_date,
        status: row.status,
        targetDate: row.target_date,
        title: row.title,
        vacancyCode: row.vacancy_code,
      }))
    },

    async listInterviews(
      organizationId: string
    ): Promise<RecruitmentInterviewRow[]> {
      const result = await pool.query<{
        application_id: string
        candidate_name: string
        interview_at: string | null
        job_title: string
        joining_date: string | null
        latest_round: string | null
        latest_status: string | null
        planned_round: string | null
        status: string
      }>(
        `
          SELECT application.id AS application_id,
            candidate.name AS candidate_name, job.title AS job_title,
            application.status, application.interview_at::text,
            application.planned_round, application.joining_date::text,
            latest.round_name AS latest_round, latest.status AS latest_status
          FROM recruitment.applications application
          JOIN recruitment.candidates candidate ON candidate.id = application.candidate_id
          JOIN recruitment.job_posts job ON job.id = application.job_post_id
          LEFT JOIN LATERAL (
            SELECT interview.round_name, interview.status
            FROM recruitment.interviews interview
            WHERE interview.application_id = application.id
            ORDER BY interview.updated_at DESC
            LIMIT 1
          ) latest ON true
          WHERE application.organization_id = $1
          ORDER BY application.interview_at NULLS LAST, application.updated_at DESC
          LIMIT 500
        `,
        [organizationId]
      )
      return result.rows.map((row) => ({
        applicationId: row.application_id,
        candidateName: row.candidate_name,
        interviewAt: row.interview_at,
        joiningDate: row.joining_date,
        jobTitle: row.job_title,
        latestRound: row.latest_round,
        latestStatus: row.latest_status,
        plannedRound: row.planned_round,
        status: row.status,
      }))
    },

    async upsertMaster(
      input: MutationContext & {
        code: string
        kind: "department" | "designation"
        name: string
      }
    ) {
      const table = input.kind === "department" ? "departments" : "designations"
      return transaction(pool, async (client) => {
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO recruitment.${table} (
              organization_id, code, name, created_by_user_id,
              updated_by_user_id, source_system, source_table, source_id
            )
            VALUES ($1, upper($2), $3, $4, $4, 'mrm-dashboard', $5, $6)
            ON CONFLICT (organization_id, lower(code)) DO UPDATE SET
              name = EXCLUDED.name,
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              updated_at = now(),
              row_version = recruitment.${table}.row_version + 1
            RETURNING id
          `,
          [
            input.organizationId,
            required(input.code, `${input.kind} code`),
            required(input.name, `${input.kind} name`),
            input.actorUserId ?? null,
            table,
            randomUUID(),
          ]
        )
        await audit(client, {
          ...input,
          eventType: `recruitment.${input.kind}.saved`,
          targetId: result.rows[0]!.id,
          targetTable: table,
        })
        return result.rows[0]!
      })
    },

    async upsertTemplate(
      input: MutationContext & {
        departmentCode: string
        designationCode: string
        education?: string | null
        experienceRequirement?: string | null
        gender?: string | null
        maximumSalary?: string | number | null
        minimumSalary?: string | number | null
        name: string
        roleResponsibilities?: string | null
        templateCode: string
      }
    ) {
      return transaction(pool, async (client) => {
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO recruitment.requirement_templates (
              organization_id, template_code, name, department_id,
              designation_id, gender, experience_requirement, education,
              minimum_salary, maximum_salary, role_responsibilities,
              created_by_user_id, updated_by_user_id, source_system,
              source_table, source_id
            )
            SELECT $1, upper($2), $3, department.id, designation.id,
              $4, $5, $6, $7, $8, $9, $10, $10, 'mrm-dashboard',
              'requirementTemplates', $11
            FROM recruitment.departments department
            JOIN recruitment.designations designation
              ON designation.organization_id = $1
             AND lower(designation.code) = lower($12)
            WHERE department.organization_id = $1
              AND lower(department.code) = lower($13)
            ON CONFLICT (organization_id, lower(template_code)) DO UPDATE SET
              name = EXCLUDED.name,
              department_id = EXCLUDED.department_id,
              designation_id = EXCLUDED.designation_id,
              gender = EXCLUDED.gender,
              experience_requirement = EXCLUDED.experience_requirement,
              education = EXCLUDED.education,
              minimum_salary = EXCLUDED.minimum_salary,
              maximum_salary = EXCLUDED.maximum_salary,
              role_responsibilities = EXCLUDED.role_responsibilities,
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              updated_at = now(),
              row_version = recruitment.requirement_templates.row_version + 1
            RETURNING id
          `,
          [
            input.organizationId,
            required(input.templateCode, "Template code"),
            required(input.name, "Template name"),
            optional(input.gender),
            optional(input.experienceRequirement),
            optional(input.education),
            money(input.minimumSalary),
            money(input.maximumSalary),
            optional(input.roleResponsibilities),
            input.actorUserId ?? null,
            randomUUID(),
            required(input.designationCode, "Designation"),
            required(input.departmentCode, "Department"),
          ]
        )
        if (!result.rows[0]) {
          throw new Error("Department or designation was not found.")
        }
        await audit(client, {
          ...input,
          eventType: "recruitment.template.saved",
          targetId: result.rows[0].id,
          targetTable: "requirement_templates",
        })
        return result.rows[0]
      })
    },

    async upsertPost(
      input: MutationContext & {
        departmentCode: string
        designationCode: string
        requirementTemplateCode?: string | null
      }
    ) {
      return transaction(pool, async (client) => {
        const departmentCode = required(input.departmentCode, "Department")
        const designationCode = required(input.designationCode, "Designation")
        await client.query(
          `
            SELECT pg_advisory_xact_lock(
              hashtextextended($1::text, 0)
            )
          `,
          [
            recruitmentAdvisoryLockKey([
              input.organizationId,
              departmentCode,
              designationCode,
            ]),
          ]
        )
        const existingPosts = await client.query<{ post_code: string }>(
          `
            SELECT post.post_code
            FROM recruitment.posts post
            JOIN recruitment.departments department
              ON department.id = post.department_id
            JOIN recruitment.designations designation
              ON designation.id = post.designation_id
            WHERE post.organization_id = $1
              AND lower(department.code) = lower($2)
              AND lower(designation.code) = lower($3)
          `,
          [input.organizationId, departmentCode, designationCode]
        )
        const identity = nextRecruitmentPostIdentity({
          departmentCode,
          designationCode,
          existingPostCodes: existingPosts.rows.map((row) => row.post_code),
        })!
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO recruitment.posts (
              organization_id, department_id, designation_id,
              requirement_template_id, vacancy_number, post_code,
              vacancy_code, created_by_user_id, updated_by_user_id,
              source_system, source_table, source_id
            )
            SELECT $1, department.id, designation.id, template.id,
              $2, upper($3), upper($4), $5, $5, 'mrm-dashboard',
              'postMasters', $6
            FROM recruitment.departments department
            JOIN recruitment.designations designation
              ON designation.organization_id = $1
             AND lower(designation.code) = lower($7)
            LEFT JOIN recruitment.requirement_templates template
              ON template.organization_id = $1
             AND lower(template.template_code) = lower($8)
            WHERE department.organization_id = $1
              AND lower(department.code) = lower($9)
            ON CONFLICT (organization_id, lower(post_code)) DO UPDATE SET
              requirement_template_id = EXCLUDED.requirement_template_id,
              vacancy_code = EXCLUDED.vacancy_code,
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              updated_at = now(),
              row_version = recruitment.posts.row_version + 1
            RETURNING id
          `,
          [
            input.organizationId,
            identity.vacancyNumber,
            identity.postCode,
            identity.vacancyCode,
            input.actorUserId ?? null,
            randomUUID(),
            designationCode,
            optional(input.requirementTemplateCode) ?? "",
            departmentCode,
          ]
        )
        if (!result.rows[0]) {
          throw new Error("Department or designation was not found.")
        }
        await audit(client, {
          ...input,
          eventType: "recruitment.post.saved",
          metadata: identity,
          targetId: result.rows[0].id,
          targetTable: "posts",
        })
        return result.rows[0]
      })
    },

    async updatePost(
      input: MutationContext & {
        postId: string
        requirementTemplateCode?: string | null
      }
    ) {
      return transaction(pool, async (client) => {
        const postId = required(input.postId, "Approved post")
        const templateCode = optional(input.requirementTemplateCode)
        const existing = await client.query<Record<string, unknown>>(
          `
            SELECT post.*
            FROM recruitment.posts post
            WHERE post.id = $1 AND post.organization_id = $2
            FOR UPDATE
          `,
          [postId, input.organizationId]
        )
        if (!existing.rows[0]) throw new Error("Approved post was not found.")

        let templateId: string | null = null
        if (templateCode) {
          const template = await client.query<{ id: string }>(
            `
              SELECT id
              FROM recruitment.requirement_templates
              WHERE organization_id = $1 AND active
                AND lower(template_code) = lower($2)
            `,
            [input.organizationId, templateCode]
          )
          if (!template.rows[0]) throw new Error("Job template was not found.")
          templateId = template.rows[0].id
        }

        const updated = await client.query<
          Record<string, unknown> & { id: string }
        >(
          `
            UPDATE recruitment.posts
            SET requirement_template_id = $1, updated_by_user_id = $2,
              updated_at = now(), row_version = row_version + 1
            WHERE id = $3 AND organization_id = $4
            RETURNING *
          `,
          [templateId, input.actorUserId ?? null, postId, input.organizationId]
        )
        await audit(client, {
          ...input,
          afterState: updated.rows[0],
          beforeState: existing.rows[0],
          eventType: "recruitment.post.updated",
          metadata: { requirementTemplateCode: templateCode },
          targetId: postId,
          targetTable: "posts",
        })
        return updated.rows[0]!
      })
    },

    async deletePost(input: MutationContext & { postId: string }) {
      return transaction(pool, async (client) => {
        const postId = required(input.postId, "Approved post")
        const existing = await client.query<
          Record<string, unknown> & {
            combined_role_links: number
            employee_code: string | null
            employee_name: string | null
            id: string
            job_post_links: number
            post_code: string
          }
        >(
          `
            SELECT post.*,
              (SELECT count(*)::int
                FROM recruitment.combined_role_posts link
                WHERE link.post_id = post.id) AS combined_role_links,
              (SELECT count(*)::int
                FROM recruitment.job_posts job
                WHERE job.post_id = post.id) AS job_post_links
            FROM recruitment.posts post
            WHERE post.id = $1 AND post.organization_id = $2
            FOR UPDATE OF post
          `,
          [postId, input.organizationId]
        )
        const post = existing.rows[0]
        if (!post) throw new Error("Approved post was not found.")
        const blocker = recruitmentPostDeletionBlocker({
          combinedRoleLinks: post.combined_role_links,
          employeeCode: post.employee_code,
          employeeName: post.employee_name,
          jobPostLinks: post.job_post_links,
        })
        if (blocker) throw new Error(blocker)

        await client.query(
          `SELECT recruitment.delete_approved_post($1, $2, $3)`,
          [input.organizationId, postId, input.actorUserId ?? null]
        )
        return { id: post.id, postCode: post.post_code }
      })
    },

    async updateCombinedRole(
      input: MutationContext & {
        combinedRoleId: string
        name?: string | null
        postIds: string[]
        primaryPostId: string
      }
    ) {
      return transaction(pool, async (client) => {
        const combinedRoleId = required(input.combinedRoleId, "Combined role")
        const postIds = [
          ...new Set(
            input.postIds.map((postId) => postId.trim()).filter(Boolean)
          ),
        ]
        if (postIds.length < 2) {
          throw new Error("Select at least two approved posts to combine.")
        }
        const primaryPostId = required(input.primaryPostId, "Primary post")
        if (!postIds.includes(primaryPostId)) {
          throw new Error("The primary post must be one of the selected posts.")
        }

        await client.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
          [recruitmentAdvisoryLockKey([input.organizationId, "combined-roles"])]
        )
        const roleResult = await client.query<
          Record<string, unknown> & {
            id: string
            name: string
            status: string
            vacancy_code: string | null
          }
        >(
          `
            SELECT * FROM recruitment.combined_roles
            WHERE id = $1 AND organization_id = $2
            FOR UPDATE
          `,
          [combinedRoleId, input.organizationId]
        )
        const role = roleResult.rows[0]
        if (!role) throw new Error("Combined role was not found.")
        if (role.status !== "Active") {
          throw new Error("Only an active combined role can be edited.")
        }
        const vacancyCode = required(role.vacancy_code, "Combined vacancy code")

        const selectedPosts = await client.query<{
          id: string
          post_code: string
          status: string
        }>(
          `
            SELECT id, post_code, status
            FROM recruitment.posts
            WHERE organization_id = $1 AND id = ANY($2::uuid[])
            ORDER BY post_code
            FOR UPDATE
          `,
          [input.organizationId, postIds]
        )
        if (selectedPosts.rows.length !== postIds.length) {
          throw new Error("One or more selected approved posts were not found.")
        }
        if (selectedPosts.rows.some((post) => post.status === "Inactive")) {
          throw new Error("Inactive approved posts cannot be combined.")
        }

        const conflictingMembership = await client.query<{ post_code: string }>(
          `
            SELECT DISTINCT post.post_code
            FROM recruitment.combined_role_posts link
            JOIN recruitment.combined_roles combined
              ON combined.id = link.combined_role_id
            JOIN recruitment.posts post ON post.id = link.post_id
            WHERE link.post_id = ANY($1::uuid[])
              AND combined.id <> $2
              AND combined.status = 'Active'
          `,
          [postIds, combinedRoleId]
        )
        if (conflictingMembership.rows[0]) {
          throw new Error(
            `${conflictingMembership.rows[0].post_code} already belongs to another active combined role.`
          )
        }

        const existingMembers = await client.query<{ post_id: string }>(
          `SELECT post_id FROM recruitment.combined_role_posts WHERE combined_role_id = $1`,
          [combinedRoleId]
        )
        const existingPostIds = new Set(
          existingMembers.rows.map((member) => member.post_id)
        )
        const changedPostIds = [
          ...postIds.filter((postId) => !existingPostIds.has(postId)),
          ...[...existingPostIds].filter((postId) => !postIds.includes(postId)),
        ]
        if (changedPostIds.length > 0) {
          const linkedJobs = await client.query<{ post_code: string }>(
            `
              SELECT DISTINCT post.post_code
              FROM recruitment.job_posts job
              JOIN recruitment.posts post ON post.id = job.post_id
              WHERE job.post_id = ANY($1::uuid[])
            `,
            [changedPostIds]
          )
          if (linkedJobs.rows[0]) {
            throw new Error(
              `Combined-role membership cannot change because ${linkedJobs.rows[0].post_code} has a linked job post.`
            )
          }
        }

        const removedPostIds = [...existingPostIds].filter(
          (postId) => !postIds.includes(postId)
        )
        if (removedPostIds.length > 0) {
          await client.query(
            `
              UPDATE recruitment.posts
              SET combined_role_id = NULL, vacancy_code = post_code,
                updated_by_user_id = $1, updated_at = now(),
                row_version = row_version + 1
              WHERE organization_id = $2
                AND combined_role_id = $3
                AND id = ANY($4::uuid[])
            `,
            [
              input.actorUserId ?? null,
              input.organizationId,
              combinedRoleId,
              removedPostIds,
            ]
          )
        }

        await client.query(
          `SELECT recruitment.clear_combined_role_members($1, $2)`,
          [input.organizationId, combinedRoleId]
        )
        await client.query(
          `
            INSERT INTO recruitment.combined_role_posts (
              combined_role_id, post_id, is_primary
            )
            SELECT $1, selected.id, selected.id = $3
            FROM unnest($2::uuid[]) AS selected(id)
          `,
          [combinedRoleId, postIds, primaryPostId]
        )
        await client.query(
          `
            UPDATE recruitment.posts
            SET combined_role_id = $1, vacancy_code = $2,
              updated_by_user_id = $3, updated_at = now(),
              row_version = row_version + 1
            WHERE organization_id = $4 AND id = ANY($5::uuid[])
          `,
          [
            combinedRoleId,
            vacancyCode,
            input.actorUserId ?? null,
            input.organizationId,
            postIds,
          ]
        )
        const updatedRole = await client.query<
          Record<string, unknown> & { id: string }
        >(
          `
            UPDATE recruitment.combined_roles
            SET name = $1, updated_by_user_id = $2, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $3 AND organization_id = $4
            RETURNING *
          `,
          [
            optional(input.name) ?? role.name,
            input.actorUserId ?? null,
            combinedRoleId,
            input.organizationId,
          ]
        )
        await audit(client, {
          ...input,
          afterState: updatedRole.rows[0],
          beforeState: role,
          eventType: "recruitment.combined_role.updated",
          metadata: {
            postCodes: selectedPosts.rows.map((post) => post.post_code),
            primaryPostCode: selectedPosts.rows.find(
              (post) => post.id === primaryPostId
            )?.post_code,
          },
          targetId: combinedRoleId,
          targetTable: "combined_roles",
        })
        return updatedRole.rows[0]!
      })
    },

    async createCombinedRole(
      input: MutationContext & {
        name?: string | null
        postIds: string[]
        primaryPostId: string
      }
    ) {
      return transaction(pool, async (client) => {
        const postIds = [
          ...new Set(
            input.postIds.map((postId) => postId.trim()).filter(Boolean)
          ),
        ]
        if (postIds.length < 2) {
          throw new Error("Select at least two approved posts to combine.")
        }
        const primaryPostId = required(input.primaryPostId, "Primary post")
        if (!postIds.includes(primaryPostId)) {
          throw new Error("The primary post must be one of the selected posts.")
        }

        await client.query(
          `
            SELECT pg_advisory_xact_lock(
              hashtextextended($1::text, 0)
            )
          `,
          [recruitmentAdvisoryLockKey([input.organizationId, "combined-roles"])]
        )
        const selectedPosts = await client.query<{
          belongs_to_active_combined_role: boolean
          id: string
          post_code: string
        }>(
          `
            SELECT post.id, post.post_code,
              EXISTS (
                SELECT 1
                FROM recruitment.combined_role_posts active_link
                JOIN recruitment.combined_roles active_combined
                  ON active_combined.id = active_link.combined_role_id
                 AND active_combined.status = 'Active'
                WHERE active_link.post_id = post.id
              ) AS belongs_to_active_combined_role
            FROM recruitment.posts post
            WHERE post.organization_id = $1
              AND post.id = ANY($2::uuid[])
              AND post.status <> 'Inactive'
            FOR UPDATE OF post
          `,
          [input.organizationId, postIds]
        )
        if (selectedPosts.rows.length !== postIds.length) {
          throw new Error("One or more selected approved posts were not found.")
        }
        if (
          selectedPosts.rows.some(
            (post) => post.belongs_to_active_combined_role
          )
        ) {
          throw new Error(
            "One or more selected posts already belong to an active combined role."
          )
        }

        const existingCodes = await client.query<{
          vacancy_code: string | null
        }>(
          `
            SELECT vacancy_code FROM recruitment.combined_roles
            WHERE organization_id = $1
          `,
          [input.organizationId]
        )
        const identity = nextRecruitmentCombinedRoleIdentity(
          existingCodes.rows.flatMap((row) =>
            row.vacancy_code ? [row.vacancy_code] : []
          )
        )
        const combinedRole = await client.query<{ id: string }>(
          `
            INSERT INTO recruitment.combined_roles (
              organization_id, name, vacancy_code, status,
              created_by_user_id, updated_by_user_id,
              source_system, source_table, source_id
            )
            VALUES ($1, $2, $3, 'Active', $4, $4,
              'mrm-dashboard', 'combined_roles', $5)
            RETURNING id
          `,
          [
            input.organizationId,
            optional(input.name) ?? identity.defaultName,
            identity.vacancyCode,
            input.actorUserId ?? null,
            randomUUID(),
          ]
        )
        const combinedRoleId = combinedRole.rows[0]!.id
        await client.query(
          `
            INSERT INTO recruitment.combined_role_posts (
              combined_role_id, post_id, is_primary
            )
            SELECT $1, selected.post_id, selected.post_id = $3::uuid
            FROM unnest($2::uuid[]) AS selected(post_id)
          `,
          [combinedRoleId, postIds, primaryPostId]
        )
        await client.query(
          `
            UPDATE recruitment.posts
            SET combined_role_id = $1, vacancy_code = $2,
              updated_by_user_id = $3, updated_at = now(),
              row_version = row_version + 1
            WHERE organization_id = $4 AND id = ANY($5::uuid[])
          `,
          [
            combinedRoleId,
            identity.vacancyCode,
            input.actorUserId ?? null,
            input.organizationId,
            postIds,
          ]
        )
        await audit(client, {
          ...input,
          eventType: "recruitment.combined_role.created",
          metadata: {
            postCodes: selectedPosts.rows.map((post) => post.post_code),
            primaryPostCode: selectedPosts.rows.find(
              (post) => post.id === primaryPostId
            )?.post_code,
            vacancyCode: identity.vacancyCode,
          },
          targetId: combinedRoleId,
          targetTable: "combined_roles",
        })
        return { id: combinedRoleId }
      })
    },

    async assignEmployee(input: EmployeeAssignmentInput) {
      return transaction(pool, async (client) => {
        const result = await assignEmployeeInTransaction(client, input)
        return result.selectedPost
      })
    },

    async bulkAssignEmployees(
      input: MutationContext & {
        assignments: Array<{
          employeeCode?: string | null
          employeeEvent: string
          employeeName?: string | null
          rowNumber: number
          targetCode: string
          targetType: "combined" | "individual"
        }>
      }
    ) {
      if (!input.assignments.length) {
        throw new Error("At least one employee assignment is required.")
      }
      return transaction(pool, async (client) => {
        const combinedCodes = input.assignments
          .filter((row) => row.targetType === "combined")
          .map((row) => row.targetCode.toLowerCase())
        const individualCodes = input.assignments
          .filter((row) => row.targetType === "individual")
          .map((row) => row.targetCode.toLowerCase())
        const combinedTargets = combinedCodes.length
          ? await client.query<{ post_id: string; target_code: string }>(
              `
                SELECT lower(combined.vacancy_code) AS target_code,
                  max(post.id::text) FILTER (WHERE link.is_primary)::uuid AS post_id
                FROM recruitment.combined_roles combined
                JOIN recruitment.combined_role_posts link
                  ON link.combined_role_id = combined.id
                JOIN recruitment.posts post ON post.id = link.post_id
                WHERE combined.organization_id = $1
                  AND combined.status = 'Active'
                  AND lower(combined.vacancy_code) = ANY($2::text[])
                  AND post.status <> 'Inactive'
                GROUP BY combined.id
              `,
              [input.organizationId, combinedCodes]
            )
          : { rows: [] }
        const individualTargets = individualCodes.length
          ? await client.query<{ post_id: string; target_code: string }>(
              `
                SELECT id AS post_id, lower(post_code) AS target_code
                FROM recruitment.posts
                WHERE organization_id = $1
                  AND status <> 'Inactive'
                  AND combined_role_id IS NULL
                  AND lower(post_code) = ANY($2::text[])
              `,
              [input.organizationId, individualCodes]
            )
          : { rows: [] }
        const combinedByCode = new Map(
          combinedTargets.rows.map((row) => [row.target_code, row.post_id])
        )
        const individualByCode = new Map(
          individualTargets.rows.map((row) => [row.target_code, row.post_id])
        )
        for (const row of input.assignments) {
          const target =
            row.targetType === "combined"
              ? combinedByCode.get(row.targetCode.toLowerCase())
              : individualByCode.get(row.targetCode.toLowerCase())
          if (!target) {
            const sheet =
              row.targetType === "combined"
                ? "Combined Jobs"
                : "Individual Posts"
            throw new Error(
              `${sheet} row ${row.rowNumber}: ${row.targetCode} is not an available ${
                row.targetType === "combined"
                  ? "combined job"
                  : "individual post"
              }.`
            )
          }
        }

        let updatedPostCount = 0
        for (const row of input.assignments) {
          const postId =
            row.targetType === "combined"
              ? combinedByCode.get(row.targetCode.toLowerCase())!
              : individualByCode.get(row.targetCode.toLowerCase())!
          const result = await assignEmployeeInTransaction(client, {
            actorUserId: input.actorUserId,
            employeeCode: row.employeeCode,
            employeeEvent: row.employeeEvent,
            employeeName: row.employeeName,
            organizationId: input.organizationId,
            postId,
          })
          updatedPostCount += result.updatedPostCount
        }
        return {
          assignmentCount: input.assignments.length,
          updatedPostCount,
        }
      })
    },

    async createJobFromPost(
      input: MutationContext & { postId: string; targetDate?: string | null }
    ) {
      return transaction(pool, async (client) => {
        const existing = await client.query(
          `
            SELECT 1 FROM recruitment.job_posts
            WHERE organization_id = $1 AND post_id = $2 AND status = 'Open'
          `,
          [input.organizationId, input.postId]
        )
        if (existing.rowCount) {
          throw new Error("This approved post already has an open job.")
        }
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO recruitment.job_posts (
              organization_id, post_id, requirement_template_id, job_number,
              vacancy_code, title, target_date, minimum_salary,
              maximum_salary, gender, education, experience_requirement,
              description, created_by_user_id, updated_by_user_id,
              source_system, source_table, source_id
            )
            SELECT post.organization_id, post.id, template.id,
              post.vacancy_code, post.vacancy_code,
              designation.name || ' / ' || department.name,
              migration.try_date($1), template.minimum_salary,
              template.maximum_salary,
              COALESCE(template.gender, post.gender),
              COALESCE(template.education, post.education),
              COALESCE(template.experience_requirement, post.experience_requirement),
              COALESCE(template.role_responsibilities, post.role_responsibilities),
              $2, $2, 'mrm-dashboard', 'jobs', $3
            FROM recruitment.posts post
            JOIN recruitment.departments department ON department.id = post.department_id
            JOIN recruitment.designations designation ON designation.id = post.designation_id
            LEFT JOIN recruitment.requirement_templates template
              ON template.id = post.requirement_template_id
            WHERE post.id = $4 AND post.organization_id = $5
              AND (
                post.status = 'Resigned'
                OR (
                  post.status <> 'Inactive'
                  AND NULLIF(BTRIM(post.employee_name), '') IS NULL
                  AND NULLIF(BTRIM(post.employee_code), '') IS NULL
                )
              )
            RETURNING id
          `,
          [
            optional(input.targetDate),
            input.actorUserId ?? null,
            randomUUID(),
            required(input.postId, "Approved post"),
            input.organizationId,
          ]
        )
        if (!result.rows[0]) throw new Error("Approved post was not found.")
        await audit(client, {
          ...input,
          eventType: "recruitment.job.created",
          targetId: result.rows[0].id,
          targetTable: "job_posts",
        })
        return result.rows[0]
      })
    },

    async upsertCandidate(
      input: MutationContext & {
        currentCompany?: string | null
        departmentCode?: string | null
        email?: string | null
        experience?: string | null
        name: string
        notes?: string | null
        phone: string
        source?: string | null
      }
    ) {
      return transaction(pool, async (client) => {
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO recruitment.candidates (
              organization_id, name, phone, email, current_company,
              experience, source, preferred_department_id,
              created_by_user_id, updated_by_user_id, source_system,
              source_table, source_id
            )
            SELECT $1, $2, $3, $4, $5, $6, $7, department.id,
              $8, $8, 'mrm-dashboard', 'candidates', $9
            FROM (SELECT 1) seed
            LEFT JOIN recruitment.departments department
              ON department.organization_id = $1
             AND lower(department.code) = lower($10)
            ON CONFLICT (organization_id, phone) DO UPDATE SET
              name = EXCLUDED.name, email = EXCLUDED.email,
              current_company = EXCLUDED.current_company,
              experience = EXCLUDED.experience, source = EXCLUDED.source,
              preferred_department_id = EXCLUDED.preferred_department_id,
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              updated_at = now(),
              row_version = recruitment.candidates.row_version + 1
            RETURNING id
          `,
          [
            input.organizationId,
            required(input.name, "Candidate name"),
            required(input.phone, "Candidate phone"),
            optional(input.email),
            optional(input.currentCompany),
            optional(input.experience),
            optional(input.source),
            input.actorUserId ?? null,
            randomUUID(),
            optional(input.departmentCode) ?? "",
          ]
        )
        const candidateId = result.rows[0]!.id
        if (optional(input.departmentCode)) {
          await client.query(
            `
              INSERT INTO recruitment.candidate_departments (
                candidate_id, department_id
              )
              SELECT $1, id FROM recruitment.departments
              WHERE organization_id = $2 AND lower(code) = lower($3)
              ON CONFLICT DO NOTHING
            `,
            [candidateId, input.organizationId, input.departmentCode]
          )
        }
        if (optional(input.notes)) {
          await client.query(
            `
              INSERT INTO recruitment.candidate_events (
                organization_id, candidate_id, event_type, title, notes,
                actor_user_id, source_system, source_table, source_id
              )
              VALUES ($1, $2, 'Profile', 'Candidate profile saved', $3, $4,
                'mrm-dashboard', 'events', $5)
            `,
            [
              input.organizationId,
              candidateId,
              optional(input.notes),
              input.actorUserId ?? null,
              randomUUID(),
            ]
          )
        }
        await audit(client, {
          ...input,
          eventType: "recruitment.candidate.saved",
          targetId: candidateId,
          targetTable: "candidates",
        })
        return { id: candidateId }
      })
    },

    async assignCandidate(
      input: MutationContext & { candidateId: string; jobId: string }
    ) {
      return transaction(pool, async (client) => {
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO recruitment.applications (
              organization_id, candidate_id, job_post_id,
              created_by_user_id, updated_by_user_id, source_system,
              source_table, source_id
            )
            SELECT $1, candidate.id, job.id, $2, $2, 'mrm-dashboard',
              'assignments', $3
            FROM recruitment.candidates candidate
            JOIN recruitment.job_posts job
              ON job.id = $4 AND job.organization_id = $1
             AND job.status = 'Open'
            WHERE candidate.id = $5 AND candidate.organization_id = $1
            ON CONFLICT (candidate_id, job_post_id) DO UPDATE SET
              updated_at = now(),
              updated_by_user_id = EXCLUDED.updated_by_user_id
            RETURNING id
          `,
          [
            input.organizationId,
            input.actorUserId ?? null,
            randomUUID(),
            required(input.jobId, "Recruitment opening"),
            required(input.candidateId, "Candidate"),
          ]
        )
        if (!result.rows[0]) {
          throw new Error("Candidate or open recruitment job was not found.")
        }
        await audit(client, {
          ...input,
          eventType: "recruitment.application.assigned",
          targetId: result.rows[0].id,
          targetTable: "applications",
        })
        return result.rows[0]
      })
    },

    async logCandidateEvent(
      input: MutationContext & {
        candidateId: string
        eventType?: string | null
        notes?: string | null
        title: string
      }
    ) {
      return transaction(pool, async (client) => {
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO recruitment.candidate_events (
              organization_id, candidate_id, event_type, title, notes,
              actor_user_id, source_system, source_table, source_id
            )
            SELECT $1, id, $2, $3, $4, $5,
              'mrm-dashboard', 'events', $6
            FROM recruitment.candidates
            WHERE id = $7 AND organization_id = $1
            RETURNING id
          `,
          [
            input.organizationId,
            optional(input.eventType) ?? "Conversation",
            required(input.title, "Conversation title"),
            optional(input.notes),
            input.actorUserId ?? null,
            randomUUID(),
            required(input.candidateId, "Candidate"),
          ]
        )
        if (!result.rows[0]) throw new Error("Candidate was not found.")
        await audit(client, {
          ...input,
          eventType: "recruitment.candidate_event.logged",
          targetId: result.rows[0].id,
          targetTable: "candidate_events",
        })
        return result.rows[0]
      })
    },

    async scheduleInterview(
      input: MutationContext & {
        applicationId: string
        interviewAt: string
        plannedRound: string
      }
    ) {
      return transaction(pool, async (client) => {
        const result = await client.query<{ id: string }>(
          `
            UPDATE recruitment.applications
            SET interview_at = $1::timestamptz, planned_round = $2,
              status = 'Interview', updated_by_user_id = $3,
              updated_at = now(), row_version = row_version + 1
            WHERE id = $4 AND organization_id = $5
            RETURNING id
          `,
          [
            required(input.interviewAt, "Interview date and time"),
            required(input.plannedRound, "Interview round"),
            input.actorUserId ?? null,
            required(input.applicationId, "Candidate application"),
            input.organizationId,
          ]
        )
        if (!result.rows[0]) {
          throw new Error("Candidate application was not found.")
        }
        await audit(client, {
          ...input,
          eventType: "recruitment.interview.scheduled",
          targetId: result.rows[0].id,
          targetTable: "applications",
        })
        return result.rows[0]
      })
    },

    async recordInterview(
      input: MutationContext & {
        applicationId: string
        comments?: string | null
        interviewerName?: string | null
        joiningDate?: string | null
        roundName: string
        score?: string | number | null
        status: "Approved" | "Hold" | "Rejected"
      }
    ) {
      return transaction(pool, async (client) => {
        if (
          input.status === "Approved" &&
          input.roundName === "Final HR Round" &&
          !optional(input.joiningDate)
        ) {
          throw new Error("Joining date is required for final approval.")
        }
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO recruitment.interviews (
              organization_id, application_id, round_name, status,
              interviewer_name, scores, comments, joining_date,
              created_by_user_id, updated_by_user_id, source_system,
              source_table, source_id
            )
            SELECT $1, application.id, $2, $3, $4,
              jsonb_build_object('overall', $5::numeric), $6,
              migration.try_date($7), $8, $8, 'mrm-dashboard',
              'interviews', $9
            FROM recruitment.applications application
            WHERE application.id = $10 AND application.organization_id = $1
            ON CONFLICT (application_id, round_name) DO UPDATE SET
              status = EXCLUDED.status,
              interviewer_name = EXCLUDED.interviewer_name,
              scores = EXCLUDED.scores, comments = EXCLUDED.comments,
              joining_date = EXCLUDED.joining_date,
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              updated_at = now(),
              row_version = recruitment.interviews.row_version + 1
            RETURNING id
          `,
          [
            input.organizationId,
            required(input.roundName, "Interview round"),
            input.status,
            optional(input.interviewerName),
            money(input.score) ?? 0,
            optional(input.comments),
            optional(input.joiningDate),
            input.actorUserId ?? null,
            randomUUID(),
            required(input.applicationId, "Candidate application"),
          ]
        )
        if (!result.rows[0]) {
          throw new Error("Candidate application was not found.")
        }
        const finalApproval =
          input.status === "Approved" && input.roundName === "Final HR Round"
        await client.query(
          `
            UPDATE recruitment.applications
            SET status = $1, joining_date = migration.try_date($2),
              updated_by_user_id = $3, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $4 AND organization_id = $5
          `,
          [
            finalApproval
              ? "Approved"
              : input.status === "Approved"
                ? "Interview"
                : input.status,
            optional(input.joiningDate),
            input.actorUserId ?? null,
            input.applicationId,
            input.organizationId,
          ]
        )
        await audit(client, {
          ...input,
          eventType: "recruitment.interview.recorded",
          targetId: result.rows[0].id,
          targetTable: "interviews",
        })
        return result.rows[0]
      })
    },
  }
}
