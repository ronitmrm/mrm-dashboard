import type { Pool, PoolClient } from "pg"

import { groupEmployeeTerms } from "./employee-terms"
import { repositoryPool, withTransaction, type RepositoryPoolOptions } from "./postgres-runtime"

export const employeePersonalFields = [
  "pfCode", "dateOfBirth", "contactNo", "gender", "emailId",
  "residenceAddress", "permanentAddress", "bloodGroup",
  "emergencyContactNumber", "emergencyContactName", "nameAsPerBankRecord",
  "bankAccountNo", "bankName", "branchName", "branchAddress", "ifscCode",
  "uanNo", "esicNo", "aadhaarCardNo",
] as const

export const employeeTermFields = [
  "shift", "salary", "salaryRateInc", "pfStatus", "esicStatus",
] as const

export type EmployeePersonalDetails = Record<(typeof employeePersonalFields)[number], string>
export type EmployeeTermDetails = Record<(typeof employeeTermFields)[number], string>

export type EmployeeDataRecord = {
  assignmentId: string
  employeeCode: string
  employeeName: string
  postCode: string
  department: string | null
  designation: string | null
  joinedOn: string | null
  endedOn: string | null
  personal: EmployeePersonalDetails
  term: EmployeeTermDetails
  personalSaved: boolean
  termSaved: boolean
}

export type EmployeeIncrement = {
  id: string
  effectiveOn: string
  incrementPercent: number
  note: string
  recordedBy: string | null
  recordedOn: string
}

type EmployeeDataSaveInput = {
  actorUserId: string | null
  organizationId: string
  assignmentId: string
  personal: EmployeePersonalDetails
  term: EmployeeTermDetails
}

function detailValues<const T extends readonly string[]>(fields: T, value: Record<string, unknown> | null): Record<T[number], string> {
  return Object.fromEntries(fields.map((field) => [field, typeof value?.[field] === "string" ? value[field] : ""])) as Record<T[number], string>
}

function cleanDetails<const T extends readonly string[]>(fields: T, value: Record<T[number], string>) {
  return Object.fromEntries(fields.map((field) => {
    const normalized = value[field as T[number]].trim()
    if (normalized.length > 1000) throw new Error(`${field} must be within 1,000 characters.`)
    return [field, normalized]
  })) as Record<T[number], string>
}

