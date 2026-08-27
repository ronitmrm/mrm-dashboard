import { randomUUID } from "node:crypto"

import type { Pool, PoolClient } from "pg"

import {
  repositoryPool,
  withTransaction as transaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"
import {
  nextRecruitmentCombinedRoleIdentity,
  nextRecruitmentMasterCode,
  nextRecruitmentPostIdentity,
  recruitmentAdvisoryLockKey,
} from "./recruitment-codes"
import {
  deriveCombinedPostAssignment,
  deriveRecruitmentEmployeeAssignment,
  deriveRecruitmentPostStatus,
  isActiveRecruitmentApplicationStatus,
  recruitmentPostDeletionBlocker,
} from "./recruitment-domain"
import {
  canonicalRecruitmentInterviewRound,
  nextRecruitmentInterviewRound,
  scoreRecruitmentInterview,
  type RecruitmentInterviewRoundName,
} from "./recruitment-interview-workflow"
import { properCaseUserText } from "./user-entry-text"

export {
  deriveRecruitmentEmployeeAssignment,
  deriveRecruitmentPostStatus,
  isActiveRecruitmentApplicationStatus,
  recruitmentPostDeletionBlocker,
} from "./recruitment-domain"

export async function authorizeRecruitmentCandidateArtifactTarget(
  client: PoolClient,
  input: { candidateId: string; organizationId: string }
) {
  const candidate = await client.query<{ id: string }>(
    `
      SELECT id
      FROM recruitment.candidates
      WHERE id = $1 AND organization_id = $2
      FOR UPDATE
    `,
    [input.candidateId, input.organizationId]
  )
  if (!candidate.rows[0]) throw new Error("Candidate was not found.")
}

type MutationContext = {
  actorUserId?: string | null
  organizationId: string
}

export type RecruitmentMasterSnapshot = {
  departments: Array<{ code: string; id: string; name: string }>
  designations: Array<{ code: string; id: string; name: string }>
}

export type RecruitmentTemplateRow = {
  combinedRoleId: string | null
  combinedRoleName: string | null
  department: string | null
  departmentCode: string | null
  designation: string
  designationCode: string
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
  combinedRoleId: string | null
  combinedRoleName: string | null
  combinedVacancyCode: string | null
  department: string
  departmentCode: string | null
  designation: string
  employeeCode: string | null
  employeeName: string | null
  id: string
  isPrimaryCombinedPost: boolean
  joiningConfirmationDue: boolean
  joiningDate: string | null
  lastWorkingDate: string | null
  postCode: string
  requirementTemplateCode: string | null
  status: string
  vacancyCode: string
  vacancyNumber: string
}

export type RecruitmentCandidateRow = {
  activeApplicationJobIds: string[]
  applicationCount: number
  currentCompany: string | null
  departments: string[]
  email: string | null
  eventCount: number
  experience: string | null
  id: string
  hasResume: boolean
  name: string
  phone: string
  preferredDepartmentCode: string | null
  preferredDesignation: string | null
  preferredDesignationCode: string | null
  resumeFileName: string | null
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
  candidateId: string
  candidateName: string
  interviewAt: string | null
  jobId: string
  jobNumber: string
  joiningDate: string | null
  jobTitle: string
  latestRound: string | null
  latestStatus: string | null
  nextRound: RecruitmentInterviewRoundName | null
  plannedRound: string | null
  postCode: string | null
  scoreableRound: RecruitmentInterviewRoundName | null
  status: string
}

export type RecruitmentJobApplicationRow = {
  allRoundsApproved: boolean
  candidateEmail: string | null
  candidateId: string
  candidateName: string
  candidatePhone: string
  currentCompany: string | null
  experience: string | null
  id: string
  interviewAt: string | null
  interviewCount: number
  joiningDate: string | null
  nextRound: RecruitmentInterviewRoundName | null
  plannedRound: string | null
  salaryAfterProbationMaximum: number | null
  salaryAfterProbationMinimum: number | null
  salaryBeforeProbation: number | null
  scoreableRound: RecruitmentInterviewRoundName | null
  status: string
  willingToJoin: boolean | null
}

export type RecruitmentJobInterviewRow = {
  applicationId: string
  candidateName: string
  comments: string | null
  createdAt: string
  id: string
  interviewerName: string | null
  joiningDate: string | null
  questionScores: Record<string, number>
  roundName: string
  salaryAfterProbationMaximum: number | null
  salaryAfterProbationMinimum: number | null
  salaryBeforeProbation: number | null
  scheduledAt: string | null
  score: number | null
  status: string
  updatedAt: string
  willingToJoin: boolean | null
}

export type RecruitmentInterviewRecordRow = RecruitmentJobInterviewRow & {
  jobId: string
  jobNumber: string
  jobTitle: string
}

export type RecruitmentJobWorkspace = {
  applications: RecruitmentJobApplicationRow[]
  interviews: RecruitmentJobInterviewRow[]
  job: RecruitmentJobRow
}

export type RecruitmentCandidateEventRow = {
  candidateId: string
  candidateName: string
  candidatePhone: string
  department: string | null
  eventType: string
  id: string
  jobNumber: string | null
  notes: string | null
  occurredAt: string
  title: string
}

export type RecruitmentCandidateApplicationHistoryRow = {
  applicationId: string
  interviewCount: number
  jobId: string
  jobNumber: string
  jobTitle: string
  status: string
}

export type RecruitmentCandidateWorkspace = {
  applications: RecruitmentCandidateApplicationHistoryRow[]
  candidate: RecruitmentCandidateRow
  events: RecruitmentCandidateEventRow[]
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

function requiredProperCase(value: unknown, label: string) {
  return properCaseUserText(required(value, label))
}

function optionalProperCase(value: unknown) {
  const normalized = optional(value)
  return normalized ? properCaseUserText(normalized) : null
}

function compareText(left: string, right: string) {
  return left === right ? 0 : left < right ? -1 : 1
}

function normalizedQuestionScores(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, score]) => [key, Number(score)] as const)
      .filter(([, score]) => Number.isFinite(score))
  )
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

function requiredMoney(value: unknown, label: string) {
  const parsed = money(value)
  if (parsed === null || parsed <= 0) {
    throw new Error(`${label} must be greater than zero.`)
  }
  return parsed
}

function requiredYesNo(value: unknown, label: string) {
  if (
    value === true ||
    String(value ?? "")
      .trim()
      .toLowerCase() === "yes"
  ) {
    return true
  }
  if (
    value === false ||
    String(value ?? "")
      .trim()
      .toLowerCase() === "no"
  ) {
    return false
  }
  throw new Error(`${label} is required.`)
}

type AuditInput = MutationContext & {
  afterState?: Record<string, unknown> | null
  beforeState?: Record<string, unknown> | null
  eventType: string
  metadata?: Record<string, unknown>
  reason?: string | null
  sourceId?: string
  targetId: string
  targetTable: string
}

async function auditMany(client: PoolClient, inputs: AuditInput[]) {
  if (!inputs.length) return
  const events = inputs.map((input) => ({
    actorUserId: input.actorUserId ?? null,
    afterState: input.afterState ?? null,
    beforeState: input.beforeState ?? null,
    eventType: input.eventType,
    metadata: input.metadata ?? {},
    organizationId: input.organizationId,
    reason: input.reason ?? null,
    sourceId: input.sourceId ?? randomUUID(),
    targetId: input.targetId,
    targetTable: input.targetTable,
  }))
  await client.query(
    `
      INSERT INTO audit.events (
        organization_id, event_type, target_schema, target_table, target_id,
        actor_user_id, reason, before_state, after_state, metadata,
        source_system, source_table, source_id
      )
      SELECT
        (event.value->>'organizationId')::uuid,
        event.value->>'eventType',
        'recruitment',
        event.value->>'targetTable',
        (event.value->>'targetId')::uuid,
        nullif(event.value->>'actorUserId', '')::uuid,
        event.value->>'reason',
        nullif(event.value->'beforeState', 'null'::jsonb),
        nullif(event.value->'afterState', 'null'::jsonb),
        coalesce(event.value->'metadata', '{}'::jsonb),
        'mrm-dashboard',
        'recruitment_events',
        event.value->>'sourceId'
      FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY
        AS event(value, sequence)
      ORDER BY event.sequence
    `,
    [JSON.stringify(events)]
  )
}

async function audit(client: PoolClient, input: AuditInput) {
  await auditMany(client, [input])
}

function recruitmentAssignmentAudit(
  input: AuditInput,
  commandId: string,
  commandOrdinal: number
): AuditInput {
  return {
    ...input,
    metadata: {
      ...input.metadata,
      commandId,
      commandOrdinal,
    },
    sourceId: `recruitment:${commandId}:${String(commandOrdinal).padStart(6, "0")}`,
  }
}

type CandidateAssignmentInput = MutationContext & {
  candidateIds: string[]
  jobId: string
}

type CandidateAssignmentCommandInput = CandidateAssignmentInput & {
  commandId: string
}

const recruitmentAssignmentCommandLimit = 100

function normalizedCandidateAssignmentIds(candidateIds: string[]) {
  return [
    ...new Set(candidateIds.map((candidateId) => candidateId.trim())),
  ].filter(Boolean)
}

function assertCandidateAssignmentCount(candidateIds: string[]) {
  if (!candidateIds.length) throw new Error("Select at least one candidate.")
  if (candidateIds.length > recruitmentAssignmentCommandLimit) {
    throw new Error(
      `Select no more than ${recruitmentAssignmentCommandLimit} candidates.`
    )
  }
}

async function assignCandidatesInTransaction(
  client: PoolClient,
  input: CandidateAssignmentCommandInput
) {
  const candidateIds = input.candidateIds
  const jobId = input.jobId

  const activeApplications = await client.query<{
    candidate_name: string
  }>(
    `
      SELECT candidate.name AS candidate_name
      FROM recruitment.applications application
      JOIN recruitment.candidates candidate
        ON candidate.id = application.candidate_id
      WHERE application.organization_id = $1
        AND application.job_post_id = $2
        AND application.candidate_id = ANY($3::uuid[])
        AND application.status IN ('Assigned', 'Interview', 'Hold')
      ORDER BY candidate.name
    `,
    [input.organizationId, jobId, candidateIds]
  )
  if (activeApplications.rows.length) {
    const candidateNames = activeApplications.rows
      .map((row) => row.candidate_name)
      .join(", ")
    throw new Error(
      `${candidateNames} ${activeApplications.rows.length === 1 ? "already has" : "already have"} an active application for this job. Complete or close it before assigning again.`
    )
  }

  const result = await client.query<{ candidate_id: string; id: string }>(
    `
      INSERT INTO recruitment.applications (
        organization_id, candidate_id, job_post_id, status,
        created_by_user_id, updated_by_user_id, source_system,
        source_table, source_id
      )
      SELECT $1, candidate.id, job.id, 'Assigned', $2, $2,
        'mrm-dashboard', 'assignments', $3 || ':' || candidate.id::text
      FROM recruitment.candidates candidate
      JOIN recruitment.job_posts job
        ON job.id = $4 AND job.organization_id = $1
       AND job.status = 'Open'
      WHERE candidate.id = ANY($5::uuid[])
        AND candidate.organization_id = $1
      ON CONFLICT (candidate_id, job_post_id)
        WHERE status IN ('Assigned', 'Interview', 'Hold')
        DO NOTHING
      RETURNING id, candidate_id
    `,
    [
      input.organizationId,
      input.actorUserId ?? null,
      input.commandId,
      jobId,
      candidateIds,
    ]
  )
  if (result.rows.length !== candidateIds.length) {
    throw new Error(
      "One or more selected candidates could not be assigned. Refresh the candidate list and try again."
    )
  }
  const applicationsByCandidateId = new Map(
    result.rows.map((application) => [application.candidate_id, application])
  )
  const orderedApplications = candidateIds.map((candidateId) => {
    const application = applicationsByCandidateId.get(candidateId)
    if (!application) {
      throw new Error(
        "One or more selected candidates could not be assigned. Refresh the candidate list and try again."
      )
    }
    return application
  })
  await auditMany(
    client,
    orderedApplications.map((application, selectionOrdinal) =>
      recruitmentAssignmentAudit(
        {
          ...input,
          eventType: "recruitment.application.assigned",
          metadata: {
            candidateId: application.candidate_id,
            selectionOrdinal,
          },
          targetId: application.id,
          targetTable: "applications",
        },
        input.commandId,
        selectionOrdinal
      )
    )
  )
  return orderedApplications
}

