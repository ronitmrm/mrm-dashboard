import { randomUUID } from "node:crypto"

import type { Pool, PoolClient } from "pg"

import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

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
  return optional(input.employeeName) || optional(input.employeeCode)
    ? "Occupied"
    : "Vacant"
}

export function nextRecruitmentTemplateCode(templateCodes: Iterable<string>) {
  let highestSequence = 0
  for (const templateCode of templateCodes) {
    const match = /^JRT-(\d+)$/i.exec(templateCode.trim())
    if (!match?.[1]) continue
    highestSequence = Math.max(highestSequence, Number(match[1]))
  }
  return `JRT-${String(highestSequence + 1).padStart(4, "0")}`
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
    eventType: string
    metadata?: Record<string, unknown>
    targetId: string
    targetTable: string
  }
) {
  await client.query(
    `
      INSERT INTO audit.events (
        organization_id, event_type, target_schema, target_table, target_id,
        actor_user_id, metadata, source_system, source_table, source_id
      )
      VALUES ($1, $2, 'recruitment', $3, $4, $5, $6,
        'mrm-dashboard', 'recruitment_events', $7)
    `,
    [
      input.organizationId,
      input.eventType,
      input.targetTable,
      input.targetId,
      input.actorUserId ?? null,
      input.metadata ?? {},
      randomUUID(),
    ]
  )
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
            (SELECT count(*)::int FROM recruitment.posts
              WHERE organization_id = $1
                AND status <> 'Inactive'
                AND NULLIF(BTRIM(employee_name), '') IS NULL
                AND NULLIF(BTRIM(employee_code), '') IS NULL) AS vacant_posts
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
        postCode: string
        requirementTemplateCode?: string | null
        vacancyCode: string
        vacancyNumber: string
      }
    ) {
      return transaction(pool, async (client) => {
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
            required(input.vacancyNumber, "Vacancy number"),
            required(input.postCode, "Post code"),
            required(input.vacancyCode, "Vacancy code"),
            input.actorUserId ?? null,
            randomUUID(),
            required(input.designationCode, "Designation"),
            optional(input.requirementTemplateCode) ?? "",
            required(input.departmentCode, "Department"),
          ]
        )
        if (!result.rows[0]) {
          throw new Error("Department or designation was not found.")
        }
        await audit(client, {
          ...input,
          eventType: "recruitment.post.saved",
          targetId: result.rows[0].id,
          targetTable: "posts",
        })
        return result.rows[0]
      })
    },

    async assignEmployee(
      input: MutationContext & {
        employeeCode?: string | null
        employeeName?: string | null
        postId: string
      }
    ) {
      return transaction(pool, async (client) => {
        const employeeName = optional(input.employeeName)
        const employeeCode = optional(input.employeeCode)
        const status = deriveRecruitmentPostStatus({
          employeeCode,
          employeeName,
        })
        const result = await client.query<{ id: string }>(
          `
            UPDATE recruitment.posts
            SET employee_name = $1, employee_code = $2,
              status = $3,
              updated_by_user_id = $4, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $5 AND organization_id = $6
            RETURNING id
          `,
          [
            employeeName,
            employeeCode,
            status,
            input.actorUserId ?? null,
            required(input.postId, "Approved post"),
            input.organizationId,
          ]
        )
        if (!result.rows[0]) throw new Error("Approved post was not found.")
        await audit(client, {
          ...input,
          eventType: status === "Occupied"
            ? "recruitment.employee.assigned"
            : "recruitment.employee.removed",
          targetId: result.rows[0].id,
          targetTable: "posts",
        })
        return result.rows[0]
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
