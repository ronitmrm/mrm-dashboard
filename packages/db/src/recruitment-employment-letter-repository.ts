import type { PoolClient } from "pg"

import {
  prepareEmploymentLetter,
  type AppointmentLetterDetails,
  type EmploymentLetterRequest,
  type EmploymentLetterType,
  type ExperienceLetterDetails,
  type OfferLetterDetails,
  type PreparedEmploymentLetter,
} from "./recruitment-employment-letters"
import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"

export type RecruitmentEmploymentLetterRow = {
  applicationId: string | null
  department: string
  designation: string
  details: Record<string, unknown>
  employeeCode: string | null
  employeeName: string
  fileAvailable: boolean
  id: string
  issuedOn: string
  joiningDate: string
  lastWorkingDate: string | null
  letterType: EmploymentLetterType
  postCode: string | null
  postId: string | null
  referenceNumber: string
}

type Context = {
  actorUserId?: string | null
  organizationId: string
}

export type IssueEmploymentLetterInput =
  | (Context & {
      applicationId: string
      details: OfferLetterDetails
      issuedOn: string
      type: "offer"
    })
  | (Context & {
      details: AppointmentLetterDetails
      issuedOn: string
      postId: string
      type: "appointment"
    })
  | (Context & {
      details: ExperienceLetterDetails
      issuedOn: string
      postId: string
      type: "experience"
    })

export type PreparedEmploymentLetterRecord = {
  applicationId: string | null
  id: string
  letter: PreparedEmploymentLetter
  postId: string | null
}

function required(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

function ordinal(reference: string) {
  const value = Number(reference.split("-").at(-1))
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Employment Letter reference is invalid.")
  }
  return value
}