type EmployeeAssignmentInput = MutationContext & {
  appointedApplicationId?: string | null
  employeeCode?: string | null
  employeeEvent?: string | null
  employeeName?: string | null
  identityCorrection?: boolean
  joiningDate?: string | null
  lastWorkingDate?: string | null
  postId: string
}

async function assignEmployeeInTransaction(
  client: PoolClient,
  input: EmployeeAssignmentInput,
  commandId: string
) {
  const current = await client.query<{
    can_replace: boolean
    combined_role_id: string | null
    employee_code: string | null
    employee_name: string | null
    id: string
    last_working_date: string | null
    status: string
  }>(
    `
      SELECT id, employee_name, employee_code, combined_role_id,
        last_working_date::text, status,
        (status = 'Vacant' OR (status = 'Resigned'
          AND last_working_date < current_date)) AS can_replace
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
        can_replace: boolean
        employee_code: string | null
        employee_name: string | null
        id: string
        last_working_date: string | null
        status: string
      }>(
        `
          SELECT post.id, post.employee_name, post.employee_code,
            post.last_working_date::text, post.status,
            (post.status = 'Vacant' OR (post.status = 'Resigned'
              AND post.last_working_date < current_date)) AS can_replace
          FROM recruitment.combined_role_posts link
          JOIN recruitment.combined_roles combined
            ON combined.id = link.combined_role_id
          JOIN recruitment.posts post ON post.id = link.post_id
          WHERE link.combined_role_id = $1
            AND combined.organization_id = $2
            AND combined.status = 'Active'
            AND post.organization_id = $2
            AND post.status <> 'Inactive'
          ORDER BY link.is_primary DESC, post.post_code, post.id
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
  const employeeEvent = optional(input.employeeEvent) ?? "Appointed"
  const currentEmployeeName = optional(existingAssignment.employee_name)
  const currentEmployeeCode = optional(existingAssignment.employee_code)
  const requestedEmployeeName =
    optionalProperCase(input.employeeName) ?? currentEmployeeName
  const requestedEmployeeCode =
    optional(input.employeeCode) ?? currentEmployeeCode
  const normal = (value: string | null) => value?.trim().toLowerCase() ?? ""
  const changesEmployeeName =
    normal(requestedEmployeeName) !== normal(currentEmployeeName)
  const changesEmployeeCode =
    normal(requestedEmployeeCode) !== normal(currentEmployeeCode)
  const changesAssignedPerson =
    changesEmployeeName || (!currentEmployeeName && changesEmployeeCode)
  const canAssignNewPerson = existingAssignment.can_replace
  const correctsExistingIdentity =
    input.identityCorrection === true &&
    ((existingAssignment.status === "Appointed" &&
      employeeEvent === "Appointed") ||
      (existingAssignment.status === "Occupied" && employeeEvent === "Joined"))
  if (
    (employeeEvent === "Appointed" || employeeEvent === "Joined") &&
    Boolean(currentEmployeeName || currentEmployeeCode) &&
    changesAssignedPerson &&
    !canAssignNewPerson &&
    !correctsExistingIdentity
  ) {
    throw new Error(
      "This post is assigned to another employee. Mark the current employee as Removed or Resigned and vacate the post before assigning a different person."
    )
  }
  const assignment = deriveRecruitmentEmployeeAssignment({
    currentEmployeeCode,
    currentEmployeeName,
    employeeCode:
      employeeEvent === "Appointed" || employeeEvent === "Joined"
        ? input.employeeCode
        : null,
    employeeEvent,
    employeeName:
      employeeEvent === "Appointed" || employeeEvent === "Joined"
        ? optionalProperCase(input.employeeName)
        : null,
    lastWorkingDate: input.lastWorkingDate,
  })
  const targetIds = targets.rows.map((post) => post.id)
  const result = await client.query<{ id: string }>(
    `
      UPDATE recruitment.posts
      SET employee_name = $1, employee_code = $2,
        status = $3, last_working_date = migration.try_date($4),
        joining_date = CASE
          WHEN $3 = 'Appointed' THEN
            COALESCE(migration.try_date($5), joining_date)
          WHEN $3 = 'Occupied' THEN
            COALESCE(migration.try_date($5), joining_date)
          ELSE NULL
        END,
        appointed_application_id = CASE
          WHEN $3 IN ('Appointed', 'Occupied') THEN
            COALESCE($6::uuid, appointed_application_id)
          ELSE NULL
        END,
        updated_by_user_id = $7, updated_at = now(),
        row_version = row_version + 1
      WHERE id = ANY($8::uuid[]) AND organization_id = $9
      RETURNING id
    `,
    [
      assignment.employeeName,
      assignment.employeeCode,
      assignment.status,
      assignment.lastWorkingDate,
      optional(input.joiningDate),
      optional(input.appointedApplicationId),
      input.actorUserId ?? null,
      targetIds,
      input.organizationId,
    ]
  )
  if (result.rows.length !== targetIds.length) {
    throw new Error("Not every approved post in the assignment was updated.")
  }
  const updatedIds = new Set(result.rows.map((post) => post.id))
  const orderedAudits = targets.rows.map((post, commandOrdinal) => {
    if (!updatedIds.has(post.id)) {
      throw new Error("Not every approved post in the assignment was updated.")
    }
    return recruitmentAssignmentAudit(
      {
        ...input,
        eventType: `recruitment.employee.${assignment.status.toLowerCase()}`,
        metadata: {
          assignmentScope: currentPost.combined_role_id
            ? "combined-role"
            : "approved-post",
          combinedRoleId: currentPost.combined_role_id,
          appointedApplicationId: optional(input.appointedApplicationId),
          identityCorrection: correctsExistingIdentity,
          joiningDate: optional(input.joiningDate),
          postId: post.id,
          status: assignment.status,
          lastWorkingDate: assignment.lastWorkingDate,
        },
        targetId: post.id,
        targetTable: "posts",
      },
      commandId,
      commandOrdinal
    )
  })
  await auditMany(client, orderedAudits)
  if (!updatedIds.has(currentPost.id)) {
    throw new Error("Approved post was not found.")
  }
  const selectedPost = { id: currentPost.id }
  return { selectedPost, updatedPostCount: result.rows.length }
}

type CandidateAppointmentTermsInput = {
  joiningDate?: string | null
  salaryAfterProbationMaximum?: string | number | null
  salaryAfterProbationMinimum?: string | number | null
  salaryBeforeProbation?: string | number | null
  willingToJoin?: boolean | string | null
}

type CandidateAppointmentTerms = {
  joiningDate: string | null
  salaryAfterProbationMaximum: number | null
  salaryAfterProbationMinimum: number | null
  salaryBeforeProbation: number | null
  willingToJoin: boolean
}

function candidateAppointmentTerms(
  input: CandidateAppointmentTermsInput
): CandidateAppointmentTerms {
  const willingToJoin = requiredYesNo(
    input.willingToJoin,
    "Candidate willingness"
  )
  if (!willingToJoin) {
    return {
      joiningDate: null,
      salaryAfterProbationMaximum: null,
      salaryAfterProbationMinimum: null,
      salaryBeforeProbation: null,
      willingToJoin,
    }
  }
  const salaryAfterProbationMinimum = requiredMoney(
    input.salaryAfterProbationMinimum,
    "Minimum salary after probation"
  )
  const salaryAfterProbationMaximum = requiredMoney(
    input.salaryAfterProbationMaximum,
    "Maximum salary after probation"
  )
  if (salaryAfterProbationMaximum < salaryAfterProbationMinimum) {
    throw new Error(
      "Maximum salary after probation must be at least the minimum salary."
    )
  }
  return {
    joiningDate: required(input.joiningDate, "Joining date"),
    salaryAfterProbationMaximum,
    salaryAfterProbationMinimum,
    salaryBeforeProbation: requiredMoney(
      input.salaryBeforeProbation,
      "Salary before probation"
    ),
    willingToJoin,
  }
}

async function completeCandidateAppointmentInTransaction(
  client: PoolClient,
  input: MutationContext & {
    applicationId: string
    terms: CandidateAppointmentTerms
  }
) {
  const applicationResult = await client.query<{
    candidate_name: string
    id: string
    job_id: string
    post_id: string | null
    status: string
    willing_to_join: boolean | null
  }>(
    `
      SELECT application.id, application.status,
        application.willing_to_join,
        candidate.name AS candidate_name,
        job.id AS job_id, job.post_id
      FROM recruitment.applications application
      JOIN recruitment.candidates candidate
        ON candidate.id = application.candidate_id
      JOIN recruitment.job_posts job
        ON job.id = application.job_post_id
      WHERE application.id = $1
        AND application.organization_id = $2
      FOR UPDATE OF application, job
    `,
    [
      required(input.applicationId, "Candidate application"),
      input.organizationId,
    ]
  )
  const application = applicationResult.rows[0]
  if (!application) throw new Error("Candidate application was not found.")
  if (
    application.status !== "Approved" &&
    !isActiveRecruitmentApplicationStatus(application.status)
  ) {
    throw new Error("This candidate application cannot be appointed.")
  }
  if (application.willing_to_join !== null) {
    throw new Error("Appointment details are already completed.")
  }
  const interviews = await client.query<{
    round_name: string
    status: string
  }>(
    `
      SELECT round_name, status
      FROM recruitment.interviews
      WHERE application_id = $1 AND organization_id = $2
      FOR UPDATE
    `,
    [application.id, input.organizationId]
  )
  if (
    nextRecruitmentInterviewRound(
      interviews.rows.map((interview) => ({
        roundName: interview.round_name,
        status: interview.status,
      }))
    )
  ) {
    throw new Error(
      "All three interview rounds must be approved before completing appointment details."
    )
  }
  await client.query(
    `
      UPDATE recruitment.applications
      SET status = $1, joining_date = migration.try_date($2),
        willing_to_join = $3,
        salary_before_probation = $4,
        salary_after_probation_minimum = $5,
        salary_after_probation_maximum = $6,
        updated_by_user_id = $7, updated_at = now(),
        row_version = row_version + 1
      WHERE id = $8 AND organization_id = $9
    `,
    [
      input.terms.willingToJoin ? "Approved" : "Withdrawn",
      input.terms.joiningDate,
      input.terms.willingToJoin,
      input.terms.salaryBeforeProbation,
      input.terms.salaryAfterProbationMinimum,
      input.terms.salaryAfterProbationMaximum,
      input.actorUserId ?? null,
      application.id,
      input.organizationId,
    ]
  )
  if (input.terms.willingToJoin) {
    if (!application.post_id) {
      throw new Error(
        "The recruitment opening is not linked to an approved post."
      )
    }
    await assignEmployeeInTransaction(
      client,
      {
        actorUserId: input.actorUserId,
        appointedApplicationId: application.id,
        employeeEvent: "Appointed",
        employeeName: application.candidate_name,
        joiningDate: input.terms.joiningDate,
        organizationId: input.organizationId,
        postId: application.post_id,
      },
      randomUUID()
    )
    await client.query(
      `
        UPDATE recruitment.job_posts
        SET status = 'Closed', closed_on = current_date,
          updated_by_user_id = $1, updated_at = now(),
          row_version = row_version + 1
        WHERE id = $2 AND organization_id = $3
      `,
      [input.actorUserId ?? null, application.job_id, input.organizationId]
    )
  }
  await audit(client, {
    ...input,
    eventType: "recruitment.application.appointment_completed",
    metadata: {
      joiningDate: input.terms.joiningDate,
      willingToJoin: input.terms.willingToJoin,
    },
    targetId: application.id,
    targetTable: "applications",
  })
  return { id: application.id }
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
        combined_role_id: string | null
        combined_role_name: string | null
        department: string | null
        department_code: string | null
        designation: string
        designation_code: string
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
            combined.id AS combined_role_id,
            combined.name AS combined_role_name,
            department.name AS department, department.code AS department_code,
            designation.name AS designation,
            designation.code AS designation_code,
            template.gender, template.experience_requirement,
            template.education, template.minimum_salary,
            template.maximum_salary, template.role_responsibilities
          FROM recruitment.requirement_templates template
          LEFT JOIN recruitment.departments department
            ON department.id = template.department_id
          LEFT JOIN recruitment.combined_roles combined
            ON combined.id = template.combined_role_id
          JOIN recruitment.designations designation
            ON designation.id = template.designation_id
          WHERE template.organization_id = $1 AND template.active
          ORDER BY template.updated_at DESC, template.template_code
        `,
        [organizationId]
      )
      return result.rows.map((row) => ({
        combinedRoleId: row.combined_role_id,
        combinedRoleName: row.combined_role_name,
        department: row.department,
        departmentCode: row.department_code,
        designation: row.designation,
        designationCode: row.designation_code,
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
        combined_role_id: string | null
        combined_role_name: string | null
        combined_vacancy_code: string | null
        department: string
        department_code: string | null
        designation: string
        employee_code: string | null
        employee_name: string | null
        current_date: string
        id: string
        is_primary_combined_post: boolean
        joining_date: string | null
        last_working_date: string | null
        post_code: string
        requirement_template_code: string | null
        status: string
        vacancy_code: string
        vacancy_number: string
      }>(
        `
          SELECT post.id, post.post_code, post.vacancy_code,
            post.vacancy_number, post.status, current_date::text,
            CASE WHEN post.status = 'Resigned'
                AND post.last_working_date < current_date
              THEN NULL ELSE post.employee_name END AS employee_name,
            CASE WHEN post.status = 'Resigned'
                AND post.last_working_date < current_date
              THEN NULL ELSE post.employee_code END AS employee_code,
            post.joining_date::text, post.last_working_date::text,
            combined.id AS combined_role_id,
            combined.name AS combined_role_name,
            combined.vacancy_code AS combined_vacancy_code,
            COALESCE(combined_link.is_primary, false)
              AS is_primary_combined_post,
            COALESCE(department.name, '') AS department,
            department.code AS department_code,
            designation.name AS designation,
            template.template_code AS requirement_template_code
          FROM recruitment.posts post
          LEFT JOIN recruitment.departments department
            ON department.id = post.department_id
          JOIN recruitment.designations designation ON designation.id = post.designation_id
          LEFT JOIN recruitment.requirement_templates template
            ON template.id = post.requirement_template_id
          LEFT JOIN recruitment.combined_roles combined
            ON combined.id = post.combined_role_id
           AND combined.status = 'Active'
          LEFT JOIN recruitment.combined_role_posts combined_link
            ON combined_link.combined_role_id = combined.id
           AND combined_link.post_id = post.id
          WHERE post.organization_id = $1
          ORDER BY COALESCE(department.name, ''), designation.name,
            post.vacancy_number
        `,
        [organizationId]
      )
      return result.rows.map((row) => ({
        combinedRoleId: row.combined_role_id,
        combinedRoleName: row.combined_role_name,
        combinedVacancyCode: row.combined_vacancy_code,
        department: row.department,
        departmentCode: row.department_code,
        designation: row.designation,
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
        id: row.id,
        isPrimaryCombinedPost: row.is_primary_combined_post,
        joiningConfirmationDue:
          row.status === "Appointed" &&
          Boolean(row.joining_date) &&
          row.joining_date! <= row.current_date,
        joiningDate: row.joining_date,
        lastWorkingDate: row.last_working_date,
        postCode: row.post_code,
        requirementTemplateCode: row.requirement_template_code,
        status: deriveRecruitmentPostStatus({
          employeeCode: row.employee_code,
          employeeName: row.employee_name,
          currentDate: row.current_date,
          joiningDate: row.joining_date,
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
        active_application_job_ids: string[] | null
        application_count: number
        current_company: string | null
        departments: string[] | null
        email: string | null
        event_count: number
        experience: string | null
        has_resume: boolean
        id: string
        name: string
        phone: string
        preferred_department_code: string | null
        preferred_designation: string | null
        preferred_designation_code: string | null
        resume_file_name: string | null
        source: string | null
        status: string
      }>(
        `
          SELECT candidate.id, candidate.name, candidate.phone, candidate.email,
            candidate.current_company, candidate.experience, candidate.source,
            candidate.status, resume.file_name AS resume_file_name,
            preferred_department.code AS preferred_department_code,
            preferred_designation.name AS preferred_designation,
            preferred_designation.code AS preferred_designation_code,
            (resume.id IS NOT NULL) AS has_resume,
            COALESCE(array_agg(DISTINCT department.name)
              FILTER (WHERE department.id IS NOT NULL), '{}') AS departments,
            COALESCE(array_agg(DISTINCT application.job_post_id)
              FILTER (WHERE application.status IN ('Assigned', 'Interview', 'Hold')),
              ARRAY[]::uuid[]) AS active_application_job_ids,
            count(DISTINCT application.id)::int AS application_count,
            count(DISTINCT event.id)::int AS event_count
          FROM recruitment.candidates candidate
          LEFT JOIN recruitment.candidate_departments candidate_department
            ON candidate_department.candidate_id = candidate.id
          LEFT JOIN recruitment.departments department
            ON department.id = candidate_department.department_id
          LEFT JOIN recruitment.departments preferred_department
            ON preferred_department.id = candidate.preferred_department_id
          LEFT JOIN recruitment.designations preferred_designation
            ON preferred_designation.id = candidate.preferred_designation_id
          LEFT JOIN recruitment.applications application
            ON application.candidate_id = candidate.id
          LEFT JOIN recruitment.candidate_events event
            ON event.candidate_id = candidate.id
          LEFT JOIN LATERAL (
            SELECT file.id, file.file_name
            FROM core.file_links file_link
            JOIN core.files file ON file.id = file_link.file_id
            WHERE file_link.organization_id = candidate.organization_id
              AND file_link.target_schema = 'recruitment'
              AND file_link.target_table = 'candidates'
              AND file_link.target_id = candidate.id
              AND file_link.purpose = 'resume'
              AND file_link.is_current
            ORDER BY file.created_at DESC, file.id DESC
            LIMIT 1
          ) resume ON true
          WHERE candidate.organization_id = $1
          GROUP BY candidate.id, resume.id, resume.file_name,
            preferred_department.code, preferred_designation.name,
            preferred_designation.code
          ORDER BY candidate.updated_at DESC, candidate.name
          LIMIT 500
        `,
        [organizationId]
      )
      return result.rows.map((row) => ({
        activeApplicationJobIds: row.active_application_job_ids ?? [],
        applicationCount: row.application_count,
        currentCompany: row.current_company,
        departments: row.departments ?? [],
        email: row.email,
        eventCount: row.event_count,
        experience: row.experience,
        hasResume: row.has_resume,
        id: row.id,
        name: row.name,
        phone: row.phone,
        preferredDepartmentCode: row.preferred_department_code,
        preferredDesignation: row.preferred_designation,
        preferredDesignationCode: row.preferred_designation_code,
        resumeFileName: row.resume_file_name,
        source: row.source,
        status: row.status,
      }))
    },

    async listCandidateEvents(
      organizationId: string,
      candidateId?: string
    ): Promise<RecruitmentCandidateEventRow[]> {
      const result = await pool.query<{
        candidate_id: string
        candidate_name: string
        candidate_phone: string
        department: string | null
        event_type: string
        id: string
        job_number: string | null
        notes: string | null
        occurred_at: string
        title: string
      }>(
        `
          SELECT event.id, event.candidate_id,
            candidate.name AS candidate_name,
            candidate.phone AS candidate_phone,
            department.name AS department,
            event.event_type, event.title, event.notes,
            event.occurred_at::text, job.job_number
          FROM recruitment.candidate_events event
          JOIN recruitment.candidates candidate
            ON candidate.id = event.candidate_id
          LEFT JOIN recruitment.departments department
            ON department.id = candidate.preferred_department_id
          LEFT JOIN recruitment.job_posts job ON job.id = event.job_post_id
          WHERE event.organization_id = $1
            AND ($2::uuid IS NULL OR event.candidate_id = $2::uuid)
          ORDER BY event.occurred_at DESC, event.id DESC
          LIMIT 1000
        `,
        [organizationId, candidateId ?? null]
      )
      return result.rows.map((row) => ({
        candidateId: row.candidate_id,
        candidateName: row.candidate_name,
        candidatePhone: row.candidate_phone,
        department: row.department,
        eventType: row.event_type,
        id: row.id,
        jobNumber: row.job_number,
        notes: row.notes,
        occurredAt: row.occurred_at,
        title: row.title,
      }))
    },

    async getCandidateWorkspace(
      organizationId: string,
      candidateId: string
    ): Promise<RecruitmentCandidateWorkspace | null> {
      const [candidates, events, applications] = await Promise.all([
        this.listCandidates(organizationId),
        this.listCandidateEvents(organizationId, candidateId),
        pool.query<{
          application_id: string
          interview_count: number
          job_id: string
          job_number: string
          job_title: string
          status: string
        }>(
          `
            SELECT application.id AS application_id, job.id AS job_id,
              job.job_number, job.title AS job_title, application.status,
              count(interview.id)::int AS interview_count
            FROM recruitment.applications application
            JOIN recruitment.job_posts job ON job.id = application.job_post_id
            LEFT JOIN recruitment.interviews interview
              ON interview.application_id = application.id
            WHERE application.organization_id = $1
              AND application.candidate_id = $2
            GROUP BY application.id, job.id
            ORDER BY application.updated_at DESC
          `,
          [organizationId, required(candidateId, "Candidate")]
        ),
      ])
      const candidate = candidates.find((row) => row.id === candidateId)
      if (!candidate) return null
      return {
        applications: applications.rows.map((row) => ({
          applicationId: row.application_id,
          interviewCount: row.interview_count,
          jobId: row.job_id,
          jobNumber: row.job_number,
          jobTitle: row.job_title,
          status: row.status,
        })),
        candidate,
        events,
      }
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

    async getJobWorkspace(
      organizationId: string,
      jobId: string
    ): Promise<RecruitmentJobWorkspace | null> {
      const [jobResult, applicationResult, interviewResult] = await Promise.all(
        [
          pool.query<{
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
              WHERE job.organization_id = $1 AND job.id = $2
              GROUP BY job.id, post.post_code
            `,
            [organizationId, jobId]
          ),
          pool.query<{
            candidate_email: string | null
            candidate_id: string
            candidate_name: string
            candidate_phone: string
            current_company: string | null
            experience: string | null
            id: string
            interview_at: string | null
            interview_count: number
            joining_date: string | null
            planned_round: string | null
            salary_after_probation_maximum: string | null
            salary_after_probation_minimum: string | null
            salary_before_probation: string | null
            status: string
            willing_to_join: boolean | null
          }>(
            `
              SELECT application.id, application.candidate_id,
                candidate.name AS candidate_name,
                candidate.phone AS candidate_phone,
                candidate.email AS candidate_email,
                candidate.current_company, candidate.experience,
                application.status, application.interview_at::text,
                application.planned_round, application.joining_date::text,
                application.willing_to_join,
                application.salary_before_probation,
                application.salary_after_probation_minimum,
                application.salary_after_probation_maximum,
                count(interview.id)::int AS interview_count
              FROM recruitment.applications application
              JOIN recruitment.candidates candidate
                ON candidate.id = application.candidate_id
              LEFT JOIN recruitment.interviews interview
                ON interview.application_id = application.id
              WHERE application.organization_id = $1
                AND application.job_post_id = $2
              GROUP BY application.id, candidate.id
              ORDER BY application.updated_at DESC, candidate.name
              LIMIT 500
            `,
            [organizationId, jobId]
          ),
          pool.query<{
            application_id: string
            candidate_name: string
            comments: string | null
            created_at: string
            id: string
            interviewer_name: string | null
            joining_date: string | null
            question_scores: unknown
            round_name: string
            salary_after_probation_maximum: string | null
            salary_after_probation_minimum: string | null
            salary_before_probation: string | null
            scheduled_at: string | null
            score: string | null
            status: string
            updated_at: string
            willing_to_join: boolean | null
          }>(
            `
              SELECT interview.id, interview.application_id,
                candidate.name AS candidate_name, interview.round_name,
                interview.status, interview.scheduled_at::text,
                interview.interviewer_name,
                interview.scores ->> 'overall' AS score,
                interview.scores -> 'questions' AS question_scores,
                interview.comments, interview.joining_date::text,
                application.willing_to_join,
                application.salary_before_probation,
                application.salary_after_probation_minimum,
                application.salary_after_probation_maximum,
                interview.created_at::text, interview.updated_at::text
              FROM recruitment.interviews interview
              JOIN recruitment.applications application
                ON application.id = interview.application_id
              JOIN recruitment.candidates candidate
                ON candidate.id = application.candidate_id
              WHERE interview.organization_id = $1
                AND application.job_post_id = $2
              ORDER BY interview.scheduled_at DESC NULLS LAST,
                interview.updated_at DESC, candidate.name
              LIMIT 1000
            `,
            [organizationId, jobId]
          ),
        ]
      )

      const job = jobResult.rows[0]
      if (!job) return null
      const interviewProgress = new Map<
        string,
        Array<{ roundName: string; status: string }>
      >()
      for (const interview of interviewResult.rows) {
        const rows = interviewProgress.get(interview.application_id) ?? []
        rows.push({ roundName: interview.round_name, status: interview.status })
        interviewProgress.set(interview.application_id, rows)
      }
      return {
        applications: applicationResult.rows.map((row) => {
          const history = interviewProgress.get(row.id) ?? []
          const requiredRound = nextRecruitmentInterviewRound(history)
          const allRoundsApproved = requiredRound === null
          const nextRound = isActiveRecruitmentApplicationStatus(row.status)
            ? (requiredRound?.name ?? null)
            : null
          return {
            allRoundsApproved,
            candidateEmail: row.candidate_email,
            candidateId: row.candidate_id,
            candidateName: row.candidate_name,
            candidatePhone: row.candidate_phone,
            currentCompany: row.current_company,
            experience: row.experience,
            id: row.id,
            interviewAt: row.interview_at,
            interviewCount: row.interview_count,
            joiningDate: row.joining_date,
            nextRound,
            plannedRound: row.planned_round,
            salaryAfterProbationMaximum:
              row.salary_after_probation_maximum === null
                ? null
                : Number(row.salary_after_probation_maximum),
            salaryAfterProbationMinimum:
              row.salary_after_probation_minimum === null
                ? null
                : Number(row.salary_after_probation_minimum),
            salaryBeforeProbation:
              row.salary_before_probation === null
                ? null
                : Number(row.salary_before_probation),
            scoreableRound:
              nextRound &&
              history.some(
                (interview) =>
                  canonicalRecruitmentInterviewRound(interview.roundName) ===
                    nextRound && interview.status === "Scheduled"
              )
                ? nextRound
                : null,
            status: row.status,
            willingToJoin: row.willing_to_join,
          }
        }),
        interviews: interviewResult.rows.map((row) => ({
          applicationId: row.application_id,
          candidateName: row.candidate_name,
          comments: row.comments,
          createdAt: row.created_at,
          id: row.id,
          interviewerName: row.interviewer_name,
          joiningDate: row.joining_date,
          questionScores: normalizedQuestionScores(row.question_scores),
          roundName: row.round_name,
          salaryAfterProbationMaximum:
            row.salary_after_probation_maximum === null
              ? null
              : Number(row.salary_after_probation_maximum),
          salaryAfterProbationMinimum:
            row.salary_after_probation_minimum === null
              ? null
              : Number(row.salary_after_probation_minimum),
          salaryBeforeProbation:
            row.salary_before_probation === null
              ? null
              : Number(row.salary_before_probation),
          scheduledAt: row.scheduled_at,
          score: row.score === null ? null : Number(row.score),
          status: row.status,
          updatedAt: row.updated_at,
          willingToJoin: row.willing_to_join,
        })),
        job: {
          applicantCount: job.applicant_count,
          id: job.id,
          jobNumber: job.job_number,
          postCode: job.post_code,
          postDate: job.post_date,
          status: job.status,
          targetDate: job.target_date,
          title: job.title,
          vacancyCode: job.vacancy_code,
        },
      }
    },

    async listInterviews(
      organizationId: string
    ): Promise<RecruitmentInterviewRow[]> {
      const result = await pool.query<{
        application_id: string
        approved_rounds: string[]
        candidate_id: string
        candidate_name: string
        interview_at: string | null
        job_id: string
        job_number: string
        job_title: string
        joining_date: string | null
        latest_round: string | null
        latest_status: string | null
        planned_round: string | null
        post_code: string | null
        scheduled_rounds: string[]
        status: string
      }>(
        `
          SELECT application.id AS application_id,
            candidate.id AS candidate_id, candidate.name AS candidate_name,
            job.title AS job_title,
            job.id AS job_id, job.job_number, post.post_code,
            application.status, application.interview_at::text,
            application.planned_round, application.joining_date::text,
            latest.round_name AS latest_round, latest.status AS latest_status,
            progress.approved_rounds, progress.scheduled_rounds
          FROM recruitment.applications application
          JOIN recruitment.candidates candidate ON candidate.id = application.candidate_id
          JOIN recruitment.job_posts job ON job.id = application.job_post_id
          LEFT JOIN recruitment.posts post ON post.id = job.post_id
          LEFT JOIN LATERAL (
            SELECT interview.round_name, interview.status
            FROM recruitment.interviews interview
            WHERE interview.application_id = application.id
            ORDER BY interview.updated_at DESC
            LIMIT 1
          ) latest ON true
          LEFT JOIN LATERAL (
            SELECT coalesce(
              array_agg(interview.round_name)
                FILTER (WHERE interview.status = 'Approved'),
              ARRAY[]::text[]
            ) AS approved_rounds,
            coalesce(
              array_agg(interview.round_name)
                FILTER (WHERE interview.status = 'Scheduled'
                  AND interview.scheduled_at IS NOT NULL),
              ARRAY[]::text[]
            ) AS scheduled_rounds
            FROM recruitment.interviews interview
            WHERE interview.application_id = application.id
          ) progress ON true
          WHERE application.organization_id = $1
          ORDER BY application.interview_at NULLS LAST, application.updated_at DESC
          LIMIT 500
        `,
        [organizationId]
      )
      return result.rows.map((row) => {
        const nextRound = isActiveRecruitmentApplicationStatus(row.status)
          ? (nextRecruitmentInterviewRound(
              (row.approved_rounds ?? []).map((roundName) => ({
                roundName,
                status: "Approved",
              }))
            )?.name ?? null)
          : null
        return {
          applicationId: row.application_id,
          candidateId: row.candidate_id,
          candidateName: row.candidate_name,
          interviewAt: row.interview_at,
          jobId: row.job_id,
          jobNumber: row.job_number,
          joiningDate: row.joining_date,
          jobTitle: row.job_title,
          latestRound: row.latest_round,
          latestStatus: row.latest_status,
          nextRound,
          plannedRound: row.planned_round,
          postCode: row.post_code,
          scoreableRound:
            nextRound &&
            (row.scheduled_rounds ?? []).some(
              (roundName) =>
                canonicalRecruitmentInterviewRound(roundName) === nextRound
            )
              ? nextRound
              : null,
          status: row.status,
        }
      })
    },

    async listInterviewRecords(
      organizationId: string
    ): Promise<RecruitmentInterviewRecordRow[]> {
      const result = await pool.query<{
        application_id: string
        candidate_name: string
        comments: string | null
        created_at: string
        id: string
        interviewer_name: string | null
        job_id: string
        job_number: string
        job_title: string
        joining_date: string | null
        question_scores: unknown
        round_name: string
        salary_after_probation_maximum: string | null
        salary_after_probation_minimum: string | null
        salary_before_probation: string | null
        scheduled_at: string | null
        score: string | null
        status: string
        updated_at: string
        willing_to_join: boolean | null
      }>(
        `
          SELECT interview.id, interview.application_id,
            candidate.name AS candidate_name, job.id AS job_id,
            job.job_number, job.title AS job_title, interview.round_name,
            interview.status, interview.scheduled_at::text,
            interview.interviewer_name,
            interview.scores ->> 'overall' AS score,
            interview.scores -> 'questions' AS question_scores,
            interview.comments, interview.joining_date::text,
            application.willing_to_join,
            application.salary_before_probation,
            application.salary_after_probation_minimum,
            application.salary_after_probation_maximum,
            interview.created_at::text, interview.updated_at::text
          FROM recruitment.interviews interview
          JOIN recruitment.applications application
            ON application.id = interview.application_id
          JOIN recruitment.candidates candidate
            ON candidate.id = application.candidate_id
          JOIN recruitment.job_posts job
            ON job.id = application.job_post_id
          WHERE interview.organization_id = $1
          ORDER BY interview.scheduled_at DESC NULLS LAST,
            interview.updated_at DESC, candidate.name
          LIMIT 2000
        `,
        [organizationId]
      )
      return result.rows.map((row) => ({
        applicationId: row.application_id,
        candidateName: row.candidate_name,
        comments: row.comments,
        createdAt: row.created_at,
        id: row.id,
        interviewerName: row.interviewer_name,
        jobId: row.job_id,
        jobNumber: row.job_number,
        jobTitle: row.job_title,
        joiningDate: row.joining_date,
        questionScores: normalizedQuestionScores(row.question_scores),
        roundName: row.round_name,
        salaryAfterProbationMaximum:
          row.salary_after_probation_maximum === null
            ? null
            : Number(row.salary_after_probation_maximum),
        salaryAfterProbationMinimum:
          row.salary_after_probation_minimum === null
            ? null
            : Number(row.salary_after_probation_minimum),
        salaryBeforeProbation:
          row.salary_before_probation === null
            ? null
            : Number(row.salary_before_probation),
        scheduledAt: row.scheduled_at,
        score: row.score === null ? null : Number(row.score),
        status: row.status,
        updatedAt: row.updated_at,
        willingToJoin: row.willing_to_join,
      }))
    },

    async upsertMaster(
      input: MutationContext & {
        kind: "department" | "designation"
        name: string
      }
    ) {
      const table = input.kind === "department" ? "departments" : "designations"
      return transaction(pool, async (client) => {
        const name = requiredProperCase(input.name, `${input.kind} name`)
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [`${input.organizationId}:${table}:master`]
        )
        const duplicate = await client.query<{ code: string; name: string }>(
          `
            SELECT code, name FROM recruitment.${table}
            WHERE organization_id = $1
              AND lower(btrim(name)) = lower(btrim($2))
            LIMIT 1
          `,
          [input.organizationId, name]
        )
        if (duplicate.rows[0]) {
          const label =
            input.kind === "department" ? "Department" : "Designation"
          throw new Error(
            `${label} name "${name}" is already used by ${duplicate.rows[0].code} - ${duplicate.rows[0].name}.`
          )
        }
        const existingCodes = await client.query<{ code: string }>(
          `
            SELECT code FROM recruitment.${table}
            WHERE organization_id = $1
          `,
          [input.organizationId]
        )
        const code = required(
          nextRecruitmentMasterCode(
            name,
            existingCodes.rows.map((row) => row.code)
          ),
          `${input.kind} code`
        )
        const result = await client.query<{ code: string; id: string }>(
          `
            INSERT INTO recruitment.${table} (
              organization_id, code, name, created_by_user_id,
              updated_by_user_id, source_system, source_table, source_id
            )
            VALUES ($1, upper($2), $3, $4, $4, 'mrm-dashboard', $5, $6)
            RETURNING id, code
          `,
          [
            input.organizationId,
            code,
            name,
            input.actorUserId ?? null,
            table,
            randomUUID(),
          ]
        )
        await audit(client, {
          ...input,
          afterState: { code, name },
          eventType: `recruitment.${input.kind}.saved`,
          targetId: result.rows[0]!.id,
          targetTable: table,
        })
        return result.rows[0]!
      })
    },

    async renameDepartmentMaster(
      input: MutationContext & {
        departmentId: string
        name: string
        referenceMode: "clear" | "propagate"
      }
    ) {
      return transaction(pool, async (client) => {
        const departmentId = required(input.departmentId, "Department")
        const name = requiredProperCase(input.name, "Department name")
        const result = await client.query<{
          cleared_candidate_count: number
          cleared_post_count: number
          cleared_template_count: number
          id: string
          previous_name: string
          updated_job_count: number
        }>(
          `
            SELECT *
            FROM recruitment.rename_department_master($1, $2, $3, $4, $5)
          `,
          [
            input.organizationId,
            departmentId,
            name,
            input.referenceMode === "clear",
            input.actorUserId ?? null,
          ]
        )
        const saved = result.rows[0]
        if (!saved) throw new Error("Department was not found.")
        const outcome = {
          clearedCandidateCount: Number(saved.cleared_candidate_count),
          clearedPostCount: Number(saved.cleared_post_count),
          clearedTemplateCount: Number(saved.cleared_template_count),
          id: saved.id,
          updatedJobCount: Number(saved.updated_job_count),
        }
        await audit(client, {
          ...input,
          afterState: { name },
          beforeState: { name: saved.previous_name },
          eventType: "recruitment.department.renamed",
          metadata: { ...outcome, referenceMode: input.referenceMode },
          targetId: saved.id,
          targetTable: "departments",
        })
        return outcome
      })
    },

    async renameDesignationMaster(
      input: MutationContext & {
        designationId: string
        name: string
      }
    ) {
      return transaction(pool, async (client) => {
        const designationId = required(input.designationId, "Designation")
        const name = requiredProperCase(input.name, "Designation name")
        const result = await client.query<{
          id: string
          previous_name: string
        }>(
          `UPDATE recruitment.designations
           SET name = $1, updated_by_user_id = $2, updated_at = now()
           WHERE id = $3 AND organization_id = $4
           RETURNING id, name AS previous_name`,
          [name, input.actorUserId ?? null, designationId, input.organizationId]
        )
        const saved = result.rows[0]
        if (!saved) throw new Error("Designation was not found.")
        await audit(client, {
          ...input,
          afterState: { name },
          eventType: "recruitment.designation.renamed",
          targetId: saved.id,
          targetTable: "designations",
        })
        return { id: saved.id }
      })
    },

    async upsertTemplate(
      input: MutationContext & {
        combinedRoleId?: string | null
        departmentCode?: string | null
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
        const departmentCode = optional(input.departmentCode)
        const combinedRoleId = optional(input.combinedRoleId)
        if ((departmentCode ? 1 : 0) + (combinedRoleId ? 1 : 0) !== 1) {
          throw new Error(
            "Select either one department or one combined job for the template."
          )
        }
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO recruitment.requirement_templates (
              organization_id, template_code, name, department_id,
              combined_role_id, designation_id, gender,
              experience_requirement, education,
              minimum_salary, maximum_salary, role_responsibilities,
              created_by_user_id, updated_by_user_id, source_system,
              source_table, source_id
            )
            SELECT $1, upper($2), $3, department.id, combined.id,
              designation.id, $4, $5, $6, $7, $8, $9, $10, $10,
              'mrm-dashboard', 'requirementTemplates', $11
            FROM recruitment.designations designation
            LEFT JOIN recruitment.departments department
              ON department.organization_id = $1
             AND lower(department.code) = lower($13)
            LEFT JOIN recruitment.combined_roles combined
              ON combined.organization_id = $1
             AND combined.id = nullif($14, '')::uuid
             AND combined.status = 'Active'
            WHERE designation.organization_id = $1
              AND lower(designation.code) = lower($12)
              AND (($13 <> '' AND department.id IS NOT NULL AND combined.id IS NULL)
                OR ($14 <> '' AND combined.id IS NOT NULL AND department.id IS NULL))
            ON CONFLICT (organization_id, lower(template_code)) DO UPDATE SET
              name = EXCLUDED.name,
              department_id = EXCLUDED.department_id,
              combined_role_id = EXCLUDED.combined_role_id,
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
            requiredProperCase(input.name, "Template name"),
            optional(input.gender),
            optional(input.experienceRequirement),
            optional(input.education),
            money(input.minimumSalary),
            money(input.maximumSalary),
            optional(input.roleResponsibilities),
            input.actorUserId ?? null,
            randomUUID(),
            required(input.designationCode, "Designation"),
            departmentCode ?? "",
            combinedRoleId ?? "",
          ]
        )
        if (!result.rows[0]) {
          throw new Error(
            "Department, combined job, or designation was not found."
          )
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
              department_id = EXCLUDED.department_id,
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
        requirementTemplateCode?: string | null
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
        const templateCode = optional(input.requirementTemplateCode)
        let templateId: string | null = null
        if (templateCode) {
          const template = await client.query<{ id: string }>(
            `
              SELECT id FROM recruitment.requirement_templates
              WHERE organization_id = $1 AND active
                AND lower(template_code) = lower($2)
            `,
            [input.organizationId, templateCode]
          )
          if (!template.rows[0]) throw new Error("Job template was not found.")
          templateId = template.rows[0].id
        }

        const selectedPosts = await client.query<{
          appointedApplicationId: string | null
          employeeCode: string | null
          employeeName: string | null
          id: string
          joiningDate: string | null
          lastWorkingDate: string | null
          post_code: string
          status: string
        }>(
          `
            SELECT id, post_code, status,
              appointed_application_id::text AS "appointedApplicationId",
              employee_code AS "employeeCode",
              employee_name AS "employeeName",
              joining_date::text AS "joiningDate",
              last_working_date::text AS "lastWorkingDate"
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
        const combinedAssignment = deriveCombinedPostAssignment(
          selectedPosts.rows
        )

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
              requirement_template_id = $3,
              employee_name = CASE WHEN $4::boolean THEN $5 ELSE employee_name END,
              employee_code = CASE WHEN $4::boolean THEN $6 ELSE employee_code END,
              status = CASE WHEN $4::boolean THEN $7 ELSE status END,
              joining_date = CASE
                WHEN $4::boolean THEN migration.try_date($8)
                ELSE joining_date
              END,
              last_working_date = CASE
                WHEN $4::boolean THEN migration.try_date($9)
                ELSE last_working_date
              END,
              appointed_application_id = CASE
                WHEN $4::boolean THEN nullif($10, '')::uuid
                ELSE appointed_application_id
              END,
              updated_by_user_id = $11,
              updated_at = now(),
              row_version = row_version + 1
            WHERE organization_id = $12 AND id = ANY($13::uuid[])
          `,
          [
            combinedRoleId,
            vacancyCode,
            templateId,
            Boolean(combinedAssignment),
            combinedAssignment?.employeeName ?? null,
            combinedAssignment?.employeeCode ?? null,
            combinedAssignment?.status ?? null,
            combinedAssignment?.joiningDate ?? null,
            combinedAssignment?.lastWorkingDate ?? null,
            combinedAssignment?.appointedApplicationId ?? null,
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
            optionalProperCase(input.name) ?? role.name,
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
            requirementTemplateCode: templateCode,
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
          appointedApplicationId: string | null
          employeeCode: string | null
          employeeName: string | null
          id: string
          joiningDate: string | null
          lastWorkingDate: string | null
          post_code: string
          status: string
        }>(
          `
            SELECT post.id, post.post_code, post.status,
              post.appointed_application_id::text AS "appointedApplicationId",
              post.employee_code AS "employeeCode",
              post.employee_name AS "employeeName",
              post.joining_date::text AS "joiningDate",
              post.last_working_date::text AS "lastWorkingDate",
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

        const combinedAssignment = deriveCombinedPostAssignment(
          selectedPosts.rows
        )
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
            optionalProperCase(input.name) ?? identity.defaultName,
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
              employee_name = CASE WHEN $3::boolean THEN $4 ELSE employee_name END,
              employee_code = CASE WHEN $3::boolean THEN $5 ELSE employee_code END,
              status = CASE WHEN $3::boolean THEN $6 ELSE status END,
              joining_date = CASE
                WHEN $3::boolean THEN migration.try_date($7)
                ELSE joining_date
              END,
              last_working_date = CASE
                WHEN $3::boolean THEN migration.try_date($8)
                ELSE last_working_date
              END,
              appointed_application_id = CASE
                WHEN $3::boolean THEN nullif($9, '')::uuid
                ELSE appointed_application_id
              END,
              updated_by_user_id = $10, updated_at = now(),
              row_version = row_version + 1
            WHERE organization_id = $11 AND id = ANY($12::uuid[])
          `,
          [
            combinedRoleId,
            identity.vacancyCode,
            Boolean(combinedAssignment),
            combinedAssignment?.employeeName ?? null,
            combinedAssignment?.employeeCode ?? null,
            combinedAssignment?.status ?? null,
            combinedAssignment?.joiningDate ?? null,
            combinedAssignment?.lastWorkingDate ?? null,
            combinedAssignment?.appointedApplicationId ?? null,
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
      const commandId = randomUUID()
      return transaction(pool, async (client) => {
        const result = await assignEmployeeInTransaction(
          client,
          input,
          commandId
        )
        return result.selectedPost
      })
    },

    async bulkAssignEmployees(
      input: MutationContext & {
        assignments: Array<{
          employeeCode?: string | null
          employeeEvent: string
          employeeName?: string | null
          lastWorkingDate?: string | null
          rowNumber: number
          targetCode: string
          targetType: "combined" | "individual"
        }>
        requireVacantTargets?: boolean
      }
    ) {
      if (!input.assignments.length) {
        throw new Error("At least one employee assignment is required.")
      }
      if (input.assignments.length > recruitmentAssignmentCommandLimit) {
        throw new Error(
          `At most ${recruitmentAssignmentCommandLimit} employee assignments are allowed.`
        )
      }
      const orderedAssignments = input.assignments
        .map((assignment, inputOrdinal) => ({
          ...assignment,
          inputOrdinal,
        }))
        .sort(
          (left, right) =>
            left.rowNumber - right.rowNumber ||
            (left.targetType === right.targetType
              ? left.inputOrdinal - right.inputOrdinal
              : left.targetType === "combined"
                ? -1
                : 1)
        )
      const seenWorkbookRows = new Set<string>()
      for (const assignment of orderedAssignments) {
        const rowKey = `${assignment.targetType}:${assignment.rowNumber}`
        if (seenWorkbookRows.has(rowKey)) {
          const sheet =
            assignment.targetType === "combined"
              ? "Combined Jobs"
              : "Individual Posts"
          throw new Error(
            `${sheet} row ${assignment.rowNumber} appears more than once.`
          )
        }
        seenWorkbookRows.add(rowKey)
      }
      const commandId = randomUUID()
      return transaction(pool, async (client) => {
        type TargetPost = {
          combined_role_id: string | null
          employee_code: string | null
          employee_name: string | null
          is_primary: boolean
          post_code: string
          post_id: string
          post_status: string
          target_code: string
          target_type: "combined" | "individual"
        }
        const combinedCodes = [
          ...new Set(
            orderedAssignments
              .filter((row) => row.targetType === "combined")
              .map((row) => row.targetCode.toLowerCase())
          ),
        ]
        const individualCodes = [
          ...new Set(
            orderedAssignments
              .filter((row) => row.targetType === "individual")
              .map((row) => row.targetCode.toLowerCase())
          ),
        ]
        const combinedTargets = combinedCodes.length
          ? await client.query<TargetPost>(
              `
                  SELECT lower(combined.vacancy_code) AS target_code,
                  'combined'::text AS target_type,
                  combined.id AS combined_role_id, post.id AS post_id,
                  link.is_primary, post.post_code, post.status AS post_status,
                  post.employee_name, post.employee_code
                FROM recruitment.combined_roles combined
                JOIN recruitment.combined_role_posts link
                  ON link.combined_role_id = combined.id
                JOIN recruitment.posts post ON post.id = link.post_id
                WHERE combined.organization_id = $1
                  AND combined.status = 'Active'
                  AND lower(combined.vacancy_code) = ANY($2::text[])
                  AND post.status <> 'Inactive'
                  AND EXISTS (
                    SELECT 1
                    FROM recruitment.combined_role_posts primary_link
                    JOIN recruitment.posts primary_post
                      ON primary_post.id = primary_link.post_id
                    WHERE primary_link.combined_role_id = combined.id
                      AND primary_link.is_primary
                      AND primary_post.organization_id = $1
                      AND primary_post.status <> 'Inactive'
                  )
                ORDER BY lower(combined.vacancy_code),
                  link.is_primary DESC, post.post_code, post.id
                FOR UPDATE OF post
              `,
              [input.organizationId, combinedCodes]
            )
          : { rows: [] }
        const individualTargets = individualCodes.length
          ? await client.query<TargetPost>(
              `
                SELECT post.id AS post_id,
                  lower(post.post_code) AS target_code,
                  'individual'::text AS target_type,
                  post.combined_role_id, false AS is_primary, post.post_code,
                  post.status AS post_status,
                  post.employee_name, post.employee_code
                FROM recruitment.posts post
                WHERE post.organization_id = $1
                  AND post.status <> 'Inactive'
                  AND post.combined_role_id IS NULL
                  AND lower(post.post_code) = ANY($2::text[])
                ORDER BY lower(post.post_code), post.id
                FOR UPDATE OF post
              `,
              [input.organizationId, individualCodes]
            )
          : { rows: [] }
        const targetsByCode = new Map<string, TargetPost[]>()
        for (const target of [
          ...combinedTargets.rows,
          ...individualTargets.rows,
        ]) {
          const key = `${target.target_type}:${target.target_code}`
          const targets = targetsByCode.get(key) ?? []
          targets.push(target)
          targetsByCode.set(key, targets)
        }
        for (const targets of targetsByCode.values()) {
          targets.sort(
            (left, right) =>
              Number(right.is_primary) - Number(left.is_primary) ||
              compareText(left.post_code, right.post_code) ||
              compareText(left.post_id, right.post_id)
          )
        }
        for (const row of orderedAssignments) {
          const key = `${row.targetType}:${row.targetCode.toLowerCase()}`
          if (!targetsByCode.get(key)?.length) {
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

        if (input.requireVacantTargets) {
          for (const row of orderedAssignments) {
            const key = `${row.targetType}:${row.targetCode.toLowerCase()}`
            const occupied = targetsByCode
              .get(key)!
              .some(
                (target) =>
                  target.post_status !== "Vacant" ||
                  optional(target.employee_name) ||
                  optional(target.employee_code)
              )
            if (occupied) {
              const sheet =
                row.targetType === "combined"
                  ? "Combined Jobs"
                  : "Individual Posts"
              throw new Error(
                `${sheet} row ${row.rowNumber}: ${row.targetCode} is occupied. Vacate it manually before bulk assignment.`
              )
            }
          }
        }

        const currentByPostId = new Map(
          [...combinedTargets.rows, ...individualTargets.rows].map((post) => [
            post.post_id,
            {
              employeeCode: post.employee_code,
              employeeName: post.employee_name,
            },
          ])
        )
        const updatesByPostId = new Map<
          string,
          {
            actorUserId: string | null
            employeeCode: string | null
            employeeName: string | null
            id: string
            lastWorkingDate: string | null
            status: string
            updateCount: number
          }
        >()
        const auditEvents: AuditInput[] = []
        let updatedPostCount = 0
        for (const row of orderedAssignments) {
          const key = `${row.targetType}:${row.targetCode.toLowerCase()}`
          const targets = targetsByCode.get(key)!
          const current =
            targets
              .map((target) => currentByPostId.get(target.post_id)!)
              .find(
                (post) =>
                  optional(post.employeeName) || optional(post.employeeCode)
              ) ?? currentByPostId.get(targets[0]!.post_id)!
          const assignment = deriveRecruitmentEmployeeAssignment({
            currentEmployeeCode: current.employeeCode,
            currentEmployeeName: current.employeeName,
            employeeCode: row.employeeCode,
            employeeEvent: row.employeeEvent,
            employeeName: optionalProperCase(row.employeeName),
            lastWorkingDate: row.lastWorkingDate,
          })
          for (const target of targets) {
            currentByPostId.set(target.post_id, {
              employeeCode: assignment.employeeCode,
              employeeName: assignment.employeeName,
            })
            const previousUpdate = updatesByPostId.get(target.post_id)
            updatesByPostId.set(target.post_id, {
              actorUserId: input.actorUserId ?? null,
              employeeCode: assignment.employeeCode,
              employeeName: assignment.employeeName,
              id: target.post_id,
              lastWorkingDate: assignment.lastWorkingDate,
              status: assignment.status,
              updateCount: (previousUpdate?.updateCount ?? 0) + 1,
            })
            const commandOrdinal = auditEvents.length
            auditEvents.push(
              recruitmentAssignmentAudit(
                {
                  actorUserId: input.actorUserId,
                  eventType: `recruitment.employee.${assignment.status.toLowerCase()}`,
                  metadata: {
                    assignmentScope: target.combined_role_id
                      ? "combined-role"
                      : "approved-post",
                    combinedRoleId: target.combined_role_id,
                    postId: target.post_id,
                    rowNumber: row.rowNumber,
                    status: assignment.status,
                    lastWorkingDate: assignment.lastWorkingDate,
                    targetCode: row.targetCode,
                    targetType: row.targetType,
                  },
                  organizationId: input.organizationId,
                  targetId: target.post_id,
                  targetTable: "posts",
                },
                commandId,
                commandOrdinal
              )
            )
          }
          updatedPostCount += targets.length
        }
        const updates = [...updatesByPostId.values()]
        const updated = await client.query<{ id: string }>(
          `
            WITH updates AS (
              SELECT
                (value->>'id')::uuid AS id,
                value->>'employeeName' AS employee_name,
                value->>'employeeCode' AS employee_code,
                value->>'status' AS status,
                migration.try_date(value->>'lastWorkingDate') AS last_working_date,
                nullif(value->>'actorUserId', '')::uuid AS actor_user_id,
                (value->>'updateCount')::bigint AS update_count
              FROM jsonb_array_elements($1::jsonb) AS entry(value)
            )
            UPDATE recruitment.posts post
            SET employee_name = updates.employee_name,
              employee_code = updates.employee_code,
              status = updates.status,
              last_working_date = updates.last_working_date,
              updated_by_user_id = updates.actor_user_id,
              updated_at = now(),
              row_version = post.row_version + updates.update_count
            FROM updates
            WHERE post.id = updates.id AND post.organization_id = $2
            RETURNING post.id
          `,
          [JSON.stringify(updates), input.organizationId]
        )
        if (updated.rows.length !== updates.length) {
          throw new Error(
            "Not every approved post in the assignment was updated."
          )
        }
        await auditMany(client, auditEvents)
        return {
          assignmentCount: orderedAssignments.length,
          updatedPostCount,
        }
      })
    },

    async createJobFromPost(
      input: MutationContext & { postId: string; targetDate?: string | null }
    ) {
      return transaction(pool, async (client) => {
        const target = await client.query<{
          combined_role_id: string | null
          post_id: string
        }>(
          `
            SELECT selected.combined_role_id,
              COALESCE(primary_post.id, selected.id) AS post_id
            FROM recruitment.posts selected
            LEFT JOIN recruitment.combined_roles combined
              ON combined.id = selected.combined_role_id
             AND combined.status = 'Active'
            LEFT JOIN recruitment.combined_role_posts primary_link
              ON primary_link.combined_role_id = combined.id
             AND primary_link.is_primary
            LEFT JOIN recruitment.posts primary_post
              ON primary_post.id = primary_link.post_id
            WHERE selected.organization_id = $1 AND selected.id = $2
            FOR UPDATE OF selected
          `,
          [input.organizationId, required(input.postId, "Approved post")]
        )
        const targetPost = target.rows[0]
        if (!targetPost) throw new Error("Approved post was not found.")
        const existing = await client.query(
          `
            SELECT 1
            FROM recruitment.job_posts job
            JOIN recruitment.posts job_post ON job_post.id = job.post_id
            WHERE job.organization_id = $1 AND job.status = 'Open'
              AND (
                job.post_id = $2
                OR ($3::uuid IS NOT NULL
                  AND job_post.combined_role_id = $3::uuid)
              )
          `,
          [input.organizationId, input.postId, targetPost.combined_role_id]
        )
        if (existing.rowCount) {
          throw new Error(
            "This approved post or combined job already has an open job."
          )
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
            SELECT selected.organization_id, post.id, template.id,
              COALESCE(combined.vacancy_code, post.vacancy_code),
              COALESCE(combined.vacancy_code, post.vacancy_code),
              COALESCE(combined.name,
                designation.name || ' / ' || department.name),
              migration.try_date($1), template.minimum_salary,
              template.maximum_salary,
              COALESCE(template.gender, post.gender),
              COALESCE(template.education, post.education),
              COALESCE(template.experience_requirement, post.experience_requirement),
              COALESCE(template.role_responsibilities, post.role_responsibilities),
              $2, $2, 'mrm-dashboard', 'jobs', $3
            FROM recruitment.posts selected
            LEFT JOIN recruitment.combined_roles combined
              ON combined.id = selected.combined_role_id
             AND combined.status = 'Active'
            LEFT JOIN recruitment.combined_role_posts primary_link
              ON primary_link.combined_role_id = combined.id
             AND primary_link.is_primary
            LEFT JOIN recruitment.posts primary_post
              ON primary_post.id = primary_link.post_id
            JOIN recruitment.posts post
              ON post.id = COALESCE(primary_post.id, selected.id)
            JOIN recruitment.departments department ON department.id = post.department_id
            JOIN recruitment.designations designation ON designation.id = post.designation_id
            LEFT JOIN LATERAL (
              SELECT candidate.*
              FROM recruitment.requirement_templates candidate
              WHERE candidate.organization_id = selected.organization_id
                AND candidate.active
                AND (
                  candidate.id = post.requirement_template_id
                  OR (combined.id IS NOT NULL
                    AND candidate.combined_role_id = combined.id)
                )
              ORDER BY
                (candidate.id = post.requirement_template_id) DESC NULLS LAST,
                (candidate.combined_role_id = combined.id) DESC NULLS LAST,
                candidate.updated_at DESC, candidate.id
              LIMIT 1
            ) template ON true
            WHERE selected.id = $4 AND selected.organization_id = $5
              AND (
                selected.status = 'Resigned'
                OR (
                  selected.status <> 'Inactive'
                  AND NULLIF(BTRIM(selected.employee_name), '') IS NULL
                  AND NULLIF(BTRIM(selected.employee_code), '') IS NULL
                )
              )
            RETURNING id
          `,
          [
            optional(input.targetDate),
            input.actorUserId ?? null,
            randomUUID(),
            targetPost.post_id,
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

    async closeJob(input: MutationContext & { jobId: string }) {
      return transaction(pool, async (client) => {
        const jobId = required(input.jobId, "Recruitment opening")
        const existing = await client.query<
          Record<string, unknown> & { id: string; status: string }
        >(
          `
            SELECT * FROM recruitment.job_posts
            WHERE id = $1 AND organization_id = $2
            FOR UPDATE
          `,
          [jobId, input.organizationId]
        )
        const job = existing.rows[0]
        if (!job) throw new Error("Recruitment opening was not found.")
        if (job.status !== "Open") {
          throw new Error("Only an open recruitment job can be closed.")
        }
        const updated = await client.query<
          Record<string, unknown> & { id: string; status: string }
        >(
          `
            UPDATE recruitment.job_posts
            SET status = 'Closed', closed_on = current_date,
              updated_by_user_id = $1, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $2 AND organization_id = $3
            RETURNING *
          `,
          [input.actorUserId ?? null, jobId, input.organizationId]
        )
        await audit(client, {
          ...input,
          afterState: updated.rows[0],
          beforeState: job,
          eventType: "recruitment.job.closed",
          targetId: jobId,
          targetTable: "job_posts",
        })
        return updated.rows[0]!
      })
    },

    async deleteJob(input: MutationContext & { jobId: string }) {
      return transaction(pool, async (client) => {
        const jobId = required(input.jobId, "Recruitment opening")
        const deleted = await client.query<{
          deleted_job: Record<string, unknown> & { id: string }
        }>(
          `
            SELECT recruitment.delete_job_post($1, $2) AS deleted_job
          `,
          [input.organizationId, jobId]
        )
        const deletedJob = deleted.rows[0]?.deleted_job
        if (!deletedJob) {
          throw new Error("Recruitment opening was not found.")
        }
        await audit(client, {
          ...input,
          beforeState: deletedJob,
          eventType: "recruitment.job.deleted",
          targetId: jobId,
          targetTable: "job_posts",
        })
        return { id: jobId }
      })
    },

    async upsertCandidate(
      input: MutationContext & {
        candidateId?: string | null
        currentCompany?: string | null
        departmentCode?: string | null
        designationCode?: string | null
        email?: string | null
        experience?: string | null
        name: string
        notes?: string | null
        phone: string
        source?: string | null
      }
    ) {
      return transaction(pool, async (client) => {
        const candidateId = optional(input.candidateId)
        const departmentCode = optional(input.departmentCode)
        const designationCode = optional(input.designationCode)
        let departmentId: string | null = null
        let designationId: string | null = null
        if (departmentCode) {
          const department = await client.query<{ id: string }>(
            `
              SELECT id FROM recruitment.departments
              WHERE organization_id = $1 AND lower(code) = lower($2)
            `,
            [input.organizationId, departmentCode]
          )
          if (!department.rows[0]) {
            throw new Error("Preferred department was not found in the master.")
          }
          departmentId = department.rows[0].id
        }
        if (designationCode) {
          const designation = await client.query<{ id: string }>(
            `
              SELECT id FROM recruitment.designations
              WHERE organization_id = $1 AND lower(code) = lower($2)
            `,
            [input.organizationId, designationCode]
          )
          if (!designation.rows[0]) {
            throw new Error(
              "Preferred designation was not found in the master."
            )
          }
          designationId = designation.rows[0].id
        }
        const parameters = [
          input.organizationId,
          requiredProperCase(input.name, "Candidate name"),
          required(input.phone, "Candidate phone"),
          optional(input.email),
          optionalProperCase(input.currentCompany),
          optional(input.experience),
          optional(input.source),
          departmentId,
          designationId,
          input.actorUserId ?? null,
        ]
        if (candidateId) {
          const duplicatePhone = await client.query<{ id: string }>(
            `
              SELECT id FROM recruitment.candidates
              WHERE organization_id = $1 AND phone = $2 AND id <> $3
              LIMIT 1
            `,
            [input.organizationId, parameters[2], candidateId]
          )
          if (duplicatePhone.rows[0]) {
            throw new Error("Another candidate already uses this phone number.")
          }
        }
        const result = candidateId
          ? await client.query<{ id: string }>(
              `
                UPDATE recruitment.candidates
                SET name = $2, phone = $3, email = $4, current_company = $5,
                  experience = $6, source = $7, preferred_department_id = $8,
                  preferred_designation_id = $9, updated_by_user_id = $10,
                  updated_at = now(),
                  row_version = row_version + 1
                WHERE organization_id = $1 AND id = $11
                RETURNING id
              `,
              [...parameters, candidateId]
            )
          : await client.query<{ id: string }>(
              `
                INSERT INTO recruitment.candidates (
                  organization_id, name, phone, email, current_company,
                  experience, source, preferred_department_id,
                  preferred_designation_id, created_by_user_id,
                  updated_by_user_id, source_system,
                  source_table, source_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10,
                  'mrm-dashboard', 'candidates', $11)
                ON CONFLICT (organization_id, phone) DO UPDATE SET
                  name = EXCLUDED.name, email = EXCLUDED.email,
                  current_company = EXCLUDED.current_company,
                  experience = EXCLUDED.experience, source = EXCLUDED.source,
                  preferred_department_id = EXCLUDED.preferred_department_id,
                  preferred_designation_id = EXCLUDED.preferred_designation_id,
                  updated_by_user_id = EXCLUDED.updated_by_user_id,
                  updated_at = now(),
                  row_version = recruitment.candidates.row_version + 1
                RETURNING id
              `,
              [...parameters, randomUUID()]
            )
        if (!result.rows[0]) throw new Error("Candidate was not found.")
        const savedCandidateId = result.rows[0].id
        await client.query(
          `SELECT recruitment.replace_candidate_department($1, $2, $3)`,
          [input.organizationId, savedCandidateId, departmentId]
        )
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
              savedCandidateId,
              optional(input.notes),
              input.actorUserId ?? null,
              randomUUID(),
            ]
          )
        }
        await audit(client, {
          ...input,
          eventType: "recruitment.candidate.saved",
          targetId: savedCandidateId,
          targetTable: "candidates",
        })
        return { id: savedCandidateId }
      })
    },

    async recordCandidateResume(
      input: MutationContext & {
        byteSize: number
        candidateId: string
        fileName: string
        mediaType: string
        sha256: string
        sourceId: string
        storageKey: string
      }
    ) {
      const storageKey = required(input.storageKey, "Resume storage key")
      if (
        storageKey.startsWith("/") ||
        storageKey.includes("..") ||
        storageKey.includes("\\")
      ) {
        throw new Error("Resume storage key is invalid.")
      }
      return transaction(pool, async (client) => {
        const candidate = await client.query<{ id: string }>(
          `
            SELECT id FROM recruitment.candidates
            WHERE id = $1 AND organization_id = $2
            FOR UPDATE
          `,
          [required(input.candidateId, "Candidate"), input.organizationId]
        )
        if (!candidate.rows[0]) throw new Error("Candidate was not found.")
        const file = await client.query<{ id: string }>(
          `
            INSERT INTO core.files (
              organization_id, file_name, media_type, byte_size, sha256,
              storage_key, created_by_user_id, updated_by_user_id,
              source_system, source_table, source_id, source_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7,
              'mrm-dashboard', 'candidate_resumes', $8, $9)
            RETURNING id
          `,
          [
            input.organizationId,
            required(input.fileName, "Resume file name"),
            input.mediaType,
            input.byteSize,
            input.sha256,
            storageKey,
            input.actorUserId ?? null,
            input.sourceId,
            input,
          ]
        )
        await client.query(
          `
            INSERT INTO core.file_links (
              organization_id, file_id, target_schema, target_table,
              target_id, purpose, created_by_user_id, updated_by_user_id
            )
            VALUES ($1, $2, 'recruitment', 'candidates', $3, 'resume', $4, $4)
          `,
          [
            input.organizationId,
            file.rows[0]!.id,
            input.candidateId,
            input.actorUserId ?? null,
          ]
        )
        await client.query(
          `
            UPDATE recruitment.candidates
            SET resume_reference = $1, updated_by_user_id = $2,
              updated_at = now(), row_version = row_version + 1
            WHERE id = $3 AND organization_id = $4
          `,
          [
            file.rows[0]!.id,
            input.actorUserId ?? null,
            input.candidateId,
            input.organizationId,
          ]
        )
        await audit(client, {
          ...input,
          eventType: "recruitment.candidate.resume_recorded",
          metadata: { fileId: file.rows[0]!.id, fileName: input.fileName },
          targetId: input.candidateId,
          targetTable: "candidates",
        })
        return { id: file.rows[0]!.id }
      })
    },

    async getCandidateResume(organizationId: string, candidateId: string) {
      const result = await pool.query<{
        byte_size: string | null
        file_name: string
        lifecycle_state: string
        media_type: string | null
        object_lifecycle_state: string | null
        public_url: string | null
        sha256: string | null
        storage_key: string | null
      }>(
        `
          SELECT coalesce(artifact.file_name, legacy.file_name) AS file_name,
            coalesce(artifact.media_type, legacy.media_type) AS media_type,
            coalesce(artifact.byte_size, legacy.byte_size)::text AS byte_size,
            coalesce(artifact.sha256, legacy.sha256) AS sha256,
            coalesce(artifact.storage_key, legacy.storage_key) AS storage_key,
            artifact.public_url,
            coalesce(artifact.lifecycle_state, 'current') AS lifecycle_state,
            artifact.object_lifecycle_state
          FROM recruitment.candidates candidate
          LEFT JOIN LATERAL (
            SELECT file.file_name, file.media_type, file.byte_size,
              file.sha256, file.storage_key, file.lifecycle_state,
              object.public_url,
              object.lifecycle_state AS object_lifecycle_state
            FROM core.file_links link
            JOIN core.files file ON file.id = link.file_id
            LEFT JOIN core.file_objects object
              ON object.id = file.physical_object_id
            WHERE link.organization_id = candidate.organization_id
              AND link.target_schema = 'recruitment'
              AND link.target_table = 'candidates'
              AND link.target_id = candidate.id
              AND link.purpose = 'resume' AND link.is_current
            LIMIT 1
          ) artifact ON true
          LEFT JOIN core.files legacy ON legacy.id::text = candidate.resume_reference
          WHERE candidate.organization_id = $1 AND candidate.id = $2
        `,
        [organizationId, required(candidateId, "Candidate")]
      )
      const file = result.rows[0]
      if (!file?.file_name) throw new Error("Candidate resume was not found.")
      if (
        file.lifecycle_state === "deleted" ||
        file.object_lifecycle_state === "deleted"
      ) {
        throw new Error("Candidate resume is deleted or unavailable.")
      }
      return {
        byteSize: file.byte_size === null ? null : Number(file.byte_size),
        fileName: file.file_name,
        mediaType: file.media_type,
        publicUrl: file.public_url,
        sha256: file.sha256,
        storageKey: file.storage_key,
      }
    },

    async assignCandidate(
      input: MutationContext & { candidateId: string; jobId: string }
    ) {
      const candidateId = required(input.candidateId, "Candidate")
      const jobId = required(input.jobId, "Recruitment opening")
      const commandId = randomUUID()
      const applications = await transaction(pool, (client) =>
        assignCandidatesInTransaction(client, {
          ...input,
          candidateIds: [candidateId],
          commandId,
          jobId,
        })
      )
      return { id: applications[0]!.id }
    },

    async assignCandidates(input: CandidateAssignmentInput) {
      const candidateIds = normalizedCandidateAssignmentIds(input.candidateIds)
      assertCandidateAssignmentCount(candidateIds)
      const jobId = required(input.jobId, "Recruitment opening")
      const commandId = randomUUID()
      return transaction(pool, (client) =>
        assignCandidatesInTransaction(client, {
          ...input,
          candidateIds,
          commandId,
          jobId,
        })
      )
    },

    async completeCandidateAppointment(
      input: MutationContext &
        CandidateAppointmentTermsInput & { applicationId: string }
    ) {
      const terms = candidateAppointmentTerms(input)
      return transaction(pool, (client) =>
        completeCandidateAppointmentInTransaction(client, {
          ...input,
          applicationId: required(input.applicationId, "Candidate application"),
          terms,
        })
      )
    },

    async withdrawCandidateApplication(
      input: MutationContext & { applicationId: string; reason: string }
    ) {
      return transaction(pool, async (client) => {
        const applicationId = required(
          input.applicationId,
          "Candidate application"
        )
        const reason = required(input.reason, "Withdrawal reason")
        const beforeResult = await client.query<{
          candidate_id: string
          candidate_name: string
          id: string
          job_id: string
          job_title: string
          status: string
        }>(
          `
            SELECT application.id, application.status,
              candidate.id AS candidate_id,
              candidate.name AS candidate_name,
              job.id AS job_id, job.title AS job_title
            FROM recruitment.applications application
            JOIN recruitment.candidates candidate
              ON candidate.id = application.candidate_id
            JOIN recruitment.job_posts job
              ON job.id = application.job_post_id
            WHERE application.id = $1
              AND application.organization_id = $2
            FOR UPDATE OF application
          `,
          [applicationId, input.organizationId]
        )
        const before = beforeResult.rows[0]
        if (!before) throw new Error("Candidate application was not found.")
        if (!isActiveRecruitmentApplicationStatus(before.status)) {
          throw new Error(
            "Only an active candidate application can be withdrawn."
          )
        }
        const afterResult = await client.query<{
          id: string
          status: string
        }>(
          `
            UPDATE recruitment.applications
            SET status = 'Withdrawn', interview_at = NULL,
              planned_round = NULL, updated_by_user_id = $1,
              updated_at = now(), row_version = row_version + 1
            WHERE id = $2 AND organization_id = $3
            RETURNING id, status
          `,
          [input.actorUserId ?? null, applicationId, input.organizationId]
        )
        const candidateEvent = await client.query<{ id: string }>(
          `
            INSERT INTO recruitment.candidate_events (
              organization_id, candidate_id, job_post_id, application_id,
              event_type, title, notes, actor_user_id, source_system,
              source_table, source_id
            )
            VALUES ($1, $2, $3, $4, 'Candidate Withdrawal', $5, $6, $7,
              'mrm-dashboard', 'application-withdrawals', $8)
            RETURNING id
          `,
          [
            input.organizationId,
            before.candidate_id,
            before.job_id,
            applicationId,
            `Withdrew from ${before.job_title}`,
            reason,
            input.actorUserId ?? null,
            randomUUID(),
          ]
        )
        await audit(client, {
          ...input,
          afterState: afterResult.rows[0],
          beforeState: { id: before.id, status: before.status },
          eventType: "recruitment.application.withdrawn",
          metadata: {
            candidateEventId: candidateEvent.rows[0]!.id,
            candidateId: before.candidate_id,
            candidateName: before.candidate_name,
            jobId: before.job_id,
          },
          reason,
          targetId: applicationId,
          targetTable: "applications",
        })
        return afterResult.rows[0]!
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

    async updateCandidateEvent(
      input: MutationContext & {
        eventId: string
        eventType?: string | null
        notes?: string | null
        title: string
      }
    ) {
      return transaction(pool, async (client) => {
        const eventId = required(input.eventId, "Conversation log")
        const before = await client.query<
          Record<string, unknown> & { id: string }
        >(
          `
            SELECT * FROM recruitment.candidate_events
            WHERE id = $1 AND organization_id = $2
            FOR UPDATE
          `,
          [eventId, input.organizationId]
        )
        if (!before.rows[0]) {
          throw new Error("Conversation log was not found.")
        }
        const after = await client.query<
          Record<string, unknown> & { id: string }
        >(
          `
            UPDATE recruitment.candidate_events
            SET event_type = $1, title = $2, notes = $3
            WHERE id = $4 AND organization_id = $5
            RETURNING *
          `,
          [
            optional(input.eventType) ?? "Conversation",
            required(input.title, "Conversation title"),
            optional(input.notes),
            eventId,
            input.organizationId,
          ]
        )
        await audit(client, {
          ...input,
          afterState: after.rows[0],
          beforeState: before.rows[0],
          eventType: "recruitment.candidate_event.updated",
          targetId: eventId,
          targetTable: "candidate_events",
        })
        return after.rows[0]!
      })
    },

    async deleteCandidateEvent(input: MutationContext & { eventId: string }) {
      return transaction(pool, async (client) => {
        const eventId = required(input.eventId, "Conversation log")
        const deleted = await client.query<{
          deleted_event: Record<string, unknown> & { id: string }
        }>(
          `
            SELECT recruitment.delete_candidate_event($1, $2)
              AS deleted_event
          `,
          [input.organizationId, eventId]
        )
        const deletedEvent = deleted.rows[0]?.deleted_event
        if (!deletedEvent) {
          throw new Error("Conversation log was not found.")
        }
        await audit(client, {
          ...input,
          beforeState: deletedEvent,
          eventType: "recruitment.candidate_event.deleted",
          targetId: eventId,
          targetTable: "candidate_events",
        })
        return { id: eventId }
      })
    },

    async scheduleInterview(
      input: MutationContext & {
        applicationId: string
        interviewAt: string
        roundName: string
      }
    ) {
      return transaction(pool, async (client) => {
        const applicationResult = await client.query<{
          id: string
          status: string
        }>(
          `
            SELECT id, status
            FROM recruitment.applications
            WHERE id = $1 AND organization_id = $2
            FOR UPDATE
          `,
          [
            required(input.applicationId, "Candidate application"),
            input.organizationId,
          ]
        )
        const application = applicationResult.rows[0]
        if (!application) {
          throw new Error("Candidate application was not found.")
        }
        if (!isActiveRecruitmentApplicationStatus(application.status)) {
          throw new Error(
            "This candidate application is closed. Create a new application before scheduling another interview."
          )
        }
        const historyResult = await client.query<{
          round_name: string
          scheduled_at: string | null
          status: string
        }>(
          `
            SELECT round_name, status, scheduled_at::text
            FROM recruitment.interviews
            WHERE application_id = $1 AND organization_id = $2
            FOR UPDATE
          `,
          [application.id, input.organizationId]
        )
        const nextRound = nextRecruitmentInterviewRound(
          historyResult.rows.map((row) => ({
            roundName: row.round_name,
            status: row.status,
          }))
        )
        if (!nextRound) {
          throw new Error("All three interview rounds are already approved.")
        }
        const selectedRound = required(input.roundName, "Interview round")
        if (
          canonicalRecruitmentInterviewRound(selectedRound) !== nextRound.name
        ) {
          throw new Error(`The next required round is ${nextRound.name}.`)
        }
        const interviewAt = required(
          input.interviewAt,
          "Interview date and time"
        )
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
            interviewAt,
            nextRound.name,
            input.actorUserId ?? null,
            application.id,
            input.organizationId,
          ]
        )
        const updatedApplication = result.rows[0]!
        await client.query(
          `
            INSERT INTO recruitment.interviews (
              organization_id, application_id, round_name, status,
              scheduled_at, created_by_user_id, updated_by_user_id,
              source_system, source_table, source_id
            )
            VALUES ($1, $2, $3, 'Scheduled', $4::timestamptz, $5, $5,
              'mrm-dashboard', 'interview-schedules', $6)
            ON CONFLICT (application_id, round_name) DO UPDATE SET
              scheduled_at = EXCLUDED.scheduled_at,
              status = CASE
                WHEN recruitment.interviews.status = 'Scheduled'
                  THEN 'Scheduled'
                ELSE recruitment.interviews.status
              END,
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              updated_at = now(),
              row_version = recruitment.interviews.row_version + 1
          `,
          [
            input.organizationId,
            updatedApplication.id,
            nextRound.name,
            interviewAt,
            input.actorUserId ?? null,
            randomUUID(),
          ]
        )
        await audit(client, {
          ...input,
          eventType: "recruitment.interview.scheduled",
          targetId: updatedApplication.id,
          targetTable: "applications",
        })
        return updatedApplication
      })
    },

    async recordInterview(
      input: MutationContext & {
        applicationId: string
        comments?: string | null
        interviewerName?: string | null
        questionScores: Record<string, unknown>
        roundName: string
        status: "Approved" | "Hold" | "Rejected"
      }
    ) {
      return transaction(pool, async (client) => {
        const applicationResult = await client.query<{
          id: string
          status: string
        }>(
          `
            SELECT id, status
            FROM recruitment.applications
            WHERE id = $1 AND organization_id = $2
            FOR UPDATE
          `,
          [
            required(input.applicationId, "Candidate application"),
            input.organizationId,
          ]
        )
        const application = applicationResult.rows[0]
        if (!application) {
          throw new Error("Candidate application was not found.")
        }
        if (!isActiveRecruitmentApplicationStatus(application.status)) {
          throw new Error(
            "This candidate application is closed. Create a new application before recording another interview."
          )
        }
        const historyResult = await client.query<{
          round_name: string
          scheduled_at: string | null
          status: string
        }>(
          `
            SELECT round_name, status, scheduled_at::text
            FROM recruitment.interviews
            WHERE application_id = $1 AND organization_id = $2
            FOR UPDATE
          `,
          [application.id, input.organizationId]
        )
        const nextRound = nextRecruitmentInterviewRound(
          historyResult.rows.map((row) => ({
            roundName: row.round_name,
            status: row.status,
          }))
        )
        if (!nextRound) {
          throw new Error("All three interview rounds are already approved.")
        }
        if (required(input.roundName, "Interview round") !== nextRound.name) {
          throw new Error(`The next required round is ${nextRound.name}.`)
        }
        const scheduledInterview = historyResult.rows.find(
          (interview) =>
            interview.round_name === nextRound.name &&
            interview.status === "Scheduled" &&
            interview.scheduled_at !== null
        )
        if (!scheduledInterview) {
          throw new Error(
            `${nextRound.name} must be scheduled before scoring is allowed.`
          )
        }
        const assessment = scoreRecruitmentInterview(
          nextRound.name,
          input.questionScores
        )
        const finalApproval =
          input.status === "Approved" && nextRound.name === "HR Round"
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO recruitment.interviews (
              organization_id, application_id, round_name, status,
              interviewer_name, scores, comments, joining_date,
              created_by_user_id, updated_by_user_id, source_system,
              source_table, source_id
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7,
              migration.try_date($8), $9, $9, 'mrm-dashboard',
              'interviews', $10)
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
            application.id,
            nextRound.name,
            input.status,
            optionalProperCase(input.interviewerName),
            JSON.stringify({
              overall: assessment.overall,
              questions: assessment.questionScores,
            }),
            optional(input.comments),
            null,
            input.actorUserId ?? null,
            randomUUID(),
          ]
        )
        const recordedInterview = result.rows[0]!
        await client.query(
          `
            UPDATE recruitment.applications
            SET status = $1, updated_by_user_id = $2,
              updated_at = now(), row_version = row_version + 1
            WHERE id = $3 AND organization_id = $4
          `,
          [
            finalApproval
              ? "Approved"
              : input.status === "Approved"
                ? "Interview"
                : input.status,
            input.actorUserId ?? null,
            input.applicationId,
            input.organizationId,
          ]
        )
        await audit(client, {
          ...input,
          eventType: "recruitment.interview.recorded",
          metadata: { finalApproval },
          targetId: recordedInterview.id,
          targetTable: "interviews",
        })
        return recordedInterview
      })
    },
  }
}
