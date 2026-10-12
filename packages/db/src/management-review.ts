import type { PoolClient } from "pg"
import { nextAnalysisStatus, type AnalysisStatus } from "./iso-analysis-domain"
import { listIsoDocumentStaff } from "./iso-document-staff"
import {
  ManagementReviewError,
  parseMeetingFields,
  parseReviewActionFields,
  reviewText,
  validateReviewSubmission,
  type MeetingFields,
  type ReviewActionOperation,
  type ReviewActionSnapshot,
  type ReviewSource,
} from "./management-review-domain"
import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"

export type ManagementReviewAccess = {
  organizationId: string
  userId: string
  userName: string
  canReadAll: boolean
  canManage: boolean
  canApprove: boolean
  canVerify: boolean
}
export type ManagementReviewRecord = MeetingFields & {
  id: string
  ownerUserId: string | null
  number: number
  chairName: string | null
  status: "Draft" | "For Approval" | "Approved"
  approvedAt: string | null
  approvedBy: string | null
  approvalNotes: string
  version: number
  source: ReviewSource | null
  createdAt: string
  updatedAt: string
}
export type ManagementReviewAction = ReviewActionSnapshot & {
  originMeetingId: string
  originMeetingNumber: number
  originMeetingDate: string
  completedAt: string | null
  completedBy: string | null
  closedAt: string | null
  closedBy: string | null
  version: number
  source: Record<string, string> | null
  createdAt: string
  updatedAt: string
}
export type ManagementReviewHistory = {
  id: string
  eventType: string
  actorName: string
  occurredAt: string
  remarks: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}
export type ManagementReviewActionReview = {
  id: string
  meetingId: string
  meetingNumber: number
  heldOn: string
  actionId: string
  notes: string
  snapshot: ReviewActionSnapshot
  reviewedBy: string | null
  reviewedAt: string
}

const meetingColumns = `m.id, m.owner_user_id AS "ownerUserId", m.record_number AS number, m.title, m.held_on::text AS "heldOn", m.start_time AS "startTime", m.end_time AS "endTime", m.location,
  m.period_start::text AS "periodStart", m.period_end::text AS "periodEnd", m.next_review_on::text AS "nextReviewOn", m.chair_user_id AS "chairUserId", chair.name AS "chairName",
  m.attendees, m.agenda, m.suitability, m.adequacy, m.effectiveness, m.improvement_decisions AS "improvementDecisions", m.qms_changes AS "qmsChanges", m.resource_decisions AS "resourceDecisions",
  m.status, m.approved_at::text AS "approvedAt", approved.name AS "approvedBy", m.approval_notes AS "approvalNotes", m.version, m.source_payload AS source,
  m.created_at::text AS "createdAt", m.updated_at::text AS "updatedAt"`
const meetingJoins = `FROM document_control.management_reviews m LEFT JOIN identity.users chair ON chair.id=m.chair_user_id LEFT JOIN identity.users approved ON approved.id=m.approved_by_user_id`
const meetingScope = `( $3::boolean OR m.owner_user_id=$4 OR m.chair_user_id=$4 OR m.attendees @> jsonb_build_array(jsonb_build_object('userId',$4::text)) OR EXISTS (
  SELECT 1 FROM document_control.management_review_action_reviews link JOIN document_control.management_review_actions action ON action.id=link.action_id
  WHERE link.meeting_id=m.id AND action.owner_user_id=$4))`
const actionColumns = `a.id, a.record_number AS number, a.origin_meeting_id AS "originMeetingId", origin.record_number AS "originMeetingNumber", origin.held_on::text AS "originMeetingDate",
  a.topic_key AS "topicKey", a.description, a.expected_outcome AS "expectedOutcome", a.department, a.owner_user_id AS "ownerUserId", owner.name AS "ownerName", a.due_on::text AS "dueOn", a.priority, a.evidence_reference AS "evidenceReference",
  a.status, a.completion_notes AS "completionNotes", a.evidence_location AS "evidenceLocation", a.effectiveness_notes AS "effectivenessNotes",
  a.completed_at::text AS "completedAt", completed.name AS "completedBy", a.closed_at::text AS "closedAt", closed.name AS "closedBy", a.version, a.source_payload AS source,
  a.created_at::text AS "createdAt", a.updated_at::text AS "updatedAt"`
