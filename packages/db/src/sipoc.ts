import type { PoolClient } from "pg"
import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"
import { listIsoDocumentStaff } from "./iso-document-staff"
import {
  parseSipoc,
  sipocText,
  validateSipocSubmission,
  type SipocFields,
} from "./sipoc-domain"
export type SipocAccess = {
  organizationId: string
  userId: string
  userName: string
  canRead: boolean
  canManage: boolean
  canApprove: boolean
}
export type SipocRecord = {
  id: string
  number: number
  fields: SipocFields
  ownerName: string | null
  status: "Draft" | "Submitted" | "Approved" | "Returned"
  version: number
  revision: number
  approvedRevision: number | null
  approvedReviewOn: string | null
  decisionNotes: string
  updatedAt: string
  source: Record<string, unknown> | null
}
export type SipocRevision = {
  ownerName: string
  revision: number
  fields: SipocFields
  approvedBy: string
  approvedAt: string
  notes: string
}
export type SipocHistory = {
  id: string
  eventType: string
  actorName: string
  occurredAt: string
  remarks: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}
const select = `SELECT map.id,map.record_number AS number,map.fields,owner.name AS "ownerName",map.status,map.version,map.revision,map.approved_revision AS "approvedRevision",approved.fields->>'nextReviewOn' AS "approvedReviewOn",map.decision_notes AS "decisionNotes",map.updated_at::text AS "updatedAt",map.source_payload AS source FROM document_control.sipoc_maps map LEFT JOIN identity.users owner ON owner.id=(map.fields->>'ownerUserId')::uuid LEFT JOIN document_control.sipoc_revisions approved ON approved.organization_id=map.organization_id AND approved.map_id=map.id AND approved.revision=map.approved_revision`
function read(access: SipocAccess) {
  if (!access.canRead && !access.canManage && !access.canApprove)
    throw new Error("SIPOC access is required.")
}
export function createSipocRepository(options: RepositoryPoolOptions) {
  const { pool, close } = repositoryPool(options)
  async function record(
    access: SipocAccess,
    id: string,
    client: Pick<PoolClient, "query"> = pool,
    lock = false
  ) {
    read(access)
    return (
      (
        await client.query<SipocRecord>(
          `${select} WHERE map.organization_id=$1 AND map.id=$2 ${lock ? "FOR UPDATE OF map" : ""}`,
          [access.organizationId, id]
        )
      ).rows[0] ?? null
    )
  }
  async function audit(
    client: PoolClient,
    access: SipocAccess,
    id: string,
    event: string,
    remarks: string,
    before: unknown,
    after: unknown
  ) {
    await client.query(
      `INSERT INTO audit.events(organization_id,event_type,target_schema,target_table,target_id,actor_user_id,reason,before_state,after_state,metadata,source_system,source_table,source_id) VALUES($1,$2,'document_control','sipoc_maps',$3,$4,$5,$6,$7,$8,'mrm-dashboard','sipoc',gen_random_uuid()::text)`,
      [
        access.organizationId,
        `sipoc.${event}`,
        id,
        access.userId,
        remarks,
        before,
        after,
        { actorName: access.userName },
      ]
    )
  }
  async function current(
    client: PoolClient,
    access: SipocAccess,
    id: string,
    version: number
  ) {
    const row = await record(access, id, client, true)
    if (!row) throw new Error("Process map was not found.")
    if (row.version !== version)
      throw new Error("This map changed. Refresh before saving.")
    return row
  }
  return {
    close,
    async organizationId() {
      const row = (
        await pool.query<{ id: string }>(
          "SELECT id FROM core.organizations WHERE lower(code)='mrmpl'"
        )
      ).rows[0]
      if (!row) throw new Error("MRMPL organization is unavailable.")
      return row.id
    },
    owners: (organizationId: string) =>
      listIsoDocumentStaff(pool, organizationId),
    async list(access: SipocAccess) {
      read(access)
      return (
        await pool.query<SipocRecord>(
          `${select} WHERE map.organization_id=$1 ORDER BY map.record_number DESC`,
          [access.organizationId]
        )
      ).rows
    },
    async dossier(access: SipocAccess, id: string) {
      const entry = await record(access, id)
      if (!entry) return null
      const [revisions, history] = await Promise.all([
        pool.query<SipocRevision>(
          `SELECT revision,fields,owner_name AS "ownerName",actor.name AS "approvedBy",approved_at::text AS "approvedAt",notes FROM document_control.sipoc_revisions JOIN identity.users actor ON actor.id=approved_by_user_id WHERE organization_id=$1 AND map_id=$2 ORDER BY revision DESC`,
          [access.organizationId, id]
        ),
        pool.query<SipocHistory>(
          `SELECT event.id,event.event_type AS "eventType",COALESCE(actor.name,event.metadata->>'actorName','System') AS "actorName",event.occurred_at::text AS "occurredAt",event.reason AS remarks,event.before_state AS before,event.after_state AS after FROM audit.events event LEFT JOIN identity.users actor ON actor.id=event.actor_user_id WHERE event.organization_id=$1 AND event.target_schema='document_control' AND event.target_table='sipoc_maps' AND event.target_id=$2 ORDER BY event.occurred_at DESC,event.id DESC`,
          [access.organizationId, id]
        ),
      ])
      return { entry, revisions: revisions.rows, history: history.rows }
    },
    async save(
      access: SipocAccess,
      input: { id?: string; version?: number; fields: unknown; reason: string }
    ) {
      if (!access.canManage)
        throw new Error("SIPOC preparation permission is required.")
      const fields = parseSipoc(input.fields),
        reason = sipocText(input.reason)
      return withTransaction(pool, async (client) => {
        const before = input.id
          ? await current(client, access, input.id, input.version ?? 0)
          : null
        if (before?.status === "Submitted")
          throw new Error(
            "QA must decide the submitted map before it can change."
          )
        if (before && !reason)
          throw new Error("Record the reason for this change.")
        if (
          fields.ownerUserId &&
          !(await listIsoDocumentStaff(client, access.organizationId)).some(
            (owner) => owner.id === fields.ownerUserId
          )
        )
          throw new Error("Select an active staff member as process owner.")
        const result = before
          ? await client.query<{ id: string }>(
              `UPDATE document_control.sipoc_maps SET fields=$3,status='Draft',revision=revision+CASE WHEN status='Approved' THEN 1 ELSE 0 END,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2 RETURNING id`,
              [access.organizationId, before.id, fields]
            )
          : await client.query<{ id: string }>(
              `INSERT INTO document_control.sipoc_maps(organization_id,fields,created_by_user_id) VALUES($1,$2,$3) RETURNING id`,
              [access.organizationId, fields, access.userId]
            )
        const id = result.rows[0]!.id
        await audit(
          client,
          access,
          id,
          before ? "draft_saved" : "created",
          reason || "Created draft process map",
          before,
          await record(access, id, client)
        )
        return id
      })
    },
    async transition(
      access: SipocAccess,
      input: {
        id: string
        version: number
        action: "submit" | "approve" | "return"
        notes: string
      }
    ) {
      if (input.action === "submit" ? !access.canManage : !access.canApprove)
        throw new Error(
          input.action === "submit"
            ? "SIPOC preparation permission is required."
            : "QA approval permission is required."
        )
      const notes = sipocText(input.notes)
      return withTransaction(pool, async (client) => {
        const before = await current(client, access, input.id, input.version)
        const status =
          input.action === "submit"
            ? "Submitted"
            : input.action === "approve"
              ? "Approved"
              : "Returned"
        if (input.action === "submit") {
          if (!["Draft", "Returned"].includes(before.status))
            throw new Error("Only a draft or returned map can be submitted.")
          validateSipocSubmission(before.fields)
          if (
            !(await listIsoDocumentStaff(client, access.organizationId)).some(
              (owner) => owner.id === before.fields.ownerUserId
            )
          )
            throw new Error(
              "Confirm an active process owner before submission."
            )
        } else {
          if (before.status !== "Submitted")
            throw new Error("Only a submitted map can receive a QA decision.")
          if (!notes)
            throw new Error(
              "Record QA review findings or the reason for return."
            )
          if (input.action === "approve") {
            validateSipocSubmission(before.fields)
            if (
              !(await listIsoDocumentStaff(client, access.organizationId)).some(
                (owner) => owner.id === before.fields.ownerUserId
              )
            )
              throw new Error(
                "Confirm an active process owner before approval."
              )
            await client.query(
              `INSERT INTO document_control.sipoc_revisions(organization_id,map_id,revision,fields,approved_by_user_id,notes,owner_name) VALUES($1,$2,$3,$4,$5,$6,$7)`,
              [
                access.organizationId,
                input.id,
                before.revision,
                before.fields,
                access.userId,
                notes,
                before.ownerName,
              ]
            )
          }
        }
        await client.query(
          `UPDATE document_control.sipoc_maps SET status=$3,approved_revision=CASE WHEN $3='Approved' THEN revision ELSE approved_revision END,decision_notes=CASE WHEN $3='Submitted' THEN decision_notes ELSE $4 END,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2`,
          [access.organizationId, input.id, status, notes]
        )
        await audit(
          client,
          access,
          input.id,
          input.action,
          notes || "Submitted for QA review",
          before,
          await record(access, input.id, client)
        )
      })
    },
  }
}