export function createRecruitmentEmploymentLetterRepository(
  options: RepositoryPoolOptions
) {
  const { close, pool } = repositoryPool(options)

  async function nextOrdinal(client: PoolClient) {
    const result = await client.query<{ value: string }>(
      "SELECT nextval('recruitment.employment_letter_reference_seq')::text AS value"
    )
    return Number(result.rows[0]!.value)
  }

  async function existingReference(client: PoolClient, sourceId: string) {
    const result = await client.query<{ reference_number: string }>(
      `SELECT reference_number FROM recruitment.employment_letters
       WHERE source_system = 'mrm-dashboard'
         AND source_table = 'employment_letters' AND source_id = $1
       FOR UPDATE`,
      [sourceId]
    )
    return result.rows[0]?.reference_number ?? null
  }

  return {
    close,

    async get(letterId: string, organizationId: string) {
      const result = await pool.query<{
        id: string
        letter_type: EmploymentLetterType
      }>(
        `SELECT id, letter_type FROM recruitment.employment_letters
         WHERE id = $1 AND organization_id = $2`,
        [required(letterId, "Employment Letter"), organizationId]
      )
      const row = result.rows[0]
      return row ? { id: row.id, letterType: row.letter_type } : null
    },

    async getPdf(letterId: string, organizationId: string) {
      const result = await pool.query<{
        file_name: string
        pdf_bytes: Buffer
      }>(
        `SELECT pdf_file_name AS file_name, pdf_bytes
         FROM recruitment.employment_letters
         WHERE id = $1 AND organization_id = $2 AND pdf_bytes IS NOT NULL`,
        [required(letterId, "Employment Letter"), organizationId]
      )
      const row = result.rows[0]
      if (!row) throw new Error("Employment Letter PDF was not found.")
      return { bytes: row.pdf_bytes, fileName: row.file_name }
    },

    async list(
      organizationId: string
    ): Promise<RecruitmentEmploymentLetterRow[]> {
      const result = await pool.query<{
        application_id: string | null
        department: string
        designation: string
        details: unknown
        employee_code: string | null
        employee_name: string
        file_available: boolean
        id: string
        issued_on: string
        joining_date: string
        last_working_date: string | null
        letter_type: EmploymentLetterType
        post_code: string | null
        post_id: string | null
        reference_number: string
      }>(
        `SELECT letter.id, letter.letter_type, letter.application_id,
           letter.post_id, letter.employee_name, letter.employee_code,
           letter.designation, letter.department, letter.joining_date::text,
           letter.last_working_date::text, letter.reference_number,
           letter.issued_on::text, letter.details, post.post_code,
           (letter.pdf_bytes IS NOT NULL) AS file_available
         FROM recruitment.employment_letters letter
         LEFT JOIN recruitment.posts post ON post.id = letter.post_id
         WHERE letter.organization_id = $1
         ORDER BY letter.issued_on DESC, letter.created_at DESC
         LIMIT 2000`,
        [organizationId]
      )
      return result.rows.map((row) => ({
        applicationId: row.application_id,
        department: row.department,
        designation: row.designation,
        details:
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, unknown>)
            : {},
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
        fileAvailable: row.file_available,
        id: row.id,
        issuedOn: row.issued_on,
        joiningDate: row.joining_date,
        lastWorkingDate: row.last_working_date,
        letterType: row.letter_type,
        postCode: row.post_code,
        postId: row.post_id,
        referenceNumber: row.reference_number,
      }))
    },

    async listForCandidate(
      organizationId: string,
      candidateId: string
    ): Promise<RecruitmentEmploymentLetterRow[]> {
      const result = await pool.query<{
        application_id: string
        department: string
        designation: string
        details: unknown
        employee_code: string | null
        employee_name: string
        file_available: boolean
        id: string
        issued_on: string
        joining_date: string
        last_working_date: string | null
        letter_type: "offer"
        post_code: string | null
        post_id: string | null
        reference_number: string
      }>(
        `SELECT letter.id, letter.letter_type, letter.application_id,
           letter.post_id, letter.employee_name, letter.employee_code,
           letter.designation, letter.department, letter.joining_date::text,
           letter.last_working_date::text, letter.reference_number,
           letter.issued_on::text, letter.details, post.post_code,
           (letter.pdf_bytes IS NOT NULL) AS file_available
         FROM recruitment.employment_letters letter
         JOIN recruitment.applications application
           ON application.id = letter.application_id
          AND application.organization_id = letter.organization_id
         LEFT JOIN recruitment.posts post ON post.id = letter.post_id
         WHERE letter.organization_id = $1
           AND application.candidate_id = $2
           AND letter.letter_type = 'offer'
         ORDER BY letter.issued_on DESC, letter.created_at DESC`,
        [organizationId, required(candidateId, "Candidate")]
      )
      return result.rows.map((row) => ({
        applicationId: row.application_id,
        department: row.department,
        designation: row.designation,
        details:
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, unknown>)
            : {},
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
        fileAvailable: row.file_available,
        id: row.id,
        issuedOn: row.issued_on,
        joiningDate: row.joining_date,
        lastWorkingDate: row.last_working_date,
        letterType: row.letter_type,
        postCode: row.post_code,
        postId: row.post_id,
        referenceNumber: row.reference_number,
      }))
    },

    async storePdf(
      input: Context & {
        bytes: Buffer
        fileName: string
        letterId: string
        sha256: string
      }
    ) {
      if (!input.bytes.byteLength)
        throw new Error("Employment Letter PDF is required.")
      if (!/^[a-zA-Z0-9._-]+$/.test(input.fileName)) {
        throw new Error("Employment Letter filename is invalid.")
      }
      if (!/^[a-f0-9]{64}$/.test(input.sha256)) {
        throw new Error("Employment Letter PDF fingerprint is invalid.")
      }
      const result = await pool.query<{ id: string }>(
        `UPDATE recruitment.employment_letters
         SET pdf_bytes = $1, pdf_file_name = $2, pdf_sha256 = $3,
           generated_at = now(), updated_by_user_id = $4,
           updated_at = now(), row_version = row_version + 1
         WHERE id = $5 AND organization_id = $6
         RETURNING id`,
        [
          input.bytes,
          input.fileName,
          input.sha256,
          input.actorUserId ?? null,
          required(input.letterId, "Employment Letter"),
          input.organizationId,
        ]
      )
      if (!result.rows[0]) throw new Error("Employment Letter was not found.")
      return { id: result.rows[0].id }
    },

    async issue(input: IssueEmploymentLetterInput) {
      return withTransaction(pool, async (client) => {
        let applicationId: string | null = null
        let postId: string | null = null
        let request: EmploymentLetterRequest
        let sourceId: string

        if (input.type === "offer") {
          const result = await client.query<{
            application_status: string
            candidate_name: string
            department: string
            designation: string
            employee_code: string | null
            joining_date: string | null
            post_id: string | null
            salary_before_probation: string | null
            willing_to_join: boolean | null
          }>(
            `SELECT application.status AS application_status,
               application.willing_to_join,
               application.joining_date::text,
               application.salary_before_probation,
               candidate.name AS candidate_name, job.post_id,
               post.employee_code,
               designation.name AS designation,
               coalesce(department.name, '') AS department
             FROM recruitment.applications application
             JOIN recruitment.candidates candidate ON candidate.id = application.candidate_id
             JOIN recruitment.job_posts job ON job.id = application.job_post_id
             LEFT JOIN recruitment.posts post ON post.id = job.post_id
             LEFT JOIN recruitment.departments department ON department.id = post.department_id
             LEFT JOIN recruitment.designations designation ON designation.id = post.designation_id
             WHERE application.id = $1 AND application.organization_id = $2
             FOR UPDATE OF application`,
            [
              required(input.applicationId, "Candidate application"),
              input.organizationId,
            ]
          )
          const row = result.rows[0]
          if (
            !row?.post_id ||
            !row.joining_date ||
            !row.salary_before_probation
          ) {
            throw new Error(
              "Completed candidate appointment details are required before issuing an Offer Letter."
            )
          }
          applicationId = input.applicationId
          postId = row.post_id
          sourceId = `${input.organizationId}:offer:${applicationId}`
          const currentReference = await existingReference(client, sourceId)
          request = {
            applicationStatus: row.application_status,
            details: input.details,
            identity: {
              department: row.department,
              designation: row.designation,
              employeeCode: row.employee_code,
              employeeName: row.candidate_name,
              joiningDate: row.joining_date,
            },
            issuedOn: input.issuedOn,
            ordinal: currentReference
              ? ordinal(currentReference)
              : await nextOrdinal(client),
            salary: Number(row.salary_before_probation),
            type: "offer",
            willingToJoin: row.willing_to_join === true,
          }
        } else {
          const result = await client.query<{
            department: string
            designation: string
            employee_code: string | null
            employee_name: string | null
            joining_date: string | null
            last_working_date: string | null
            status: string
          }>(
            `SELECT post.employee_name, post.employee_code, post.status,
               post.joining_date::text, post.last_working_date::text,
               designation.name AS designation,
               coalesce(department.name, '') AS department
             FROM recruitment.posts post
             LEFT JOIN recruitment.departments department ON department.id = post.department_id
             JOIN recruitment.designations designation ON designation.id = post.designation_id
             WHERE post.id = $1 AND post.organization_id = $2
             FOR UPDATE OF post`,
            [required(input.postId, "Approved post"), input.organizationId]
          )
          const row = result.rows[0]
          if (!row?.employee_name || !row.employee_code || !row.joining_date) {
            throw new Error(
              "A joined Employee Master record is required before issuing this letter."
            )
          }
          postId = input.postId
          sourceId = `${input.organizationId}:${input.type}:${row.employee_code.toLowerCase()}`
          const currentReference = await existingReference(client, sourceId)
          const common = {
            details: input.details,
            identity: {
              department: row.department,
              designation: row.designation,
              employeeCode: row.employee_code,
              employeeName: row.employee_name,
              joiningDate: row.joining_date,
              lastWorkingDate: row.last_working_date,
            },
            issuedOn: input.issuedOn,
            ordinal: currentReference
              ? ordinal(currentReference)
              : await nextOrdinal(client),
            postStatus: row.status,
          }
          request =
            input.type === "appointment"
              ? { ...common, details: input.details, type: "appointment" }
              : { ...common, details: input.details, type: "experience" }
        }

        const letter = prepareEmploymentLetter(request)
        const stored = await client.query<{ id: string }>(
          `INSERT INTO recruitment.employment_letters (
             organization_id, letter_type, application_id, post_id,
             employee_name, employee_code, designation, department,
             joining_date, last_working_date, reference_number, issued_on,
             details, created_by_user_id, updated_by_user_id,
             source_system, source_table, source_id, source_payload
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8,
             migration.try_date($9), migration.try_date($10), $11,
             migration.try_date($12), $13, $14, $14,
             'mrm-dashboard', 'employment_letters', $15, '{}'::jsonb
           )
           ON CONFLICT (source_system, source_table, source_id) DO UPDATE
           SET post_id = EXCLUDED.post_id,
             employee_name = EXCLUDED.employee_name,
             employee_code = EXCLUDED.employee_code,
             designation = EXCLUDED.designation,
             department = EXCLUDED.department,
             joining_date = EXCLUDED.joining_date,
             last_working_date = EXCLUDED.last_working_date,
             issued_on = EXCLUDED.issued_on,
             details = EXCLUDED.details,
             updated_by_user_id = EXCLUDED.updated_by_user_id,
             updated_at = now(), row_version = recruitment.employment_letters.row_version + 1
           WHERE recruitment.employment_letters.pdf_bytes IS NULL
           RETURNING id`,
          [
            input.organizationId,
            letter.type,
            applicationId,
            postId,
            letter.identity.employeeName,
            letter.identity.employeeCode,
            letter.identity.designation,
            letter.identity.department,
            letter.identity.joiningDate,
            letter.identity.lastWorkingDate,
            letter.reference,
            letter.issuedOn,
            JSON.stringify(letter.details),
            input.actorUserId ?? null,
            sourceId,
          ]
        )
        const storedLetter = stored.rows[0]
        if (!storedLetter) {
          throw new Error(
            "This Employment Letter has already been generated and cannot be replaced."
          )
        }
        const id = storedLetter.id
        await client.query(
          `INSERT INTO audit.events (
             organization_id, event_type, target_schema, target_table,
             target_id, actor_user_id, metadata,
             source_system, source_table, source_id
           ) VALUES ($1, $2, 'recruitment', 'employment_letters', $3, $4, $5,
             'mrm-dashboard', 'employment_letters', $6)
           ON CONFLICT (source_system, source_table, source_id) DO NOTHING`,
          [
            input.organizationId,
            `recruitment.employment_letter.${letter.type}.prepared`,
            id,
            input.actorUserId ?? null,
            JSON.stringify({ reference: letter.reference }),
            `${sourceId}:prepared`,
          ]
        )
        return {
          applicationId,
          id,
          letter,
          postId,
        } satisfies PreparedEmploymentLetterRecord
      })
    },
  }
}
