import type { PoolClient } from "pg"
import { listIsoDocumentStaff } from "./iso-document-staff"
import {
  AnalysisError,
  analysisDate,
  nextAnalysisStatus,
  parseAnalysisFields,
  type AnalysisFields,
  type AnalysisOperation,
  type AnalysisSource,
  type AnalysisStatus,
  type AnalysisKind,
  analysisToday,
} from "./iso-analysis-domain"
import {
  parseRiskReview,
  requireRiskAssessment,
  type RiskReview,
} from "./risk-thinking-domain"
import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"

export type AnalysisAccess = {
  organizationId: string
  userId: string
  userName: string
  canReadAll: boolean
  canManage: boolean
  canVerify: boolean
}
export type AnalysisRecord = AnalysisFields & {
  id: string
  number: number
  ownerName: string | null
  status: AnalysisStatus
  completionNotes: string
  evidenceLocation: string
  completedAt: string | null
  completedBy: string | null
  closedAt: string | null
  closedBy: string | null
  closureRemarks: string
  effectivenessNotes: string
  version: number
  source: AnalysisSource | null
  createdAt: string
  updatedAt: string
  riskReview?: RiskReview | null
  riskState?: "Active" | "Retired"
}
export type AnalysisHistory = {
  id: string
  eventType: string
  actorName: string
  occurredAt: string
  remarks: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}
export type AnalysisImportRow = {
  fields: AnalysisFields
  status: "Open" | "Completed"
  completionNotes: string
  source: AnalysisSource
  sourceKey: string
}

const selectRecord = `r.id, r.record_number AS number, r.kind, r.analysis_year AS "analysisYear",
  r.category, r.description, r.action_plan AS "actionPlan", r.department,
  r.focus, r.priority, r.impact, r.expected_outcome AS "expectedOutcome", r.effectiveness_notes AS "effectivenessNotes",
  r.owner_user_id AS "ownerUserId", owner.name AS "ownerName",
  r.identified_on::text AS "identifiedOn", r.due_on::text AS "dueOn",
  r.reviewed_on::text AS "reviewedOn", r.next_review_on::text AS "nextReviewOn", r.status,
  r.completion_notes AS "completionNotes", r.evidence_location AS "evidenceLocation",
  r.completed_at::text AS "completedAt", completed.name AS "completedBy",
  r.closed_at::text AS "closedAt", closed.name AS "closedBy", r.closure_remarks AS "closureRemarks",
  r.version, r.source_payload AS source, r.created_at::text AS "createdAt", r.updated_at::text AS "updatedAt",
  r.risk_assessment AS risk, r.risk_review AS "riskReview", r.risk_state AS "riskState"`
const recordJoins = `FROM document_control.analysis_records r
  LEFT JOIN identity.users owner ON owner.id = r.owner_user_id
  LEFT JOIN identity.users completed ON completed.id = r.completed_by_user_id
  LEFT JOIN identity.users closed ON closed.id = r.closed_by_user_id`

async function audit(
  client: PoolClient,
  access: AnalysisAccess,
  id: string,
  operation: string,
  remarks: string,
  before: unknown,
  after: unknown
) {
  await client.query(
    `INSERT INTO audit.events (
    organization_id, event_type, target_schema, target_table, target_id,
    actor_user_id, reason, before_state, after_state, metadata, source_system, source_table, source_id
  ) VALUES ($1, $2, 'document_control', 'analysis_records', $3, $4, $5, $6, $7, $8,
    'mrm-dashboard', 'iso_analysis', gen_random_uuid()::text)`,
    [
      access.organizationId,
      `iso_analysis.${operation}`,
      id,
      access.userId,
      remarks,
      before,
      after,
      { actorName: access.userName },
    ]
  )
}