function validateDetails(personal: EmployeePersonalDetails, term: EmployeeTermDetails) {
  if (personal.dateOfBirth) {
    const date = new Date(`${personal.dateOfBirth}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(personal.dateOfBirth) ||
      Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== personal.dateOfBirth) {
      throw new Error("Enter a valid date of birth.")
    }
  }
  if (personal.emailId && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal.emailId)) {
    throw new Error("Enter a valid email address.")
  }
  if (term.salary && !/^\d+(?:\.\d{1,2})?$/.test(term.salary)) {
    throw new Error("Salary must be a non-negative amount with at most two decimal places.")
  }
}

async function termAnchor(client: Pool | PoolClient, organizationId: string, assignmentId: string) {
  const target = await client.query<{ employee_code: string | null }>(
    `SELECT employee_code FROM recruitment.employee_post_assignments
     WHERE organization_id = $1 AND id = $2`,
    [organizationId, assignmentId]
  )
  const rawCode = target.rows[0]?.employee_code
  if (!rawCode?.trim()) return null
  const history = await client.query<{
    id: string; employee_code: string; joined_on: string | null; ended_on: string | null
    term_details_saved: boolean
  }>(
    `SELECT assignment.id, assignment.employee_code, assignment.joined_on::text, assignment.ended_on::text,
       term.assignment_id IS NOT NULL AS term_details_saved
     FROM recruitment.employee_post_assignments assignment
     LEFT JOIN recruitment.employee_term_details term ON term.assignment_id = assignment.id
       AND term.organization_id = assignment.organization_id
     WHERE assignment.organization_id = $1 AND assignment.employee_code = $2`,
    [organizationId, rawCode]
  )
  return groupEmployeeTerms(history.rows.map((row) => ({
    id: row.id, employeeCode: row.employee_code,
    joinedOn: row.joined_on, endedOn: row.ended_on,
    termDetailsSaved: row.term_details_saved,
  }))).find((group) => group.assignments.some((row) => row.id === assignmentId))?.anchorId ?? null
}

async function employeeAssignment(client: Pool | PoolClient, organizationId: string, assignmentId: string) {
  const anchorId = await termAnchor(client, organizationId, assignmentId)
  if (!anchorId) return null
  const result = await client.query<{
    id: string; employee_code: string | null; employee_name: string; post_code: string
    department: string | null; designation: string | null
    joined_on: string | null; ended_on: string | null
    personal: Record<string, unknown> | null; term: Record<string, unknown> | null
    personal_saved: boolean; term_saved: boolean
  }>(
    `SELECT assignment.id, assignment.employee_code, assignment.employee_name,
       assignment.post_code, assignment.joined_on::text, assignment.ended_on::text,
       department.name AS department, designation.name AS designation,
       profile.details AS personal, term.details AS term,
       profile.employee_code IS NOT NULL AS personal_saved,
       term.assignment_id IS NOT NULL AS term_saved
     FROM recruitment.employee_post_assignments assignment
     LEFT JOIN recruitment.posts post ON post.id = assignment.post_id
     LEFT JOIN recruitment.departments department ON department.id = post.department_id
     LEFT JOIN recruitment.designations designation ON designation.id = post.designation_id
     LEFT JOIN recruitment.employee_profiles profile
       ON profile.organization_id = assignment.organization_id
       AND profile.employee_code = btrim(assignment.employee_code)
     LEFT JOIN recruitment.employee_term_details term
       ON term.organization_id = assignment.organization_id
       AND term.assignment_id = $3
     WHERE assignment.organization_id = $1 AND assignment.id = $2`,
    [organizationId, assignmentId, anchorId]
  )
  const row = result.rows[0]
  if (!row || !row.employee_code?.trim()) return null
  return {
    assignmentId: row.id,
    employeeCode: row.employee_code,
    employeeName: row.employee_name,
    postCode: row.post_code,
    department: row.department,
    designation: row.designation,
    joinedOn: row.joined_on,
    endedOn: row.ended_on,
    personal: detailValues(employeePersonalFields, row.personal),
    term: detailValues(employeeTermFields, row.term),
    personalSaved: row.personal_saved,
    termSaved: row.term_saved,
  } satisfies EmployeeDataRecord
}

export function createEmployeeDataRepository(options: RepositoryPoolOptions) {
  const { close, pool } = repositoryPool(options)
  async function saveMany(inputs: EmployeeDataSaveInput[]) {
    const cleaned = inputs.map((input) => {
      const personal = cleanDetails(employeePersonalFields, input.personal)
      const term = cleanDetails(employeeTermFields, input.term)
      validateDetails(personal, term)
      return { ...input, personal, term }
    })
    await withTransaction(pool, async (client) => {
      for (const input of cleaned) {
        const assignment = await client.query<{ employee_code: string | null }>(
          `SELECT employee_code FROM recruitment.employee_post_assignments
           WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [input.organizationId, input.assignmentId]
        )
        const employeeCode = assignment.rows[0]?.employee_code?.trim()
        if (!employeeCode) {
          throw new Error("A confirmed joined assignment with an Employee ID is required.")
        }
        const anchorId = await termAnchor(client, input.organizationId, input.assignmentId)
        if (!anchorId) throw new Error("Employee term was not found.")
        await client.query(
          `INSERT INTO recruitment.employee_profiles (organization_id, employee_code, details)
           VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (organization_id, employee_code)
           DO UPDATE SET details = EXCLUDED.details, updated_at = now()`,
          [input.organizationId, employeeCode, JSON.stringify(input.personal)]
        )
        await client.query(
          `INSERT INTO recruitment.employee_term_details (assignment_id, organization_id, details)
           VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (assignment_id)
           DO UPDATE SET details = EXCLUDED.details, updated_at = now()`,
          [anchorId, input.organizationId, JSON.stringify(input.term)]
        )
        await client.query(
          `INSERT INTO audit.events (
             organization_id, event_type, target_schema, target_table, target_id,
             actor_user_id, metadata, source_system, source_table, source_id
           ) VALUES ($1, 'recruitment.employee.data_saved', 'recruitment',
             'employee_post_assignments', $2, $3, '{}'::jsonb,
             'mrm-dashboard', 'employee_data', gen_random_uuid()::text)`,
          [input.organizationId, input.assignmentId, input.actorUserId]
        )
      }
    })
  }
  return {
    async get(organizationId: string, assignmentId: string) {
      return employeeAssignment(pool, organizationId, assignmentId)
    },
    async listDetails(organizationId: string, assignmentIds: string[]) {
      if (!assignmentIds.length) return []
      const result = await pool.query<{
        id: string
        personal: Record<string, unknown> | null
        term: Record<string, unknown> | null
      }>(
        `SELECT assignment.id, profile.details AS personal, term.details AS term
         FROM recruitment.employee_post_assignments assignment
         LEFT JOIN recruitment.employee_profiles profile
           ON profile.organization_id = assignment.organization_id
             AND profile.employee_code = btrim(assignment.employee_code)
         LEFT JOIN recruitment.employee_term_details term
           ON term.organization_id = assignment.organization_id
             AND term.assignment_id = assignment.id
         WHERE assignment.organization_id = $1 AND assignment.id = ANY($2::uuid[])`,
        [organizationId, assignmentIds]
      )
      return result.rows.map((row) => ({
        assignmentId: row.id,
        personal: detailValues(employeePersonalFields, row.personal),
        term: detailValues(employeeTermFields, row.term),
      }))
    },
    async save(input: EmployeeDataSaveInput) {
      await saveMany([input])
    },
    async listIncrements(organizationId: string, employeeCode: string) {
      const result = await pool.query<EmployeeIncrement>(
        `SELECT increment.id, increment.effective_on::text AS "effectiveOn",
           increment.increment_percent::float8 AS "incrementPercent", increment.note,
           COALESCE(users.name, users.email) AS "recordedBy",
           to_char(increment.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS "recordedOn"
         FROM recruitment.employee_increments increment
         LEFT JOIN identity.users users ON users.id = increment.created_by
         WHERE increment.organization_id = $1 AND increment.employee_code = btrim($2)
         ORDER BY increment.effective_on DESC, increment.created_at DESC`,
        [organizationId, employeeCode]
      )
      return result.rows
    },
    async addIncrement(input: {
      actorUserId: string | null; organizationId: string; assignmentId: string
      effectiveOn: string; incrementPercent: string; note: string
    }) {
      const percent = input.incrementPercent.trim()
      if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(percent) || Number(percent) > 500) {
        throw new Error("Enter the increment as a percentage between 0 and 500, with at most two decimals.")
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveOn)) throw new Error("Enter the date the increment applies from.")
      const note = input.note.trim()
      if (note.length > 1000) throw new Error("Note must be within 1,000 characters.")
      await withTransaction(pool, async (client) => {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO recruitment.employee_increments
             (organization_id, employee_code, effective_on, increment_percent, note, created_by)
           SELECT $1, btrim(employee_code), $3::date, $4::numeric, $5, $6
           FROM recruitment.employee_post_assignments
           WHERE organization_id = $1 AND id = $2 AND btrim(coalesce(employee_code, '')) <> ''
           RETURNING id`,
          [input.organizationId, input.assignmentId, input.effectiveOn, percent, note, input.actorUserId]
        )
        const id = inserted.rows[0]?.id
        if (!id) throw new Error("A joined employee with an Employee ID is required.")
        await client.query(
          `INSERT INTO audit.events (
             organization_id, event_type, target_schema, target_table, target_id,
             actor_user_id, metadata, source_system, source_table, source_id
           ) VALUES ($1, 'recruitment.employee.increment_added', 'recruitment',
             'employee_increments', $2::uuid, $3, $4::jsonb, 'mrm-dashboard', 'employee_increments', gen_random_uuid()::text)`,
          [input.organizationId, id, input.actorUserId,
            JSON.stringify({ effectiveOn: input.effectiveOn, incrementPercent: percent, note })]
        )
      })
    },
    async deleteIncrement(input: { actorUserId: string | null; organizationId: string; incrementId: string }) {
      if (!/^[0-9a-f-]{36}$/i.test(input.incrementId)) throw new Error("Increment was not found.")
      await withTransaction(pool, async (client) => {
        const deleted = await client.query(
          `DELETE FROM recruitment.employee_increments WHERE organization_id = $1 AND id = $2
           RETURNING employee_code, effective_on::text, increment_percent::text, note`,
          [input.organizationId, input.incrementId]
        )
        if (!deleted.rows[0]) throw new Error("Increment was not found.")
        await client.query(
          `INSERT INTO audit.events (
             organization_id, event_type, target_schema, target_table, target_id,
             actor_user_id, metadata, source_system, source_table, source_id
           ) VALUES ($1, 'recruitment.employee.increment_deleted', 'recruitment',
             'employee_increments', $2::uuid, $3, $4::jsonb, 'mrm-dashboard', 'employee_increments', gen_random_uuid()::text)`,
          [input.organizationId, input.incrementId, input.actorUserId, JSON.stringify(deleted.rows[0])]
        )
      })
    },
    saveMany,
    async close() {
      await close()
    },
  }
}
