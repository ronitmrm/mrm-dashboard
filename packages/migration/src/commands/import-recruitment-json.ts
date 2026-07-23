import { resolve } from "node:path"

import { Pool, type PoolClient } from "pg"

import { readMigrationPostgresEnvironment } from "../managed-environment"
import {
  readRecruitmentArchive,
  type RecruitmentSourceRow,
} from "../recruitment-json"

const sourcePath = process.env.RECRUITMENT_JSON_PATH?.trim()
if (!sourcePath) {
  throw new Error("RECRUITMENT_JSON_PATH is required.")
}
const resolvedSourcePath = resolve(sourcePath)

function text(row: RecruitmentSourceRow, key: string) {
  return String(row[key] ?? "").trim()
}

function optional(row: RecruitmentSourceRow, key: string) {
  return text(row, key) || null
}

function codes(row: RecruitmentSourceRow, key: string) {
  const value = row[key]
  if (Array.isArray(value)) {
    return value
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function positiveInteger(value: unknown, fallback = 1) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

async function sourceId(
  client: PoolClient,
  table: string,
  sourceTable: string,
  sourceId: string
) {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM recruitment.${table}
     WHERE source_system = 'hr-recruitment-json'
       AND source_table = $1 AND source_id = $2`,
    [sourceTable, sourceId]
  )
  if (!result.rows[0]) {
    throw new Error(`Imported ${sourceTable} row was not found: ${sourceId}`)
  }
  return result.rows[0].id
}

async function run() {
  const archive = await readRecruitmentArchive(resolvedSourcePath)
  const { connectionString } = readMigrationPostgresEnvironment()
  const pool = new Pool({ connectionString, max: 1 })
  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    const organization = await client.query<{ id: string }>(
      "SELECT id FROM core.organizations WHERE lower(code) = lower('MRMPL')"
    )
    const organizationId = organization.rows[0]?.id
    if (!organizationId) throw new Error("MRMPL organization was not found.")

    for (const row of archive.departments) {
      await client.query(
        `
          INSERT INTO recruitment.departments (
            organization_id, code, name, created_at, updated_at,
            source_system, source_table, source_id, source_payload
          )
          VALUES ($1, $2, $3,
            COALESCE(migration.try_timestamptz($4), now()),
            COALESCE(migration.try_timestamptz($5), now()),
            'hr-recruitment-json', 'departments', $6, $7)
          ON CONFLICT (source_system, source_table, source_id)
          DO UPDATE SET source_payload = EXCLUDED.source_payload
        `,
        [
          organizationId,
          text(row, "code").toUpperCase(),
          text(row, "name"),
          optional(row, "createdAt"),
          optional(row, "updatedAt"),
          row.id,
          row,
        ]
      )
    }

    for (const row of archive.designations) {
      await client.query(
        `
          INSERT INTO recruitment.designations (
            organization_id, code, name, created_at, updated_at,
            source_system, source_table, source_id, source_payload
          )
          VALUES ($1, $2, $3,
            COALESCE(migration.try_timestamptz($4), now()),
            COALESCE(migration.try_timestamptz($5), now()),
            'hr-recruitment-json', 'designations', $6, $7)
          ON CONFLICT (source_system, source_table, source_id)
          DO UPDATE SET source_payload = EXCLUDED.source_payload
        `,
        [
          organizationId,
          text(row, "code").toUpperCase(),
          text(row, "name"),
          optional(row, "createdAt"),
          optional(row, "updatedAt"),
          row.id,
          row,
        ]
      )
    }

    for (const row of archive.combinedRoleGroups) {
      await client.query(
        `
          INSERT INTO recruitment.combined_roles (
            organization_id, name, vacancy_code, employee_name, employee_code,
            status, created_at, updated_at, source_system, source_table,
            source_id, source_payload
          )
          VALUES ($1, $2, $3, $4, $5,
            CASE WHEN $6 = 'Inactive' THEN 'Inactive' ELSE 'Active' END,
            COALESCE(migration.try_timestamptz($7), now()),
            COALESCE(migration.try_timestamptz($8), now()),
            'hr-recruitment-json', 'combinedRoleGroups', $9, $10)
          ON CONFLICT (source_system, source_table, source_id)
          DO UPDATE SET source_payload = EXCLUDED.source_payload
        `,
        [
          organizationId,
          text(row, "groupName") || row.id,
          optional(row, "vacancyCode"),
          optional(row, "employeeName"),
          optional(row, "employeeCode"),
          text(row, "status"),
          optional(row, "createdAt"),
          optional(row, "updatedAt"),
          row.id,
          row,
        ]
      )
    }

    for (const row of archive.requirementTemplates) {
      await client.query(
        `
          INSERT INTO recruitment.requirement_templates (
            organization_id, template_code, name, combined_role_id,
            department_id, designation_id, gender, experience_requirement,
            education, minimum_salary, maximum_salary, role_responsibilities,
            created_at, updated_at, source_system, source_table, source_id,
            source_payload
          )
          SELECT $1, $2, $3, combined.id, department.id, designation.id,
            NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''),
            migration.try_numeric($7), migration.try_numeric($8),
            NULLIF($9, ''),
            COALESCE(migration.try_timestamptz($10), now()),
            COALESCE(migration.try_timestamptz($11), now()),
            'hr-recruitment-json', 'requirementTemplates', $12, $13
          FROM recruitment.designations designation
          LEFT JOIN recruitment.departments department
            ON department.organization_id = $1
           AND lower(department.code) = lower($14)
          LEFT JOIN recruitment.combined_roles combined
            ON combined.organization_id = $1
           AND combined.source_system = 'hr-recruitment-json'
           AND combined.source_id = $15
          WHERE designation.organization_id = $1
            AND lower(designation.code) = lower($16)
          ON CONFLICT (source_system, source_table, source_id)
          DO UPDATE SET source_payload = EXCLUDED.source_payload
        `,
        [
          organizationId,
          text(row, "templateCode") || row.id,
          text(row, "templateName") || row.id,
          text(row, "gender"),
          text(row, "experienceRequirement"),
          text(row, "education"),
          text(row, "minSalary"),
          text(row, "maxSalary"),
          text(row, "roleResponsibilities"),
          optional(row, "createdAt"),
          optional(row, "updatedAt"),
          row.id,
          row,
          text(row, "departmentCode"),
          text(row, "combinedRoleGroupId"),
          text(row, "designationCode"),
        ]
      )
    }

    for (const row of archive.postMasters) {
      await client.query(
        `
          INSERT INTO recruitment.posts (
            organization_id, department_id, designation_id,
            requirement_template_id, combined_role_id, vacancy_number,
            post_code, vacancy_code, gender, experience_requirement,
            education, salary_range, role_responsibilities, employee_name,
            employee_code, status, created_at, updated_at, source_system,
            source_table, source_id, source_payload
          )
          SELECT $1, department.id, designation.id, template.id, combined.id,
            $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''),
            NULLIF($8, ''), NULLIF($9, ''), NULLIF($10, ''), NULLIF($11, ''),
            CASE
              WHEN $12 = 'Occupied' THEN 'Occupied'
              WHEN $12 = 'Inactive' THEN 'Inactive'
              ELSE 'Vacant'
            END,
            COALESCE(migration.try_timestamptz($13), now()),
            COALESCE(migration.try_timestamptz($14), now()),
            'hr-recruitment-json', 'postMasters', $15, $16
          FROM recruitment.departments department
          JOIN recruitment.designations designation
            ON designation.organization_id = $1
           AND lower(designation.code) = lower($17)
          LEFT JOIN recruitment.requirement_templates template
            ON template.organization_id = $1
           AND lower(template.template_code) = lower($18)
          LEFT JOIN recruitment.combined_roles combined
            ON combined.organization_id = $1
           AND combined.source_system = 'hr-recruitment-json'
           AND combined.source_id = $19
          WHERE department.organization_id = $1
            AND lower(department.code) = lower($20)
          ON CONFLICT (source_system, source_table, source_id)
          DO UPDATE SET source_payload = EXCLUDED.source_payload
        `,
        [
          organizationId,
          text(row, "vacancyNo"),
          text(row, "postCode"),
          text(row, "vacancyCode") || text(row, "postCode"),
          text(row, "gender"),
          text(row, "experienceRequirement"),
          text(row, "education"),
          text(row, "salaryRange"),
          text(row, "roleResponsibilities"),
          text(row, "currentEmployeeName"),
          text(row, "currentEmployeeCode"),
          text(row, "status"),
          optional(row, "createdAt"),
          optional(row, "updatedAt"),
          row.id,
          row,
          text(row, "designationCode"),
          text(row, "requirementTemplateCode"),
          text(row, "combinedRoleGroupId"),
          text(row, "departmentCode"),
        ]
      )
    }

    for (const row of archive.combinedRoleGroups) {
      const combinedRoleId = await sourceId(
        client,
        "combined_roles",
        "combinedRoleGroups",
        row.id
      )
      for (const postCode of codes(row, "postCodes")) {
        await client.query(
          `
            INSERT INTO recruitment.combined_role_posts (
              combined_role_id, post_id, is_primary
            )
            SELECT $1, id, lower(post_code) = lower($2)
            FROM recruitment.posts
            WHERE organization_id = $3 AND lower(post_code) = lower($4)
            ON CONFLICT (combined_role_id, post_id) DO UPDATE SET
              is_primary = EXCLUDED.is_primary
          `,
          [
            combinedRoleId,
            text(row, "primaryPostCode"),
            organizationId,
            postCode,
          ]
        )
      }
    }

    for (const row of archive.candidates) {
      await client.query(
        `
          INSERT INTO recruitment.candidates (
            organization_id, name, phone, email, current_company, experience,
            source, preferred_department_id, resume_reference, status,
            created_at, updated_at, source_system, source_table, source_id,
            source_payload
          )
          SELECT $1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''),
            NULLIF($7, ''), department.id, NULLIF($8, ''),
            CASE WHEN $9 = 'Hired' THEN 'Hired'
                 WHEN $9 = 'Inactive' THEN 'Inactive' ELSE 'Active' END,
            COALESCE(migration.try_timestamptz($10), now()),
            COALESCE(migration.try_timestamptz($11), now()),
            'hr-recruitment-json', 'candidates', $12, $13
          FROM (SELECT 1) seed
          LEFT JOIN recruitment.departments department
            ON department.organization_id = $1
           AND lower(department.code) = lower($14)
          ON CONFLICT (source_system, source_table, source_id)
          DO UPDATE SET source_payload = EXCLUDED.source_payload
        `,
        [
          organizationId,
          text(row, "name"),
          text(row, "phone"),
          text(row, "email"),
          text(row, "currentCompany"),
          text(row, "experience"),
          text(row, "source"),
          text(row, "resumeUrl"),
          text(row, "status"),
          optional(row, "createdAt"),
          optional(row, "updatedAt"),
          row.id,
          row,
          text(row, "preferredDepartmentCode"),
        ]
      )
      const candidateId = await sourceId(
        client,
        "candidates",
        "candidates",
        row.id
      )
      for (const departmentCode of codes(row, "departmentCodes")) {
        await client.query(
          `
            INSERT INTO recruitment.candidate_departments (
              candidate_id, department_id
            )
            SELECT $1, id FROM recruitment.departments
            WHERE organization_id = $2 AND lower(code) = lower($3)
            ON CONFLICT DO NOTHING
          `,
          [candidateId, organizationId, departmentCode]
        )
      }
    }

    for (const row of archive.jobs) {
      await client.query(
        `
          INSERT INTO recruitment.job_posts (
            organization_id, post_id, requirement_template_id, job_number,
            vacancy_code, title, post_date, target_date, start_time, end_time,
            minimum_salary, maximum_salary, employee_count, gender, education,
            experience_requirement, description, status, closed_on,
            created_at, updated_at, source_system, source_table, source_id,
            source_payload
          )
          SELECT $1, post.id, template.id, $2, $3, $4,
            COALESCE(migration.try_date($5), current_date),
            migration.try_date($6), NULLIF($7, '')::time,
            NULLIF($8, '')::time, migration.try_numeric($9),
            migration.try_numeric($10), $11, NULLIF($12, ''),
            NULLIF($13, ''), NULLIF($14, ''), NULLIF($15, ''),
            CASE WHEN $16 = 'Closed' THEN 'Closed'
                 WHEN $16 = 'On Hold' THEN 'On Hold' ELSE 'Open' END,
            migration.try_date($17),
            COALESCE(migration.try_timestamptz($18), now()),
            COALESCE(migration.try_timestamptz($19), now()),
            'hr-recruitment-json', 'jobs', $20, $21
          FROM (SELECT 1) seed
          LEFT JOIN recruitment.posts post
            ON post.organization_id = $1 AND lower(post.post_code) = lower($22)
          LEFT JOIN recruitment.requirement_templates template
            ON template.organization_id = $1
           AND lower(template.template_code) = lower($23)
          ON CONFLICT (source_system, source_table, source_id)
          DO UPDATE SET source_payload = EXCLUDED.source_payload
        `,
        [
          organizationId,
          text(row, "jobNumber") || row.id,
          text(row, "vacancyCode") || text(row, "jobNumber") || row.id,
          text(row, "title") || row.id,
          text(row, "postDate"),
          text(row, "targetDate"),
          text(row, "startTime"),
          text(row, "endTime"),
          text(row, "minSalary"),
          text(row, "maxSalary"),
          positiveInteger(row.employeeCount),
          text(row, "gender"),
          text(row, "education"),
          text(row, "experienceRequirement"),
          text(row, "description"),
          text(row, "status"),
          text(row, "closureDate"),
          optional(row, "createdAt"),
          optional(row, "updatedAt"),
          row.id,
          row,
          text(row, "postCode"),
          text(row, "requirementTemplateCode"),
        ]
      )
    }

    for (const row of archive.assignments) {
      await client.query(
        `
          INSERT INTO recruitment.applications (
            organization_id, candidate_id, job_post_id, status, interview_at,
            planned_round, joining_date, created_at, updated_at, source_system,
            source_table, source_id, source_payload
          )
          SELECT $1, candidate.id, job.id,
            CASE
              WHEN $2 IN ('Interview', 'Approved', 'Rejected', 'Hold', 'Withdrawn')
              THEN $2 ELSE 'Assigned'
            END,
            migration.try_timestamptz($3), NULLIF($4, ''),
            migration.try_date($5),
            COALESCE(migration.try_timestamptz($6), now()),
            COALESCE(migration.try_timestamptz($7), now()),
            'hr-recruitment-json', 'assignments', $8, $9
          FROM recruitment.candidates candidate
          JOIN recruitment.job_posts job
            ON job.organization_id = $1
           AND job.source_system = 'hr-recruitment-json'
           AND job.source_id = $10
          WHERE candidate.organization_id = $1
            AND candidate.source_system = 'hr-recruitment-json'
            AND candidate.source_id = $11
          ON CONFLICT (source_system, source_table, source_id)
          DO UPDATE SET source_payload = EXCLUDED.source_payload
        `,
        [
          organizationId,
          text(row, "status"),
          text(row, "interviewDate"),
          text(row, "plannedRoundName"),
          text(row, "joiningDate"),
          optional(row, "createdAt"),
          optional(row, "updatedAt"),
          row.id,
          row,
          text(row, "jobId"),
          text(row, "candidateId"),
        ]
      )
    }

    for (const row of archive.events) {
      await client.query(
        `
          INSERT INTO recruitment.candidate_events (
            organization_id, candidate_id, job_post_id, application_id,
            event_type, title, notes, occurred_at, source_system, source_table,
            source_id, source_payload
          )
          SELECT $1, candidate.id, job.id, application.id, $2, $3,
            NULLIF($4, ''), COALESCE(migration.try_timestamptz($5), now()),
            'hr-recruitment-json', 'events', $6, $7
          FROM recruitment.candidates candidate
          LEFT JOIN recruitment.job_posts job
            ON job.organization_id = $1
           AND job.source_system = 'hr-recruitment-json'
           AND job.source_id = $8
          LEFT JOIN recruitment.applications application
            ON application.organization_id = $1
           AND application.source_system = 'hr-recruitment-json'
           AND application.source_id = $9
          WHERE candidate.organization_id = $1
            AND candidate.source_system = 'hr-recruitment-json'
            AND candidate.source_id = $10
          ON CONFLICT (source_system, source_table, source_id)
          DO UPDATE SET source_payload = EXCLUDED.source_payload
        `,
        [
          organizationId,
          text(row, "eventType") || "Conversation",
          text(row, "title") || text(row, "eventType") || "Conversation",
          text(row, "notes"),
          optional(row, "createdAt"),
          row.id,
          row,
          text(row, "jobId"),
          text(row, "assignmentId"),
          text(row, "candidateId"),
        ]
      )
    }

    for (const row of archive.interviews) {
      await client.query(
        `
          INSERT INTO recruitment.interviews (
            organization_id, application_id, round_name, status,
            interviewer_name, scores, comments, joining_date, created_at,
            updated_at, source_system, source_table, source_id, source_payload
          )
          SELECT $1, application.id, $2,
            CASE WHEN $3 = 'Rejected' THEN 'Rejected'
                 WHEN $3 = 'Hold' THEN 'Hold' ELSE 'Approved' END,
            NULLIF($4, ''), $5, NULLIF($6, ''), migration.try_date($7),
            COALESCE(migration.try_timestamptz($8), now()),
            COALESCE(migration.try_timestamptz($9), now()),
            'hr-recruitment-json', 'interviews', $10, $11
          FROM recruitment.applications application
          WHERE application.organization_id = $1
            AND application.source_system = 'hr-recruitment-json'
            AND application.source_id = $12
          ON CONFLICT (source_system, source_table, source_id)
          DO UPDATE SET source_payload = EXCLUDED.source_payload
        `,
        [
          organizationId,
          text(row, "roundName"),
          text(row, "interviewStatus"),
          text(row, "interviewerName"),
          row.scores ?? {},
          text(row, "comments"),
          text(row, "joiningDate"),
          optional(row, "createdAt"),
          optional(row, "updatedAt"),
          row.id,
          row,
          text(row, "assignmentId"),
        ]
      )
    }

    await client.query("COMMIT")
    process.stdout.write(
      `${JSON.stringify({
        event: "recruitment-imported",
        sourcePath: resolvedSourcePath,
        totals: Object.fromEntries(
          Object.entries(archive).map(([name, rows]) => [name, rows.length])
        ),
      })}\n`
    )
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

await run()