export function createIsoAnalysisRepository(options: RepositoryPoolOptions) {
  const { pool, close } = repositoryPool(options)
  async function record(
    access: AnalysisAccess,
    id: string,
    client: Pick<PoolClient, "query"> = pool,
    lock = false
  ) {
    const result = await client.query<AnalysisRecord>(
      `SELECT ${selectRecord} ${recordJoins}
      WHERE r.organization_id = $1 AND r.id = $2
        AND ($3::boolean OR r.owner_user_id = $4)
      ${lock ? "FOR UPDATE OF r" : ""}`,
      [
        access.organizationId,
        id,
        access.canReadAll || access.canManage || access.canVerify,
        access.userId,
      ]
    )
    return result.rows[0] ?? null
  }
  async function owners(organizationId: string) {
    return listIsoDocumentStaff(pool, organizationId)
  }
  async function validateOwner(
    organizationId: string,
    ownerUserId: string | null
  ) {
    if (
      ownerUserId &&
      !(await owners(organizationId)).some((owner) => owner.id === ownerUserId)
    )
      throw new AnalysisError("Choose an active responsible staff account.")
  }
  async function insert(
    client: PoolClient,
    access: AnalysisAccess,
    fields: AnalysisFields,
    imported?: AnalysisImportRow
  ) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO document_control.analysis_records (
      organization_id, kind, analysis_year, category, description, action_plan, department,
      owner_user_id, identified_on, due_on, reviewed_on, next_review_on, created_by_user_id,
      status, completion_notes, source_key, source_payload, focus, priority, impact, expected_outcome, risk_assessment
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
    ON CONFLICT (organization_id, kind, source_key) DO NOTHING RETURNING id`,
      [
        access.organizationId,
        fields.kind,
        fields.analysisYear,
        fields.category,
        fields.description,
        fields.actionPlan,
        fields.department,
        fields.ownerUserId,
        fields.identifiedOn,
        fields.dueOn,
        fields.reviewedOn,
        fields.nextReviewOn,
        access.userId,
        imported?.status ?? "Open",
        imported?.completionNotes ?? "",
        imported?.sourceKey ?? null,
        imported?.source ?? null,
        fields.focus,
        fields.priority,
        fields.impact,
        fields.expectedOutcome,
        fields.risk ?? null,
      ]
    )
    const id = result.rows[0]?.id
    if (id)
      await audit(
        client,
        access,
        id,
        imported ? "imported" : "created",
        imported
          ? `Imported ${imported.source.fileName} · ${imported.source.sheet} · row ${imported.source.row}`
          : "Created analysis item",
        null,
        await record(access, id, client)
      )
    return id
  }
  return {
    close,
    owners,
    async organizationId() {
      const result = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code) = 'mrmpl'"
      )
      if (!result.rows[0])
        throw new AnalysisError("MRMPL organization is unavailable.")
      return result.rows[0].id
    },
    async list(access: AnalysisAccess, kind: AnalysisKind) {
      const result = await pool.query<AnalysisRecord>(
        `SELECT ${selectRecord} ${recordJoins}
        WHERE r.organization_id = $1 AND r.kind = $2 AND ($3::boolean OR r.owner_user_id = $4)
        ORDER BY r.analysis_year DESC, r.record_number DESC`,
        [
          access.organizationId,
          kind,
          access.canReadAll || access.canManage || access.canVerify,
          access.userId,
        ]
      )
      return result.rows
    },
    async dossier(access: AnalysisAccess, id: string) {
      const entry = await record(access, id)
      if (!entry) return null
      const history = await pool.query<AnalysisHistory>(
        `SELECT event.id, event.event_type AS "eventType",
        COALESCE(event.metadata ->> 'actorName', actor.name, 'Workbook import') AS "actorName",
        event.occurred_at::text AS "occurredAt", COALESCE(event.reason, '') AS remarks,
        event.before_state AS before, event.after_state AS after
        FROM audit.events event LEFT JOIN identity.users actor ON actor.id = event.actor_user_id
        WHERE event.organization_id = $1 AND event.target_schema = 'document_control'
          AND event.target_table = 'analysis_records' AND event.target_id = $2
        ORDER BY event.occurred_at DESC, event.id DESC`,
        [access.organizationId, id]
      )
      return { entry, history: history.rows }
    },
    async save(
      access: AnalysisAccess,
      fieldsInput: unknown,
      existing?: { id: string; version: number; reason: string }
    ) {
      if (!access.canManage)
        throw new AnalysisError("Manage Analyses permission is required.")
      const fields = parseAnalysisFields(fieldsInput)
      await validateOwner(access.organizationId, fields.ownerUserId)
      return withTransaction(pool, async (client) => {
        if (!existing) return insert(client, access, fields)
        const before = await record(access, existing.id, client, true)
        if (!before) throw new AnalysisError("Analysis item was not found.")
        if (before.version !== existing.version)
          throw new AnalysisError("This item changed. Refresh before saving.")
        if (before.status === "Closed")
          throw new AnalysisError(
            "Reopen the action before editing its details."
          )
        if (before.riskState === "Retired")
          throw new AnalysisError("Reopen the retired risk before editing.")
        if (before.kind === "RISK" && before.status === "Completed")
          throw new AnalysisError(
            "Resolve QA verification before changing the risk assessment."
          )
        if (before.kind !== fields.kind)
          throw new AnalysisError("Analysis type cannot be changed.")
        if (!existing.reason.trim())
          throw new AnalysisError("Enter a reason for the changes.")
        await client.query(
          `UPDATE document_control.analysis_records SET analysis_year=$3, category=$4,
          description=$5, action_plan=$6, department=$7, owner_user_id=$8, identified_on=$9,
          due_on=$10, reviewed_on=$11, next_review_on=$12, focus=$13, priority=$14, impact=$15,
          expected_outcome=$16, risk_assessment=$17, risk_review=CASE WHEN kind='RISK' THEN NULL ELSE risk_review END, version=version+1, updated_at=now()
          WHERE organization_id=$1 AND id=$2`,
          [
            access.organizationId,
            existing.id,
            fields.analysisYear,
            fields.category,
            fields.description,
            fields.actionPlan,
            fields.department,
            fields.ownerUserId,
            fields.identifiedOn,
            fields.dueOn,
            fields.reviewedOn,
            fields.nextReviewOn,
            fields.focus,
            fields.priority,
            fields.impact,
            fields.expectedOutcome,
            fields.risk ?? null,
          ]
        )
        await audit(
          client,
          access,
          existing.id,
          "edited",
          existing.reason.trim(),
          before,
          await record(access, existing.id, client)
        )
        return existing.id
      })
    },
    async importRows(access: AnalysisAccess, rows: AnalysisImportRow[]) {
      if (!access.canManage)
        throw new AnalysisError("Manage Analyses permission is required.")
      return withTransaction(pool, async (client) => {
        let added = 0
        for (const row of rows)
          if (
            await insert(client, access, parseAnalysisFields(row.fields), row)
          )
            added++
        return { added, skipped: rows.length - added }
      })
    },
    async update(
      access: AnalysisAccess,
      input: {
        id: string
        version: number
        operation: AnalysisOperation
        notes: string
        evidenceLocation: string
        effectivenessNotes?: string
        reviewedOn?: string
        nextReviewOn?: string
        riskReview?: unknown
      }
    ) {
      const notes = input.notes.trim()
      const evidence = input.evidenceLocation.trim()
      const effectiveness = input.effectivenessNotes?.trim() ?? ""
      if (
        !notes ||
        notes.length > 4000 ||
        evidence.length > 4000 ||
        effectiveness.length > 4000
      )
        throw new AnalysisError(
          "Enter work/review notes within 4,000 characters."
        )
      return withTransaction(pool, async (client) => {
        const before = await record(access, input.id, client, true)
        if (!before) throw new AnalysisError("Analysis item was not found.")
        if (before.version !== input.version)
          throw new AnalysisError("This item changed. Refresh before saving.")
        const qaDecision = ["verify", "return", "reopen", "review"].includes(
          input.operation
        )
        if (
          qaDecision
            ? !access.canVerify
            : !access.canManage && before.ownerUserId !== access.userId
        )
          throw new AnalysisError(
            qaDecision
              ? "QA verification permission is required."
              : "Only the responsible account or QA manager can record work."
          )
        let status =
          before.kind === "RISK" &&
          before.riskState === "Retired" &&
          input.operation === "reopen"
            ? ("In Progress" as const)
            : nextAnalysisStatus(before.status, input.operation)
        let riskReview = before.riskReview ?? null
        let riskState = before.riskState ?? "Active"
        if (before.kind === "RISK") {
          if (riskState === "Retired" && input.operation !== "reopen")
            throw new AnalysisError(
              "Reopen the retired risk before recording further work."
            )
          if (["progress", "complete", "verify"].includes(input.operation)) {
            requireRiskAssessment(before.risk ?? null)
            if (
              !before.ownerUserId ||
              !before.dueOn ||
              !before.department ||
              !before.impact ||
              !before.expectedOutcome
            )
              throw new AnalysisError(
                "Assign the risk owner, department, target date, consequence and expected outcome first."
              )
            await validateOwner(access.organizationId, before.ownerUserId)
          }
          if (["verify", "review"].includes(input.operation)) {
            riskReview = parseRiskReview(
              input.riskReview,
              input.nextReviewOn,
              input.operation === "verify"
            )
            if (!evidence)
              throw new AnalysisError(
                "Risk verification/review requires an evidence reference."
              )
            if (
              riskReview.decision === "Continue monitoring" &&
              input.operation === "review" &&
              before.status !== "Closed"
            )
              throw new AnalysisError(
                "Verify completed controls before accepting ongoing monitoring."
              )
            if (riskReview.decision === "Further treatment required")
              status = "In Progress"
            riskState =
              riskReview.decision === "No longer applicable"
                ? "Retired"
                : "Active"
          }
          if (["reopen", "return"].includes(input.operation)) {
            riskState = "Active"
            riskReview = null
          }
        }
        if (
          ["complete", "verify"].includes(input.operation) &&
          (!before.ownerUserId ||
            !before.dueOn ||
            !before.department.trim() ||
            before.focus === "Not assessed" ||
            before.priority === "Not assessed" ||
            !before.impact.trim() ||
            !before.expectedOutcome.trim())
        )
          throw new AnalysisError(
            "Record the risk/opportunity assessment, priority, expected outcome, responsible department/staff and target date first."
          )
        if (
          input.operation === "verify" &&
          (!before.completedAt ||
            !before.completedBy ||
            !before.completionNotes.trim())
        )
          throw new AnalysisError(
            "Record actual work completion before QA closure. A workbook's Done label is not completion evidence."
          )
        if (
          input.operation === "verify" &&
          (!(evidence || before.evidenceLocation.trim()) || !effectiveness)
        )
          throw new AnalysisError(
            "Record an evidence reference and effectiveness findings against the expected outcome before closing. Return inconclusive work for follow-up."
          )
        const reviewedOn =
          input.operation === "verify" && before.kind === "RISK"
            ? analysisToday()
            : input.operation === "review"
              ? analysisDate(input.reviewedOn)
              : before.reviewedOn
        if (input.operation === "review" && !reviewedOn)
          throw new AnalysisError("Enter the actual review date.")
        if (
          before.kind === "RISK" &&
          reviewedOn &&
          reviewedOn > analysisToday()
        )
          throw new AnalysisError(
            "Actual risk review date cannot be in the future."
          )
        const nextReviewOn =
          (before.kind === "RISK" &&
            ["review", "verify"].includes(input.operation)) ||
          input.operation === "review"
            ? analysisDate(input.nextReviewOn)
            : before.nextReviewOn
        if (
          before.kind === "RISK" &&
          riskState === "Active" &&
          ["review", "verify"].includes(input.operation) &&
          (!nextReviewOn || nextReviewOn <= (reviewedOn ?? analysisToday()))
        )
          throw new AnalysisError(
            "Next review must be after the actual review date."
          )
        const needsWork =
          input.operation === "review" &&
          riskReview?.decision === "Further treatment required"
        await client.query(
          `UPDATE document_control.analysis_records SET status=$3,
          completion_notes=CASE WHEN $4='complete' THEN $5 ELSE completion_notes END,
          evidence_location=CASE WHEN $6<>'' THEN $6 ELSE evidence_location END,
          completed_at=CASE WHEN $4='complete' THEN now() WHEN $4 IN ('return','reopen') THEN NULL ELSE completed_at END,
          completed_by_user_id=CASE WHEN $4='complete' THEN $7 WHEN $4 IN ('return','reopen') THEN NULL ELSE completed_by_user_id END,
          closed_at=CASE WHEN $4='verify' THEN now() WHEN $4='reopen' THEN NULL ELSE closed_at END,
          closed_by_user_id=CASE WHEN $4='verify' THEN $7 WHEN $4='reopen' THEN NULL ELSE closed_by_user_id END,
          closure_remarks=CASE WHEN $4='verify' THEN $5 WHEN $4='reopen' THEN '' ELSE closure_remarks END,
          effectiveness_notes=CASE WHEN $4='verify' THEN $10 WHEN $4 IN ('return','reopen') THEN '' ELSE effectiveness_notes END,
          reviewed_on=$8, next_review_on=$9, risk_review=$11, risk_state=$12,
          version=version+1, updated_at=now()
          WHERE organization_id=$1 AND id=$2`,
          [
            access.organizationId,
            input.id,
            status,
            input.operation,
            notes,
            evidence,
            access.userId,
            reviewedOn,
            nextReviewOn,
            effectiveness,
            riskReview,
            riskState,
          ]
        )
        if (needsWork)
          await client.query(
            `UPDATE document_control.analysis_records SET completed_at=NULL,completed_by_user_id=NULL,closed_at=NULL,closed_by_user_id=NULL,closure_remarks='',effectiveness_notes='' WHERE organization_id=$1 AND id=$2`,
            [access.organizationId, input.id]
          )
        await audit(
          client,
          access,
          input.id,
          input.operation,
          notes,
          before,
          await record(access, input.id, client)
        )
      })
    },
  }
}