const actionJoins = `FROM document_control.management_review_actions a JOIN document_control.management_reviews origin ON origin.id=a.origin_meeting_id
  LEFT JOIN identity.users owner ON owner.id=a.owner_user_id LEFT JOIN identity.users completed ON completed.id=a.completed_by_user_id LEFT JOIN identity.users closed ON closed.id=a.closed_by_user_id`
function canReadAll(access: ManagementReviewAccess) {
  return (
    access.canReadAll ||
    access.canManage ||
    access.canApprove ||
    access.canVerify
  )
}
function checkVersion(actual: number, expected: number) {
  if (actual !== expected)
    throw new ManagementReviewError(
      "This record changed. Refresh before saving."
    )
}

export function createManagementReviewRepository(
  options: RepositoryPoolOptions
) {
  const { pool, close } = repositoryPool(options)
  async function meeting(
    access: ManagementReviewAccess,
    id: string,
    client: Pick<PoolClient, "query"> = pool,
    lock = false
  ) {
    const result = await client.query<ManagementReviewRecord>(
      `SELECT ${meetingColumns} ${meetingJoins} WHERE m.organization_id=$1 AND m.id=$2 AND ${meetingScope} ${lock ? "FOR UPDATE OF m" : ""}`,
      [access.organizationId, id, canReadAll(access), access.userId]
    )
    return result.rows[0] ?? null
  }
  async function action(
    access: ManagementReviewAccess,
    id: string,
    client: Pick<PoolClient, "query"> = pool,
    lock = false
  ) {
    const result = await client.query<ManagementReviewAction>(
      `SELECT ${actionColumns} ${actionJoins} WHERE a.organization_id=$1 AND a.id=$2 AND ($3::boolean OR a.owner_user_id=$4) ${lock ? "FOR UPDATE OF a" : ""}`,
      [access.organizationId, id, canReadAll(access), access.userId]
    )
    return result.rows[0] ?? null
  }
  async function reviews(
    access: ManagementReviewAccess,
    target: "meeting_id" | "action_id",
    id: string,
    client: Pick<PoolClient, "query"> = pool
  ) {
    const result = await client.query<ManagementReviewActionReview>(
      `SELECT r.id, r.meeting_id AS "meetingId", m.record_number AS "meetingNumber", m.held_on::text AS "heldOn",
      r.action_id AS "actionId", r.notes, r.action_snapshot AS snapshot, actor.name AS "reviewedBy", r.reviewed_at::text AS "reviewedAt"
      FROM document_control.management_review_action_reviews r JOIN document_control.management_reviews m ON m.id=r.meeting_id LEFT JOIN identity.users actor ON actor.id=r.reviewed_by_user_id
      WHERE r.organization_id=$1 AND r.${target}=$2 ORDER BY m.held_on DESC, r.reviewed_at DESC`,
      [access.organizationId, id]
    )
    return result.rows
  }
  async function history(
    access: ManagementReviewAccess,
    table: "management_reviews" | "management_review_actions",
    id: string
  ) {
    const result = await pool.query<ManagementReviewHistory>(
      `SELECT e.id, e.event_type AS "eventType", COALESCE(e.metadata->>'actorName',u.name,'Source import') AS "actorName", e.occurred_at::text AS "occurredAt", COALESCE(e.reason,'') AS remarks, e.before_state AS before, e.after_state AS after
      FROM audit.events e LEFT JOIN identity.users u ON u.id=e.actor_user_id WHERE e.organization_id=$1 AND e.target_schema='document_control' AND e.target_table=$2 AND e.target_id=$3 ORDER BY e.occurred_at DESC,e.id DESC`,
      [access.organizationId, table, id]
    )
    return result.rows
  }
  async function audit(
    client: PoolClient,
    access: ManagementReviewAccess,
    table: "management_reviews" | "management_review_actions",
    id: string,
    operation: string,
    notes: string,
    before: unknown,
    after: unknown
  ) {
    await client.query(
      `INSERT INTO audit.events (organization_id,event_type,target_schema,target_table,target_id,actor_user_id,reason,before_state,after_state,metadata,source_system,source_table,source_id)
      VALUES ($1,$2,'document_control',$3,$4,$5,$6,$7,$8,$9,'mrm-dashboard','management-review',gen_random_uuid()::text)`,
      [
        access.organizationId,
        `management_review.${operation}`,
        table,
        id,
        access.userId,
        notes,
        before,
        after,
        { actorName: access.userName },
      ]
    )
  }
  async function requireDraft(
    access: ManagementReviewAccess,
    id: string,
    version: number,
    client: PoolClient
  ) {
    const entry = await meeting(access, id, client, true)
    if (!entry) throw new ManagementReviewError("Meeting was not found.")
    if (!access.canManage && entry.ownerUserId !== access.userId)
      throw new ManagementReviewError(
        "Only the assigned coordinator may prepare these minutes."
      )
    checkVersion(entry.version, version)
    if (entry.status !== "Draft")
      throw new ManagementReviewError(
        "Return or reopen the minutes before changing discussions or linked actions."
      )
    return entry
  }
  async function validateStaff(
    organizationId: string,
    ids: Array<string | null>
  ) {
    const staff = await listIsoDocumentStaff(pool, organizationId)
    if (ids.some((id) => id && !staff.some((person) => person.id === id)))
      throw new ManagementReviewError(
        "Choose active staff accounts for the chair, participants and responsible person."
      )
    return staff
  }
  return {
    close,
    staff: (organizationId: string) =>
      listIsoDocumentStaff(pool, organizationId),
    async organizationId() {
      const result = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code)='mrmpl'"
      )
      if (!result.rows[0])
        throw new ManagementReviewError("MRMPL organization is unavailable.")
      return result.rows[0].id
    },
    async listMeetings(access: ManagementReviewAccess) {
      const result = await pool.query<ManagementReviewRecord>(
        `SELECT ${meetingColumns} ${meetingJoins} WHERE m.organization_id=$1 AND ${meetingScope.replaceAll("$3", "$2").replaceAll("$4", "$3")} ORDER BY m.held_on DESC,m.record_number DESC`,
        [access.organizationId, canReadAll(access), access.userId]
      )
      return result.rows
    },
    async listActions(access: ManagementReviewAccess) {
      const result = await pool.query<ManagementReviewAction>(
        `SELECT ${actionColumns} ${actionJoins} WHERE a.organization_id=$1 AND ($2::boolean OR a.owner_user_id=$3) ORDER BY (a.status='Closed'), a.due_on NULLS LAST,a.record_number`,
        [access.organizationId, canReadAll(access), access.userId]
      )
      return result.rows
    },
    async meetingDossier(access: ManagementReviewAccess, id: string) {
      const entry = await meeting(access, id)
      if (!entry) return null
      const [actionReviews, events] = await Promise.all([
        reviews(access, "meeting_id", id),
        history(access, "management_reviews", id),
      ])
      return { entry, actionReviews, history: events }
    },
    async actionDossier(access: ManagementReviewAccess, id: string) {
      const entry = await action(access, id)
      if (!entry) return null
      const [actionReviews, events] = await Promise.all([
        reviews(access, "action_id", id),
        history(access, "management_review_actions", id),
      ])
      return { entry, actionReviews, history: events }
    },
    async saveMeeting(
      access: ManagementReviewAccess,
      input: unknown,
      existing?: { id: string; version: number; reason: string }
    ) {
      if (!access.canManage && !existing)
        throw new ManagementReviewError(
          "Prepare Management Reviews permission is required."
        )
      const fields = parseMeetingFields(input)
      const staff = await validateStaff(access.organizationId, [
        fields.chairUserId,
        ...fields.attendees.map((person) => person.userId),
      ])
      fields.attendees = fields.attendees.map((person) => ({
        ...person,
        name:
          staff.find((item) => item.id === person.userId)?.name ?? person.name,
      }))
      const values = [
        fields.title,
        fields.heldOn,
        fields.startTime,
        fields.endTime,
        fields.location,
        fields.periodStart,
        fields.periodEnd,
        fields.nextReviewOn,
        fields.chairUserId,
        JSON.stringify(fields.attendees),
        JSON.stringify(fields.agenda),
        fields.suitability,
        fields.adequacy,
        fields.effectiveness,
        fields.improvementDecisions,
        fields.qmsChanges,
        fields.resourceDecisions,
      ]
      return withTransaction(pool, async (client) => {
        let id: string,
          before: ManagementReviewRecord | null = null
        if (existing) {
          before = await requireDraft(
            access,
            existing.id,
            existing.version,
            client
          )
          reviewText(existing.reason, "reason for changes", true)
          id = existing.id
          await client.query(
            `UPDATE document_control.management_reviews SET title=$3,held_on=$4,start_time=$5,end_time=$6,location=$7,period_start=$8,period_end=$9,next_review_on=$10,chair_user_id=$11,attendees=$12,agenda=$13,suitability=$14,adequacy=$15,effectiveness=$16,improvement_decisions=$17,qms_changes=$18,resource_decisions=$19,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2`,
            [access.organizationId, id, ...values]
          )
        } else {
          const result = await client.query<{ id: string }>(
            `INSERT INTO document_control.management_reviews (organization_id,created_by_user_id,title,held_on,start_time,end_time,location,period_start,period_end,next_review_on,chair_user_id,attendees,agenda,suitability,adequacy,effectiveness,improvement_decisions,qms_changes,resource_decisions) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
            [access.organizationId, access.userId, ...values]
          )
          id = result.rows[0]!.id
        }
        await audit(
          client,
          access,
          "management_reviews",
          id,
          existing ? "edited" : "created",
          existing?.reason.trim() ?? "Created meeting draft",
          before,
          await meeting(access, id, client)
        )
        return id
      })
    },
    async decideMinutes(
      access: ManagementReviewAccess,
      input: {
        id: string
        version: number
        operation: "submit" | "approve" | "return" | "reopen"
        notes: string
      }
    ) {
      if (input.operation !== "submit" && !access.canApprove)
        throw new ManagementReviewError(
          "QA Approve Minutes permission is required."
        )
      const notes = reviewText(input.notes, "decision remarks", true)
      return withTransaction(pool, async (client) => {
        const before = await meeting(access, input.id, client, true)
        if (!before) throw new ManagementReviewError("Meeting was not found.")
        if (
          input.operation === "submit" &&
          !access.canManage &&
          before.ownerUserId !== access.userId
        )
          throw new ManagementReviewError(
            "Only the assigned coordinator may submit these minutes."
          )
        checkVersion(before.version, input.version)
        const expected = {
          submit: "Draft",
          approve: "For Approval",
          return: "For Approval",
          reopen: "Approved",
        } as const
        if (before.status !== expected[input.operation])
          throw new ManagementReviewError(
            "This minutes decision is not available in the current status."
          )
        const links = await reviews(access, "meeting_id", input.id, client)
        if (input.operation === "submit" || input.operation === "approve")
          validateReviewSubmission(
            before,
            links.map((link) => link.snapshot.topicKey)
          )
        const status =
          input.operation === "submit"
            ? "For Approval"
            : input.operation === "approve"
              ? "Approved"
              : "Draft"
        await client.query(
          `UPDATE document_control.management_reviews SET status=$3,approved_at=CASE WHEN $3='Approved' THEN now() ELSE NULL END,approved_by_user_id=CASE WHEN $3='Approved' THEN $4::uuid ELSE NULL END,approval_notes=CASE WHEN $3='Approved' THEN $5 ELSE '' END,work_target_on=CASE WHEN $3='Approved' THEN NULL ELSE work_target_on END,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2`,
          [access.organizationId, input.id, status, access.userId, notes]
        )
        await audit(
          client,
          access,
          "management_reviews",
          input.id,
          input.operation,
          notes,
          { ...before, actionReviews: links },
          { ...(await meeting(access, input.id, client)), actionReviews: links }
        )
      })
    },
    async saveAction(
      access: ManagementReviewAccess,
      input: unknown,
      context:
        | { meetingId: string; meetingVersion: number }
        | { id: string; version: number; reason: string }
    ) {
      if (!access.canManage)
        throw new ManagementReviewError(
          "Prepare Management Reviews permission is required."
        )
      const fields = parseReviewActionFields(input)
      await validateStaff(access.organizationId, [fields.ownerUserId])
      return withTransaction(pool, async (client) => {
        let id: string,
          before: ManagementReviewAction | null = null
        const values = [
          fields.topicKey,
          fields.description,
          fields.expectedOutcome,
          fields.department,
          fields.ownerUserId,
          fields.dueOn,
          fields.priority,
          fields.evidenceReference,
        ]
        if ("id" in context) {
          before = await action(access, context.id, client, true)
          if (!before) throw new ManagementReviewError("Action was not found.")
          checkVersion(before.version, context.version)
          if (before.status === "Closed")
            throw new ManagementReviewError(
              "Reopen the action before editing details."
            )
          reviewText(context.reason, "reason for changes", true)
          id = context.id
          await client.query(
            `UPDATE document_control.management_review_actions SET topic_key=$3,description=$4,expected_outcome=$5,department=$6,owner_user_id=$7,due_on=$8,priority=$9,evidence_reference=$10,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2`,
            [access.organizationId, id, ...values]
          )
        } else {
          const origin = await requireDraft(
            access,
            context.meetingId,
            context.meetingVersion,
            client
          )
          const result = await client.query<{ id: string }>(
            `INSERT INTO document_control.management_review_actions (organization_id,origin_meeting_id,topic_key,description,expected_outcome,department,owner_user_id,due_on,priority,evidence_reference,created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [access.organizationId, origin.id, ...values, access.userId]
          )
          id = result.rows[0]!.id
          const snapshot = await action(access, id, client)
          await client.query(
            `INSERT INTO document_control.management_review_action_reviews (organization_id,meeting_id,action_id,notes,action_snapshot,reviewed_by_user_id) VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              access.organizationId,
              origin.id,
              id,
              "New action raised in this meeting",
              snapshot,
              access.userId,
            ]
          )
          await client.query(
            "UPDATE document_control.management_reviews SET version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
            [origin.id, access.organizationId]
          )
          await audit(
            client,
            access,
            "management_reviews",
            origin.id,
            "action_added",
            "Raised a follow-up action",
            origin,
            { ...(await meeting(access, origin.id, client)), action: snapshot }
          )
        }
        await audit(
          client,
          access,
          "management_review_actions",
          id,
          before ? "action_edited" : "action_created",
          "reason" in context ? context.reason.trim() : "Raised meeting action",
          before,
          await action(access, id, client)
        )
        return id
      })
    },
    async reviewAction(
      access: ManagementReviewAccess,
      input: {
        meetingId: string
        meetingVersion: number
        actionId: string
        notes: string
      }
    ) {
      if (!access.canManage)
        throw new ManagementReviewError(
          "Prepare Management Reviews permission is required."
        )
      const notes = reviewText(input.notes, "action review discussion", true)
      return withTransaction(pool, async (client) => {
        const before = await requireDraft(
          access,
          input.meetingId,
          input.meetingVersion,
          client
        )
        const snapshot = await action(access, input.actionId, client, true)
        if (!snapshot) throw new ManagementReviewError("Action was not found.")
        if (snapshot.originMeetingDate > before.heldOn)
          throw new ManagementReviewError(
            "Choose an action from this meeting or an earlier meeting."
          )
        const previous = await reviews(access, "meeting_id", before.id, client)
        await client.query(
          `INSERT INTO document_control.management_review_action_reviews (organization_id,meeting_id,action_id,notes,action_snapshot,reviewed_by_user_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (meeting_id,action_id) DO UPDATE SET notes=excluded.notes,action_snapshot=excluded.action_snapshot,reviewed_by_user_id=excluded.reviewed_by_user_id,reviewed_at=now()`,
          [
            access.organizationId,
            before.id,
            snapshot.id,
            notes,
            snapshot,
            access.userId,
          ]
        )
        await client.query(
          "UPDATE document_control.management_reviews SET version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2",
          [access.organizationId, before.id]
        )
        await audit(
          client,
          access,
          "management_reviews",
          before.id,
          "action_reviewed",
          notes,
          { ...before, actionReviews: previous },
          {
            ...(await meeting(access, before.id, client)),
            actionReviews: await reviews(
              access,
              "meeting_id",
              before.id,
              client
            ),
          }
        )
        await audit(
          client,
          access,
          "management_review_actions",
          snapshot.id,
          "discussed",
          notes,
          null,
          {
            meetingId: before.id,
            meetingNumber: before.number,
            action: snapshot,
          }
        )
      })
    },
    async updateAction(
      access: ManagementReviewAccess,
      input: {
        id: string
        version: number
        operation: ReviewActionOperation
        notes: string
        evidenceLocation: string
        effectivenessNotes?: string
      }
    ) {
      const notes = reviewText(input.notes, "work/verification notes", true),
        evidence = reviewText(input.evidenceLocation, "evidence reference"),
        findings = reviewText(
          input.effectivenessNotes,
          "effectiveness findings"
        )
      return withTransaction(pool, async (client) => {
        const before = await action(access, input.id, client, true)
        if (!before) throw new ManagementReviewError("Action was not found.")
        checkVersion(before.version, input.version)
        const qaDecision = ["verify", "return", "reopen"].includes(
          input.operation
        )
        if (
          qaDecision
            ? !access.canVerify
            : !(access.canManage || before.ownerUserId === access.userId)
        )
          throw new ManagementReviewError(
            qaDecision
              ? "QA Verify Actions permission is required."
              : "Only responsible staff can record this work."
          )
        const status: AnalysisStatus = nextAnalysisStatus(
          before.status,
          input.operation
        )
        if (
          ["complete", "verify"].includes(input.operation) &&
          (!before.ownerUserId ||
            !before.dueOn ||
            !before.department ||
            before.priority === "Not assessed" ||
            !before.expectedOutcome)
        )
          throw new ManagementReviewError(
            "Record responsible department/staff, priority, deadline and expected result before completion."
          )
        if (
          input.operation === "verify" &&
          (!before.completedAt ||
            !before.completedBy ||
            !before.completionNotes ||
            !(evidence || before.evidenceLocation) ||
            !findings)
        )
          throw new ManagementReviewError(
            "Record actual completion, evidence and effectiveness findings against the expected result before QA closure."
          )
        await client.query(
          `UPDATE document_control.management_review_actions SET status=$3,completion_notes=CASE WHEN $4='complete' THEN $5 WHEN $4 IN ('return','reopen') THEN '' ELSE completion_notes END,
          evidence_location=CASE WHEN $6<>'' THEN $6 ELSE evidence_location END, completed_at=CASE WHEN $4='complete' THEN now() WHEN $4 IN ('return','reopen') THEN NULL ELSE completed_at END,
          completed_by_user_id=CASE WHEN $4='complete' THEN $7::uuid WHEN $4 IN ('return','reopen') THEN NULL ELSE completed_by_user_id END,
          closed_at=CASE WHEN $4='verify' THEN now() WHEN $4='reopen' THEN NULL ELSE closed_at END,closed_by_user_id=CASE WHEN $4='verify' THEN $7::uuid WHEN $4='reopen' THEN NULL ELSE closed_by_user_id END,
          effectiveness_notes=CASE WHEN $4='verify' THEN $8 WHEN $4 IN ('return','reopen') THEN '' ELSE effectiveness_notes END,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2`,
          [
            access.organizationId,
            input.id,
            status,
            input.operation,
            notes,
            evidence,
            access.userId,
            findings,
          ]
        )
        await audit(
          client,
          access,
          "management_review_actions",
          input.id,
          input.operation,
          notes,
          before,
          await action(access, input.id, client)
        )
      })
    },
  }
}
