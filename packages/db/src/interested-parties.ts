import type { PoolClient } from "pg"
import { listIsoDocumentStaff } from "./iso-document-staff"
import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"
import {
  InterestedPartiesError,
  monitoringDate,
  monitoringText,
  parseMonitoringFields,
  parseRequirementFields,
  type MonitoringFields,
  type RequirementFields,
  type RequirementSource,
} from "./interested-parties-domain"

export type InterestedPartiesAccess = {
  organizationId: string
  userId: string
  userName: string
  canReadAll: boolean
  canManage: boolean
  canVerify: boolean
}
export type InterestedPartyRequirement = RequirementFields & {
  id: string
  number: number
  ownerName: string | null
  version: number
  planRevision: number
  pendingReviewId: string | null
  latestReviewStatus: "Submitted" | "Verified" | "Returned" | null
  verifiedOutcome: MonitoringFields["outcome"] | null
  verifiedOn: string | null
  verifiedPlanRevision: number | null
  followUp: string | null
  followUpDueOn: string | null
  source: RequirementSource | null
  createdAt: string
  updatedAt: string
}
export type InterestedPartyMonitoring = MonitoringFields & {
  id: string
  requirementId: string
  planRevision: number
  planSnapshot: RequirementFields & { number: number; ownerName: string | null }
  status: "Submitted" | "Verified" | "Returned"
  recordedBy: string
  recordedAt: string
  decidedBy: string | null
  decidedAt: string | null
  decisionNotes: string
  nextReviewOn: string | null
}
export type InterestedPartiesHistory = {
  id: string
  eventType: string
  actorName: string
  occurredAt: string
  remarks: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}
const columns = `r.id, r.record_number AS number, r.party_group AS "partyGroup", r.party_type AS "partyType", r.scope,
  r.requirement, r.basis, r.source_reference AS "sourceReference", r.relevance, r.relevance_reason AS "relevanceReason",
  r.department, r.owner_user_id AS "ownerUserId", owner.name AS "ownerName", r.acceptance_criteria AS "acceptanceCriteria",
  r.monitoring_method AS "monitoringMethod", r.frequency, r.next_review_on::text AS "nextReviewOn", r.identified_on::text AS "identifiedOn",
  r.climate_notes AS "climateNotes", r.related_reference AS "relatedReference", r.lifecycle, r.inactive_reason AS "inactiveReason",
  r.version, r.plan_revision AS "planRevision", pending.id AS "pendingReviewId", latest.status AS "latestReviewStatus",
  verified.outcome AS "verifiedOutcome", verified.observed_on::text AS "verifiedOn", verified.plan_revision AS "verifiedPlanRevision",
  verified.follow_up AS "followUp", verified.follow_up_due_on::text AS "followUpDueOn", r.source_payload AS source,
  r.created_at::text AS "createdAt", r.updated_at::text AS "updatedAt"`
const joins = `FROM document_control.interested_party_requirements r LEFT JOIN identity.users owner ON owner.id=r.owner_user_id
  LEFT JOIN document_control.interested_party_monitoring verified ON verified.id=r.last_verified_review_id
  LEFT JOIN document_control.interested_party_monitoring pending ON pending.requirement_id=r.id AND pending.status='Submitted'
  LEFT JOIN LATERAL (SELECT status FROM document_control.interested_party_monitoring WHERE requirement_id=r.id ORDER BY recorded_at DESC, id DESC LIMIT 1) latest ON true`
const reviewColumns = `v.id, v.requirement_id AS "requirementId", v.plan_revision AS "planRevision", v.plan_snapshot AS "planSnapshot",
  v.observed_on::text AS "observedOn", v.observations, v.evidence, v.outcome, v.follow_up AS "followUp", v.follow_up_due_on::text AS "followUpDueOn",
  v.related_reference AS "relatedReference", v.status, recorder.name AS "recordedBy", v.recorded_at::text AS "recordedAt",
  decider.name AS "decidedBy", v.decided_at::text AS "decidedAt", v.decision_notes AS "decisionNotes", v.next_review_on::text AS "nextReviewOn"`
