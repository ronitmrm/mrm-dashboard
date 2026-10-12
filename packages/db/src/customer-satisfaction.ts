import type { PoolClient } from "pg"
import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"
import { listIsoDocumentStaff } from "./iso-document-staff"
import {
  CustomerSatisfactionError,
  parseSatisfaction,
  requireSatisfactionSubmission,
  satisfactionText,
  type SatisfactionFields,
} from "./customer-satisfaction-domain"
import type { AnalysisAccess, AnalysisHistory } from "./iso-analysis"
import type { ArtifactByteLocator } from "./artifacts"
export type SatisfactionAccess = AnalysisAccess
export type SatisfactionReport = {
  id: string
  number: number
  fields: SatisfactionFields
  ownerName: string | null
  customerName: string | null
  status: "Draft" | "Submitted" | "Approved" | "Returned"
  version: number
  decisionNotes: string
  updatedAt: string
  fileCount: number
  actionStatus: string | null
  actionReference: string | null
  actionDescription: string | null
}
export type SatisfactionFile = {
  id: string
  fileName: string
  mediaType: string | null
  byteSize: number
  version: number
  isCurrent: boolean
  uploadedAt: string
  uploadedBy: string | null
  available: boolean
}
const select = `SELECT report.id,report.record_number AS number,report.fields,report.status,report.version,report.decision_notes AS "decisionNotes",report.updated_at::text AS "updatedAt",owner.name AS "ownerName",customer.company_name AS "customerName",action.status AS "actionStatus",CASE WHEN action.id IS NOT NULL THEN action.kind || '-' || lpad(action.record_number::text,5,'0') END AS "actionReference",action.description AS "actionDescription",(SELECT count(*)::integer FROM core.file_links link JOIN core.files file ON file.id=link.file_id WHERE link.organization_id=report.organization_id AND link.target_schema='document_control' AND link.target_table='customer_satisfaction_reports' AND link.target_id=report.id AND link.purpose='report' AND link.is_current AND file.lifecycle_state<>'deleted') AS "fileCount" FROM document_control.customer_satisfaction_reports report LEFT JOIN identity.users owner ON owner.id=(report.fields->>'ownerUserId')::uuid LEFT JOIN sales.customers customer ON customer.organization_id=report.organization_id AND customer.id=(report.fields->>'customerId')::uuid LEFT JOIN document_control.analysis_records action ON action.organization_id=report.organization_id AND action.id=(report.fields->>'analysisId')::uuid`
export async function authorizeSatisfactionUpload(
  client: PoolClient,
  access: Pick<SatisfactionAccess, "organizationId" | "userId" | "canManage">,
  id: string,
  version?: number,
  isRetry = false
) {
  const row = (
    await client.query<{
      status: string
      version: number
      owner: string | null
    }>(
      `SELECT status,version,fields->>'ownerUserId' AS owner FROM document_control.customer_satisfaction_reports WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
      [access.organizationId, id]
    )
  ).rows[0]
  if (!row || (!access.canManage && row.owner !== access.userId))
    throw new CustomerSatisfactionError(
      "Only the responsible account or report manager can upload reports."
    )
  if (!isRetry && !["Draft", "Returned"].includes(row.status))
    throw new CustomerSatisfactionError(
      "Reopen the report before replacing its file."
    )
  if (!isRetry && version !== undefined && version !== row.version)
    throw new CustomerSatisfactionError(
      "This report changed. Refresh before uploading."
    )
}
export function createCustomerSatisfactionRepository(
  options: RepositoryPoolOptions
) {
  const { pool, close } = repositoryPool(options)
  async function record(
    access: SatisfactionAccess,
    id: string,
    client: Pick<PoolClient, "query"> = pool,
    lock = false
  ) {
    return (
      (
        await client.query<SatisfactionReport>(
          `${select} WHERE report.organization_id=$1 AND report.id=$2 AND ($3::boolean OR report.fields->>'ownerUserId'=$4) ${lock ? "FOR UPDATE OF report" : ""}`,
          [
            access.organizationId,
            id,
            access.canReadAll || access.canManage || access.canVerify,
            access.userId,
          ]
        )
      ).rows[0] ?? null
    )
  }
  async function audit(
    client: PoolClient,
    access: SatisfactionAccess,
    id: string,
    event: string,
    reason: string,
    before: unknown,
    after: unknown
  ) {
    await client.query(
      `INSERT INTO audit.events(organization_id,event_type,target_schema,target_table,target_id,actor_user_id,reason,before_state,after_state,metadata,source_system,source_table,source_id) VALUES($1,$2,'document_control','customer_satisfaction_reports',$3,$4,$5,$6,$7,$8,'mrm-dashboard','customer-satisfaction',gen_random_uuid()::text)`,
      [
        access.organizationId,
        `customer_satisfaction.${event}`,
        id,
        access.userId,
        reason,
        before,
        after,
        { actorName: access.userName },
      ]
    )
  }
  async function current(
    client: PoolClient,
    access: SatisfactionAccess,
    id: string,
    version: number
  ) {
    const row = await record(access, id, client, true)
    if (!row) throw new CustomerSatisfactionError("Report was not found.")
    if (row.version !== version)
      throw new CustomerSatisfactionError(
        "This report changed. Refresh before saving."
      )
    return row
  }
  async function validateReferences(
    client: Pick<PoolClient, "query">,
    access: SatisfactionAccess,
    fields: SatisfactionFields
  ) {
    if (
      fields.ownerUserId &&
      !(await listIsoDocumentStaff(client, access.organizationId)).some(
        (x) => x.id === fields.ownerUserId
      )
    )
      throw new CustomerSatisfactionError(
        "Choose an active responsible staff account."
      )
    if (
      fields.customerId &&
      !(
        await client.query(
          `SELECT 1 FROM sales.customers WHERE organization_id=$1 AND id=$2`,
          [access.organizationId, fields.customerId]
        )
      ).rowCount
    )
      throw new CustomerSatisfactionError("Customer was not found.")
    if (
      fields.analysisId &&
      !(
        await client.query(
          `SELECT 1 FROM document_control.analysis_records WHERE organization_id=$1 AND id=$2 AND ($3::boolean OR owner_user_id=$4)`,
          [
            access.organizationId,
            fields.analysisId,
            access.canReadAll || access.canManage || access.canVerify,
            access.userId,
          ]
        )
      ).rowCount
    )
      throw new CustomerSatisfactionError(
        "Follow-up action was not found or is unavailable."
      )
  }
  return {
    close,
    async organizationId() {
      const org = (
        await pool.query<{ id: string }>(
          "SELECT id FROM core.organizations WHERE lower(code)='mrmpl'"
        )
      ).rows[0]
      if (!org)
        throw new CustomerSatisfactionError(
          "MRMPL organization is unavailable."
        )
      return org.id
    },
    owners: (organizationId: string) =>
      listIsoDocumentStaff(pool, organizationId),
    async customers(access: SatisfactionAccess) {
      if (!access.canReadAll && !access.canManage && !access.canVerify)
        return []
      return (
        await pool.query<{ id: string; name: string }>(
          `SELECT id,customer_uid || ' · ' || company_name AS name FROM sales.customers WHERE organization_id=$1 ORDER BY customer_uid`,
          [access.organizationId]
        )
      ).rows
    },
    async list(access: SatisfactionAccess) {
      return (
        await pool.query<SatisfactionReport>(
          `${select} WHERE report.organization_id=$1 AND ($2::boolean OR report.fields->>'ownerUserId'=$3) ORDER BY report.record_number DESC`,
          [
            access.organizationId,
            access.canReadAll || access.canManage || access.canVerify,
            access.userId,
          ]
        )
      ).rows
    },
    async dossier(access: SatisfactionAccess, id: string) {
      const entry = await record(access, id)
      if (!entry) return null
      const [files, history] = await Promise.all([
        pool.query<SatisfactionFile>(
          `SELECT file.id,file.file_name AS "fileName",file.media_type AS "mediaType",file.byte_size::integer AS "byteSize",link.version,link.is_current AS "isCurrent",file.created_at::text AS "uploadedAt",actor.name AS "uploadedBy",(file.lifecycle_state<>'deleted' AND object.lifecycle_state<>'deleted') AS available FROM core.file_links link JOIN core.files file ON file.id=link.file_id LEFT JOIN core.file_objects object ON object.id=file.physical_object_id LEFT JOIN identity.users actor ON actor.id=file.created_by_user_id WHERE link.organization_id=$1 AND link.target_schema='document_control' AND link.target_table='customer_satisfaction_reports' AND link.target_id=$2 AND link.purpose='report' ORDER BY link.version DESC`,
          [access.organizationId, id]
        ),
        pool.query<AnalysisHistory>(
          `SELECT event.id,event.event_type AS "eventType",COALESCE(actor.name,event.metadata->>'actorName','System') AS "actorName",event.occurred_at::text AS "occurredAt",COALESCE(event.reason,'') AS remarks,event.before_state AS before,event.after_state AS after FROM audit.events event LEFT JOIN identity.users actor ON actor.id=event.actor_user_id WHERE event.organization_id=$1 AND ((event.target_schema='document_control' AND event.target_table='customer_satisfaction_reports' AND event.target_id=$2) OR (event.target_schema='core' AND event.target_table='files' AND event.target_id IN (SELECT file_id FROM core.file_links WHERE organization_id=$1 AND target_schema='document_control' AND target_table='customer_satisfaction_reports' AND target_id=$2))) ORDER BY event.occurred_at DESC,event.id DESC`,
          [access.organizationId, id]
        ),
      ])
      return { entry, files: files.rows, history: history.rows }
    },
    async save(
      access: SatisfactionAccess,
      input: { id?: string; version?: number; fields: unknown; reason: string }
    ) {
      const fields = parseSatisfaction(input.fields)
      return withTransaction(pool, async (client) => {
        const before = input.id
          ? await current(client, access, input.id, input.version ?? 0)
          : null
        if (
          !access.canManage &&
          (!before || before.fields.ownerUserId !== access.userId)
        )
          throw new CustomerSatisfactionError(
            "Report manager or responsible account access is required."
          )
        if (before && !["Draft", "Returned"].includes(before.status))
          throw new CustomerSatisfactionError(
            "Resolve review or reopen the report before editing."
          )
        if (
          !access.canManage &&
          before &&
          (fields.ownerUserId !== before.fields.ownerUserId ||
            fields.customerId !== before.fields.customerId)
        )
          throw new CustomerSatisfactionError(
            "Only the report manager can change ownership or customer."
          )
        await validateReferences(client, access, fields)
        const reason = satisfactionText(input.reason, Boolean(before))
        const id = before
          ? before.id
          : (
              await client.query<{ id: string }>(
                `INSERT INTO document_control.customer_satisfaction_reports(organization_id,fields,created_by_user_id) VALUES($1,$2,$3) RETURNING id`,
                [access.organizationId, fields, access.userId]
              )
            ).rows[0]!.id
        if (before)
          await client.query(
            `UPDATE document_control.customer_satisfaction_reports SET fields=$3,status='Draft',version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2`,
            [access.organizationId, id, fields]
          )
        await audit(
          client,
          access,
          id,
          before ? "edited" : "created",
          reason || "Report created",
          before,
          await record(access, id, client)
        )
        return id
      })
    },
    async decide(
      access: SatisfactionAccess,
      input: {
        id: string
        version: number
        operation: "submit" | "approve" | "return" | "reopen"
        notes: string
      }
    ) {
      return withTransaction(pool, async (client) => {
        const before = await current(client, access, input.id, input.version)
        const notes = satisfactionText(input.notes, true)
        let status: SatisfactionReport["status"]
        if (input.operation === "submit") {
          if (!access.canManage && before.fields.ownerUserId !== access.userId)
            throw new CustomerSatisfactionError(
              "Only the report manager or owner can submit."
            )
          if (!["Draft", "Returned"].includes(before.status))
            throw new CustomerSatisfactionError(
              "Only drafts or returned reports can be submitted."
            )
          status = "Submitted"
        } else {
          if (!access.canVerify)
            throw new CustomerSatisfactionError(
              "QA review permission is required."
            )
          if (input.operation === "reopen") {
            if (before.status !== "Approved")
              throw new CustomerSatisfactionError(
                "Only approved reports can be reopened."
              )
            status = "Draft"
          } else {
            if (before.status !== "Submitted")
              throw new CustomerSatisfactionError(
                "Submit the report before QA review."
              )
            status = input.operation === "approve" ? "Approved" : "Returned"
          }
        }
        if (status === "Submitted" || status === "Approved") {
          await validateReferences(client, access, before.fields)
          requireSatisfactionSubmission(before.fields, before.fileCount > 0)
        }
        await client.query(
          `UPDATE document_control.customer_satisfaction_reports SET status=$3,work_target_on=CASE WHEN $3='Approved' THEN NULL ELSE work_target_on END,decision_notes=$4,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2`,
          [access.organizationId, input.id, status, notes]
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
    async file(access: SatisfactionAccess, id: string, fileId: string) {
      if (!(await record(access, id))) return null
      return (
        (
          await pool.query<ArtifactByteLocator>(
            `SELECT file.file_name AS "fileName",file.media_type AS "mediaType",file.byte_size::integer AS "byteSize",file.physical_object_id AS "physicalObjectId",object.provider,object.provider_key AS "providerKey",object.sha256,file.storage_key AS "storageKey" FROM core.file_links link JOIN core.files file ON file.id=link.file_id LEFT JOIN core.file_objects object ON object.id=file.physical_object_id WHERE link.organization_id=$1 AND link.target_schema='document_control' AND link.target_table='customer_satisfaction_reports' AND link.target_id=$2 AND link.file_id=$3 AND link.purpose='report' AND file.lifecycle_state<>'deleted' AND object.lifecycle_state<>'deleted'`,
            [access.organizationId, id, fileId]
          )
        ).rows[0] ?? null
      )
    },
  }
}