const reviewJoins = `FROM document_control.interested_party_monitoring v JOIN identity.users recorder ON recorder.id=v.recorded_by_user_id
  LEFT JOIN identity.users decider ON decider.id=v.decided_by_user_id`
function all(access: InterestedPartiesAccess) {
  return access.canReadAll || access.canManage || access.canVerify
}
function version(record: InterestedPartyRequirement, expected: number) {
  if (record.version !== expected)
    throw new InterestedPartiesError(
      "This requirement changed. Refresh before saving."
    )
}
export function createInterestedPartiesRepository(
  options: RepositoryPoolOptions
) {
  const { pool, close } = repositoryPool(options)
  async function record(
    access: InterestedPartiesAccess,
    id: string,
    client: Pick<PoolClient, "query"> = pool,
    lock = false
  ) {
    const result = await client.query<InterestedPartyRequirement>(
      `SELECT ${columns} ${joins}
      WHERE r.organization_id=$1 AND r.id=$2 AND ($3::boolean OR r.owner_user_id=$4) ${lock ? "FOR UPDATE OF r" : ""}`,
      [access.organizationId, id, all(access), access.userId]
    )
    return result.rows[0] ?? null
  }
  async function audit(
    client: PoolClient,
    access: InterestedPartiesAccess,
    id: string,
    event: string,
    remarks: string,
    before: unknown,
    after: unknown
  ) {
    await client.query(
      `INSERT INTO audit.events (organization_id,event_type,target_schema,target_table,target_id,actor_user_id,reason,before_state,after_state,metadata,source_system,source_table,source_id)
      VALUES ($1,$2,'document_control','interested_party_requirements',$3,$4,$5,$6,$7,$8,'mrm-dashboard','interested_parties',gen_random_uuid()::text)`,
      [
        access.organizationId,
        `interested_parties.${event}`,
        id,
        access.userId,
        remarks,
        before,
        after,
        { actorName: access.userName },
      ]
    )
  }
  return {
    close,
    async organizationId() {
      const result = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code)='mrmpl'"
      )
      if (!result.rows[0])
        throw new InterestedPartiesError("MRMPL organization is unavailable.")
      return result.rows[0].id
    },
    owners: (organizationId: string) =>
      listIsoDocumentStaff(pool, organizationId),
    async list(access: InterestedPartiesAccess) {
      return (
        await pool.query<InterestedPartyRequirement>(
          `SELECT ${columns} ${joins} WHERE r.organization_id=$1
        AND ($2::boolean OR r.owner_user_id=$3) ORDER BY r.record_number DESC`,
          [access.organizationId, all(access), access.userId]
        )
      ).rows
    },
    async dossier(access: InterestedPartiesAccess, id: string) {
      const entry = await record(access, id)
      if (!entry) return null
      const [reviews, history] = await Promise.all([
        pool.query<InterestedPartyMonitoring>(
          `SELECT ${reviewColumns} ${reviewJoins} WHERE v.organization_id=$1 AND v.requirement_id=$2 ORDER BY v.recorded_at DESC,v.id DESC`,
          [access.organizationId, id]
        ),
        pool.query<InterestedPartiesHistory>(
          `SELECT event.id,event.event_type AS "eventType",COALESCE(actor.name,event.metadata->>'actorName','System') AS "actorName",
          event.occurred_at::text AS "occurredAt",event.reason AS remarks,event.before_state AS before,event.after_state AS after
          FROM audit.events event LEFT JOIN identity.users actor ON actor.id=event.actor_user_id
          WHERE event.organization_id=$1 AND event.target_schema='document_control' AND event.target_table='interested_party_requirements' AND event.target_id=$2
          ORDER BY event.occurred_at DESC,event.id DESC`,
          [access.organizationId, id]
        ),
      ])
      return { entry, reviews: reviews.rows, history: history.rows }
    },
    async monitoringRegister(access: InterestedPartiesAccess) {
      return (
        await pool.query<InterestedPartyMonitoring>(
          `SELECT ${reviewColumns} ${reviewJoins}
        JOIN document_control.interested_party_requirements r ON r.organization_id=v.organization_id AND r.id=v.requirement_id
        WHERE v.organization_id=$1 AND ($2::boolean OR r.owner_user_id=$3) ORDER BY v.recorded_at DESC,v.id DESC`,
          [access.organizationId, all(access), access.userId]
        )
      ).rows
    },
    async save(
      access: InterestedPartiesAccess,
      input: unknown,
      existing?: { id: string; version: number; reason: string }
    ) {
      if (!access.canManage)
        throw new InterestedPartiesError(
          "QA manage requirements permission is required."
        )
      const fields = parseRequirementFields(input)
      if (
        fields.ownerUserId &&
        !(await listIsoDocumentStaff(pool, access.organizationId)).some(
          (staff) => staff.id === fields.ownerUserId
        )
      )
        throw new InterestedPartiesError(
          "Choose an active responsible staff account."
        )
      return withTransaction(pool, async (client) => {
        const before = existing
          ? await record(access, existing.id, client, true)
          : null
        if (existing && !before)
          throw new InterestedPartiesError("Requirement was not found.")
        if (before && existing) {
          version(before, existing.version)
          if (before.pendingReviewId)
            throw new InterestedPartiesError(
              "Verify or return the submitted monitoring result before changing the plan."
            )
        }
        const reason = monitoringText(
          existing?.reason,
          "Reason for changes",
          Boolean(existing)
        )
        const values = [
          access.organizationId,
          fields.partyGroup,
          fields.partyType,
          fields.scope,
          fields.requirement,
          fields.basis,
          fields.sourceReference,
          fields.relevance,
          fields.relevanceReason,
          fields.department,
          fields.ownerUserId,
          fields.acceptanceCriteria,
          fields.monitoringMethod,
          fields.frequency,
          fields.nextReviewOn,
          fields.identifiedOn,
          fields.climateNotes,
          fields.relatedReference,
          fields.lifecycle,
          fields.inactiveReason,
        ]
        const id = existing
          ? existing.id
          : (
              await client.query<{ id: string }>(
                `INSERT INTO document_control.interested_party_requirements
          (organization_id,party_group,party_type,scope,requirement,basis,source_reference,relevance,relevance_reason,department,owner_user_id,acceptance_criteria,
          monitoring_method,frequency,next_review_on,identified_on,climate_notes,related_reference,lifecycle,inactive_reason,created_by_user_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
                [...values, access.userId]
              )
            ).rows[0]!.id
        if (existing)
          await client.query(
            `UPDATE document_control.interested_party_requirements SET party_group=$2,party_type=$3,scope=$4,requirement=$5,basis=$6,
          source_reference=$7,relevance=$8,relevance_reason=$9,department=$10,owner_user_id=$11,acceptance_criteria=$12,monitoring_method=$13,frequency=$14,
          next_review_on=$15,identified_on=$16,climate_notes=$17,related_reference=$18,lifecycle=$19,inactive_reason=$20,
          plan_revision=plan_revision+1,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$21`,
            [...values, id]
          )
        await audit(
          client,
          access,
          id,
          existing ? "plan_changed" : "created",
          reason || "Created requirement",
          before,
          await record(access, id, client)
        )
        return id
      })
    },
    async submitMonitoring(
      access: InterestedPartiesAccess,
      input: { id: string; version: number; fields: unknown }
    ) {
      const fields = parseMonitoringFields(input.fields)
      return withTransaction(pool, async (client) => {
        const before = await record(access, input.id, client, true)
        if (!before)
          throw new InterestedPartiesError("Requirement was not found.")
        version(before, input.version)
        if (!access.canManage && before.ownerUserId !== access.userId)
          throw new InterestedPartiesError(
            "Only the responsible staff member or QA manager can record monitoring."
          )
        if (before.lifecycle !== "Active")
          throw new InterestedPartiesError(
            "Complete and activate the monitoring plan first."
          )
        if (before.pendingReviewId)
          throw new InterestedPartiesError(
            "A monitoring result is already awaiting QA."
          )
        if (before.verifiedOn && fields.observedOn < before.verifiedOn)
          throw new InterestedPartiesError(
            "Monitoring cannot precede the latest verified monitoring date."
          )
        const result = await client.query<{ id: string }>(
          `INSERT INTO document_control.interested_party_monitoring
          (organization_id,requirement_id,plan_revision,plan_snapshot,observed_on,observations,evidence,outcome,follow_up,follow_up_due_on,related_reference,recorded_by_user_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
          [
            access.organizationId,
            input.id,
            before.planRevision,
            before,
            fields.observedOn,
            fields.observations,
            fields.evidence,
            fields.outcome,
            fields.followUp,
            fields.followUpDueOn,
            fields.relatedReference,
            access.userId,
          ]
        )
        await client.query(
          "UPDATE document_control.interested_party_requirements SET version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2",
          [access.organizationId, input.id]
        )
        await audit(
          client,
          access,
          input.id,
          "monitoring_submitted",
          "Monitoring submitted for QA",
          null,
          {
            ...fields,
            reviewId: result.rows[0]!.id,
            planRevision: before.planRevision,
            recordedBy: access.userName,
          }
        )
        return result.rows[0]!.id
      })
    },
    async decideMonitoring(
      access: InterestedPartiesAccess,
      input: {
        id: string
        version: number
        reviewId: string
        decision: "verify" | "return"
        notes: string
        nextReviewOn?: string
      }
    ) {
      if (!access.canVerify)
        throw new InterestedPartiesError(
          "QA verification permission is required."
        )
      const notes = monitoringText(
        input.notes,
        "QA findings / decision reason",
        true
      )
      const nextReviewOn =
        input.decision === "verify" ? monitoringDate(input.nextReviewOn) : null
      return withTransaction(pool, async (client) => {
        const requirement = await record(access, input.id, client, true)
        if (!requirement)
          throw new InterestedPartiesError("Requirement was not found.")
        version(requirement, input.version)
        const result = await client.query<InterestedPartyMonitoring>(
          `SELECT ${reviewColumns} ${reviewJoins} WHERE v.organization_id=$1 AND v.requirement_id=$2 AND v.id=$3 FOR UPDATE OF v`,
          [access.organizationId, input.id, input.reviewId]
        )
        const before = result.rows[0]
        if (!before || before.status !== "Submitted")
          throw new InterestedPartiesError(
            "This result is no longer awaiting QA."
          )
        if (
          input.decision === "verify" &&
          (requirement.lifecycle !== "Active" ||
            before.planRevision !== requirement.planRevision)
        )
          throw new InterestedPartiesError(
            "The monitoring plan changed. Return this result and monitor against the current plan."
          )
        if (
          input.decision === "verify" &&
          (!nextReviewOn || nextReviewOn <= before.observedOn)
        )
          throw new InterestedPartiesError(
            "Choose the next review date after the actual monitoring date."
          )
        const status = input.decision === "verify" ? "Verified" : "Returned"
        await client.query(
          `UPDATE document_control.interested_party_monitoring SET status=$4,decision_notes=$5,decided_by_user_id=$6,decided_at=now(),next_review_on=$7 WHERE organization_id=$1 AND requirement_id=$2 AND id=$3`,
          [
            access.organizationId,
            input.id,
            input.reviewId,
            status,
            notes,
            access.userId,
            nextReviewOn,
          ]
        )
        await client.query(
          `UPDATE document_control.interested_party_requirements SET
          last_verified_review_id=CASE WHEN $3='Verified' THEN $4 ELSE last_verified_review_id END,
          next_review_on=CASE WHEN $3='Verified' THEN $5 ELSE next_review_on END,work_target_on=CASE WHEN $3='Verified' THEN NULL ELSE work_target_on END,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2`,
          [
            access.organizationId,
            input.id,
            status,
            input.reviewId,
            nextReviewOn,
          ]
        )
        await audit(
          client,
          access,
          input.id,
          `monitoring_${input.decision}`,
          notes,
          before,
          {
            ...before,
            status,
            decisionNotes: notes,
            decidedBy: access.userName,
            nextReviewOn,
          }
        )
      })
    },
  }
}
