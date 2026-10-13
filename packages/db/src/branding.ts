import {
  parseBrandingContent,
  validateBrandingIssue,
  type BrandingContent,
  type BrandingType,
} from "./branding-domain"
import {
  defaultDocumentType,
  documentNumber,
  parseDocumentControlMetadata,
  type DocumentControlMetadata,
  type DocumentWorkflowState,
} from "./document-control-domain"
import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"

export type BrandingRevision = {
  id: string
  documentId: string
  revision: number
  content: BrandingContent
  state: "draft" | "issued"
  version: number
  authorName: string
  updatedAt: string
  issuedAt: string | null
  templateVersion: string
  hasUpload: boolean
  workflowState: DocumentWorkflowState
  submittedAt: string | null
  submittedByUserId: string | null
  approvedAt: string | null
  approvedByUserId: string | null
  approvalRemarks: string | null
  releasedByUserId: string | null
}
export type BrandingDocument = {
  id: string
  type: BrandingType
  number: string | null
}
export type DocumentControlFields = DocumentControlMetadata & {
  metadataVersion: number
}
export type BrandingRegisterRow = BrandingDocument & {
  title: string
  department: string
  languages: string[]
  effectiveDate: string
  revision: number
  state: "draft" | "issued"
  hasDraft: boolean
  authorName: string
  updatedAt: string
}
const revisionSelect = `id, document_id AS "documentId", revision, content, state, version,
  author_name AS "authorName", updated_at::text AS "updatedAt", issued_at::text AS "issuedAt", template_version AS "templateVersion", uploaded_pdf IS NOT NULL AS "hasUpload",
  workflow_state AS "workflowState", submitted_at::text AS "submittedAt",
  submitted_by_user_id AS "submittedByUserId", approved_at::text AS "approvedAt",
  approved_by_user_id AS "approvedByUserId", approval_remarks AS "approvalRemarks",
  released_by_user_id AS "releasedByUserId"`

const controlFieldsSelect = `d.document_type AS "documentType",
  d.responsible_role AS "responsibleRole", d.use_status AS "useStatus",
  d.review_cycle_months AS "reviewCycleMonths",
  d.data_frequency_type AS "dataFrequencyType",
  d.data_frequency_interval_days AS "dataFrequencyIntervalDays",
  COALESCE(d.data_frequency_detail, '') AS "dataFrequencyDetail",
  COALESCE(d.data_retention, '') AS "dataRetention",
  d.record_locations AS "recordLocations", d.content_access AS "contentAccess",
  d.metadata_version AS "metadataVersion"`

async function appendDocumentAudit(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  input: {
    organizationId: string
    documentId: string
    actorUserId: string
    eventType: string
    reason?: string | null
    beforeState?: unknown
    afterState?: unknown
    metadata?: Record<string, unknown>
  }
) {
  await client.query(
    `INSERT INTO audit.events (
      organization_id, event_type, target_schema, target_table, target_id,
      actor_user_id, reason, before_state, after_state, metadata,
      source_system, source_table, source_id
    ) VALUES ($1, $2, 'branding', 'documents', $3, $4, $5, $6, $7, $8,
      'mrm-dashboard', 'document_control', gen_random_uuid()::text)`,
    [
      input.organizationId,
      input.eventType,
      input.documentId,
      input.actorUserId,
      input.reason ?? null,
      input.beforeState ?? null,
      input.afterState ?? null,
      input.metadata ?? {},
    ]
  )
}

function documentContentAuditState(content: BrandingContent | null) {
  if (!content) return null
  return JSON.parse(
    JSON.stringify(content, (key, value: unknown) =>
      key === "picture" ? "[retained picture]" : value
    )
  ) as Record<string, unknown>
}
export function createBrandingRepository(options: RepositoryPoolOptions) {
  const { pool, close } = repositoryPool(options)
  return {
    close,
    async organizationId() {
      const result = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE code = 'MRMPL'"
      )
      if (!result.rows[0]) throw new Error("Organization not found.")
      return result.rows[0].id
    },
    async list(
      organizationId: string,
      type: BrandingType,
      page = 1,
      permittedDepartments: string[] | null = null
    ) {
      const departments =
        permittedDepartments?.map((department) =>
          department.trim().toLowerCase()
        ) ?? null
      const summary = (
        await pool.query<{
          total: number
          issued: number
          drafts: number
          revisionsInProgress: number
        }>(
          `SELECT count(*)::integer AS total,
        count(*) FILTER (WHERE issued)::integer AS issued,
        count(*) FILTER (WHERE NOT issued)::integer AS drafts,
        count(*) FILTER (WHERE issued AND draft AND type <> 'notice')::integer AS "revisionsInProgress"
        FROM (SELECT d.type,
          EXISTS(SELECT 1 FROM branding.revisions r WHERE r.document_id = d.id AND r.state = 'issued'
            AND ($3::text[] IS NULL OR lower(btrim(r.content->>'department')) = ANY($3))) AS issued,
          EXISTS(SELECT 1 FROM branding.revisions r WHERE r.document_id = d.id AND r.state = 'draft'
            AND ($3::text[] IS NULL OR lower(btrim(r.content->>'department')) = ANY($3))) AS draft
          FROM branding.documents d WHERE d.organization_id = $1 AND d.type = $2
            AND EXISTS (SELECT 1 FROM branding.revisions r WHERE r.document_id = d.id
              AND ($3::text[] IS NULL OR lower(btrim(r.content->>'department')) = ANY($3)))
        ) documents`,
          [organizationId, type, departments]
        )
      ).rows[0]!
      const result = await pool.query<BrandingRegisterRow>(
        `SELECT d.id, d.type, COALESCE(d.number, CASE WHEN d.type = 'controlled-document' THEN r.content->'inputs'->>'Document number' END) AS number,
        r.content->>'title' AS title, r.content->>'department' AS department,
        r.content->'languages' AS languages, r.content->>'effectiveDate' AS "effectiveDate",
        r.revision, r.state, r.author_name AS "authorName", r.updated_at::text AS "updatedAt",
        EXISTS(SELECT 1 FROM branding.revisions draft WHERE draft.document_id = d.id AND draft.state = 'draft'
          AND ($4::text[] IS NULL OR lower(btrim(draft.content->>'department')) = ANY($4))) AS "hasDraft"
        FROM branding.documents d JOIN LATERAL (
          SELECT * FROM branding.revisions WHERE document_id = d.id
            AND ($4::text[] IS NULL OR lower(btrim(content->>'department')) = ANY($4))
          ORDER BY (state = 'issued') DESC, revision DESC LIMIT 1
        ) r ON true WHERE d.organization_id = $1 AND d.type = $2
        ORDER BY d.created_at DESC, d.id LIMIT 101 OFFSET $3`,
        [organizationId, type, (page - 1) * 100, departments]
      )
      return {
        summary,
        rows: result.rows.slice(0, 100),
        hasNext: result.rows.length > 100,
      }
    },
    async listPublished(organizationId: string, type: BrandingType) {
      return (
        await pool.query<
          Omit<BrandingRegisterRow, "hasDraft" | "updatedAt"> & {
            revisionId: string
            issuedAt: string
          }
        >(
          `SELECT d.id, d.type, d.number, r.id AS "revisionId",
        r.content->>'title' AS title, r.content->>'department' AS department,
        r.content->'languages' AS languages, r.content->>'effectiveDate' AS "effectiveDate",
        r.revision, r.state, r.author_name AS "authorName", r.issued_at::text AS "issuedAt"
        FROM branding.documents d JOIN LATERAL (
          SELECT * FROM branding.revisions WHERE document_id = d.id AND state = 'issued'
          ORDER BY revision DESC LIMIT 1
        ) r ON true WHERE d.organization_id = $1 AND d.type = $2
          AND d.content_access = 'all-signed-in'
        ORDER BY d.number`,
          [organizationId, type]
        )
      ).rows
    },
    async get(
      organizationId: string,
      type: BrandingType,
      documentId: string,
      permittedDepartments: string[] | null = null
    ) {
      const document = (
        await pool.query<BrandingDocument & DocumentControlFields>(
          `SELECT d.id, d.type, d.number, ${controlFieldsSelect}
           FROM branding.documents d WHERE d.organization_id = $1 AND d.type = $2 AND d.id = $3`,
          [organizationId, type, documentId]
        )
      ).rows[0]
      if (!document) return null
      const revisions = (
        await pool.query<BrandingRevision>(
          `SELECT ${revisionSelect} FROM branding.revisions WHERE document_id = $1
           AND ($2::text[] IS NULL OR lower(btrim(content->>'department')) = ANY($2))
           ORDER BY revision DESC`,
          [
            documentId,
            permittedDepartments?.map((department) =>
              department.trim().toLowerCase()
            ) ?? null,
          ]
        )
      ).rows
      return { ...document, revisions }
    },
    async save(input: {
      organizationId: string
      type: BrandingType
      documentId?: string
      version?: number
      content: BrandingContent
      uploadedPdf?: Uint8Array
      userId: string
      userName: string
    }) {
      const content = parseBrandingContent(input.content, input.type)
      if (
        input.uploadedPdf &&
        (input.type !== "controlled-document" ||
          !input.uploadedPdf.byteLength ||
          input.uploadedPdf.byteLength > 5242880 ||
          Buffer.from(input.uploadedPdf).subarray(0, 5).toString() !== "%PDF-")
      )
        throw new Error("Upload a PDF no larger than 5 MB.")
      return withTransaction(pool, async (client) => {
        const created = !input.documentId
        const documentId =
          input.documentId ??
          (
            await client.query<{ id: string }>(
              `INSERT INTO branding.documents(
                 organization_id, type, document_type
               ) VALUES ($1, $2, $3) RETURNING id`,
              [
                input.organizationId,
                input.type,
                defaultDocumentType(input.type),
              ]
            )
          ).rows[0]!.id
        const document = (
          await client.query<{ id: string; number: string | null }>(
            "SELECT id, number FROM branding.documents WHERE id = $1 AND organization_id = $2 AND type = $3 FOR UPDATE",
            [documentId, input.organizationId, input.type]
          )
        ).rows[0]
        if (!document) throw new Error("Document not found.")
        if (input.type === "notice" && input.documentId) {
          const issued = await client.query(
            "SELECT 1 FROM branding.revisions WHERE document_id = $1 AND state = 'issued' LIMIT 1",
            [documentId]
          )
          if (issued.rowCount)
            throw new Error(
              "Issued documents of this type cannot be revised. Create a new document."
            )
        }
        let beforeContent: BrandingContent | null = null
        if (input.documentId) {
          const current = (
            await client.query<{ content: BrandingContent }>(
              `SELECT content FROM branding.revisions
               WHERE document_id = $1 AND state = 'draft'
                 AND workflow_state = 'draft' AND version = $2
               FOR UPDATE`,
              [documentId, input.version]
            )
          ).rows[0]
          beforeContent = current?.content ?? null
          const result = await client.query(
            `UPDATE branding.revisions SET content = $1, version = version + 1,
            author_user_id = $2, author_name = $3, updated_at = now()
            WHERE document_id = $4 AND state = 'draft'
              AND workflow_state = 'draft' AND version = $5 RETURNING id`,
            [content, input.userId, input.userName, documentId, input.version]
          )
          if (!result.rowCount)
            throw new Error(
              "This draft changed or was issued. Reload before editing."
            )
        } else {
          await client.query(
            "INSERT INTO branding.revisions(document_id, revision, content, author_user_id, author_name) VALUES ($1, 0, $2, $3, $4)",
            [documentId, content, input.userId, input.userName]
          )
        }
        if (input.uploadedPdf) {
          await client.query(
            "UPDATE branding.revisions SET uploaded_pdf = $2 WHERE document_id = $1 AND state = 'draft'",
            [documentId, Buffer.from(input.uploadedPdf)]
          )
        }
        await appendDocumentAudit(client, {
          organizationId: input.organizationId,
          documentId,
          actorUserId: input.userId,
          eventType: created
            ? "document.draft.created"
            : "document.draft.edited",
          beforeState: documentContentAuditState(beforeContent),
          afterState: documentContentAuditState(content),
        })
        return documentId
      })
    },
    async revise(input: {
      organizationId: string
      type: BrandingType
      documentId: string
      userId: string
      userName: string
    }) {
      if (input.type === "notice")
        throw new Error(
          "This document does not have revisions. Create a new document."
        )
      return withTransaction(pool, async (client) => {
        const document = (
          await client.query(
            "SELECT id FROM branding.documents WHERE id = $1 AND organization_id = $2 AND type = $3 FOR UPDATE",
            [input.documentId, input.organizationId, input.type]
          )
        ).rows[0]
        if (!document) throw new Error("Document not found.")
        const latest = (
          await client.query<BrandingRevision>(
            `SELECT ${revisionSelect} FROM branding.revisions WHERE document_id = $1 ORDER BY revision DESC LIMIT 1`,
            [input.documentId]
          )
        ).rows[0]
        if (!latest || latest.state === "draft") return
        await client.query(
          "INSERT INTO branding.revisions(document_id, revision, content, author_user_id, author_name) VALUES ($1, $2, $3, $4, $5)",
          [
            input.documentId,
            latest.revision + 1,
            { ...latest.content, changeReason: "" },
            input.userId,
            input.userName,
          ]
        )
        await appendDocumentAudit(client, {
          organizationId: input.organizationId,
          documentId: input.documentId,
          actorUserId: input.userId,
          eventType: "document.revision.created",
          reason: "New revision opened",
          beforeState: { revision: latest.revision, state: latest.state },
          afterState: { revision: latest.revision + 1, state: "draft" },
        })
      })
    },
    async saveControlMetadata(input: {
      organizationId: string
      documentId: string
      version: number
      metadata: DocumentControlMetadata
      userId: string
    }) {
      const metadata = parseDocumentControlMetadata(input.metadata)
      return withTransaction(pool, async (client) => {
        const before = (
          await client.query<DocumentControlFields>(
            `SELECT ${controlFieldsSelect}
             FROM branding.documents d
             WHERE d.organization_id = $1 AND d.id = $2 FOR UPDATE`,
            [input.organizationId, input.documentId]
          )
        ).rows[0]
        if (!before) throw new Error("Document not found.")
        if (before.metadataVersion !== input.version)
          throw new Error("Document details changed. Reload before saving.")
        await client.query(
          `UPDATE branding.documents SET
             document_type = $1, responsible_role = NULLIF($2, ''),
             use_status = $3, review_cycle_months = $4,
             data_frequency_type = $5,
             data_frequency_interval_days = $6,
             data_frequency_detail = NULLIF($7, ''),
             data_retention = NULLIF($8, ''), record_locations = $9,
             content_access = $10, metadata_version = metadata_version + 1
           WHERE organization_id = $11 AND id = $12`,
          [
            metadata.documentType,
            metadata.responsibleRole,
            metadata.useStatus,
            metadata.reviewCycleMonths,
            metadata.dataFrequencyType,
            metadata.dataFrequencyIntervalDays,
            metadata.dataFrequencyDetail,
            metadata.dataRetention,
            metadata.recordLocations,
            metadata.contentAccess,
            input.organizationId,
            input.documentId,
          ]
        )
        await appendDocumentAudit(client, {
          organizationId: input.organizationId,
          documentId: input.documentId,
          actorUserId: input.userId,
          eventType: "document.metadata.updated",
          beforeState: before,
          afterState: metadata,
        })
      })
    },
    async submitForApproval(input: {
      organizationId: string
      documentId: string
      revisionId: string
      version: number
      type: BrandingType
      userId: string
    }) {
      return withTransaction(pool, async (client) => {
        const control = (
          await client.query<{ responsibleRole: string | null }>(
            `SELECT responsible_role AS "responsibleRole"
             FROM branding.documents
             WHERE id = $1 AND organization_id = $2 AND type = $3`,
            [input.documentId, input.organizationId, input.type]
          )
        ).rows[0]
        if (!control) throw new Error("Document not found.")
        if (!control.responsibleRole)
          throw new Error(
            "Complete the responsible role in Document Control before submission."
          )
        const revision = (
          await client.query<BrandingRevision>(
            `SELECT ${revisionSelect} FROM branding.revisions r
             WHERE r.id = $1 AND r.document_id = $2
               AND EXISTS (
                 SELECT 1 FROM branding.documents d
                 WHERE d.id = r.document_id AND d.organization_id = $3
                   AND d.type = $4
               ) FOR UPDATE`,
            [
              input.revisionId,
              input.documentId,
              input.organizationId,
              input.type,
            ]
          )
        ).rows[0]
        if (!revision) throw new Error("Revision not found.")
        if (revision.state !== "draft" || revision.workflowState !== "draft")
          throw new Error("Only a draft can be submitted for approval.")
        if (revision.version !== input.version)
          throw new Error("This draft changed. Reload before submitting.")
        const content = parseBrandingContent(revision.content, input.type)
        validateBrandingIssue(content, revision.revision, input.type)
        if (input.type === "controlled-document" && !revision.hasUpload)
          throw new Error("Upload the PDF before submitting for approval.")
        await client.query(
          `UPDATE branding.revisions SET workflow_state = 'pending-approval',
             submitted_at = now(), submitted_by_user_id = $1,
             approved_at = NULL, approved_by_user_id = NULL,
             approval_remarks = NULL, version = version + 1, updated_at = now()
           WHERE id = $2`,
          [input.userId, input.revisionId]
        )
        await appendDocumentAudit(client, {
          organizationId: input.organizationId,
          documentId: input.documentId,
          actorUserId: input.userId,
          eventType: "document.approval.submitted",
          beforeState: { workflowState: revision.workflowState },
          afterState: { workflowState: "pending-approval" },
          metadata: { revisionId: revision.id, revision: revision.revision },
        })
      })
    },
    async approvalDepartments(input: {
      organizationId: string
      userId: string
    }) {
      const account = (
        await pool.query<{ role: string | null }>(
          "SELECT role FROM identity.users WHERE id = $1",
          [input.userId]
        )
      ).rows[0]
      if (!account) throw new Error("Signed-in user not found.")
      if (account.role === "admin") return null
      return (
        await pool.query<{ department: string }>(
          `WITH linked_employee_codes AS (
             SELECT employee_code FROM identity.employee_links
             WHERE user_id = $1 AND organization_id = $2
             UNION
             SELECT employee_code FROM workforce.employees
             WHERE user_id = $1 AND organization_id = $2 AND active
           ), assigned_departments AS (
             SELECT department.name AS department
             FROM linked_employee_codes employee
             JOIN recruitment.posts post ON post.organization_id = $2
               AND lower(btrim(post.employee_code)) = lower(btrim(employee.employee_code))
             JOIN recruitment.departments department
               ON department.id = post.department_id AND department.active
             WHERE post.status = 'Occupied'
                OR (post.status = 'Appointed' AND post.joining_date <= current_date)
                OR (post.status = 'Resigned' AND post.last_working_date >= current_date)
             UNION
             SELECT employee.department FROM workforce.employees employee
             WHERE employee.user_id = $1 AND employee.organization_id = $2
               AND employee.active AND nullif(btrim(employee.department), '') IS NOT NULL
           )
           SELECT DISTINCT btrim(department) AS department
           FROM assigned_departments
           WHERE nullif(btrim(department), '') IS NOT NULL
           ORDER BY department`,
          [input.userId, input.organizationId]
        )
      ).rows.map(({ department }) => department)
    },
    async decideApproval(input: {
      organizationId: string
      documentId: string
      revisionId: string
      userId: string
      approve: boolean
      remarks: string
      permittedDepartments: string[] | null
    }) {
      const remarks = input.remarks.trim()
      if (!input.approve && !remarks)
        throw new Error("Rejection remarks are required.")
      return withTransaction(pool, async (client) => {
        const revision = (
          await client.query<BrandingRevision>(
            `SELECT ${revisionSelect} FROM branding.revisions r
             WHERE r.id = $1 AND r.document_id = $2
               AND EXISTS (
                 SELECT 1 FROM branding.documents d
                 WHERE d.id = r.document_id AND d.organization_id = $3
               ) FOR UPDATE`,
            [input.revisionId, input.documentId, input.organizationId]
          )
        ).rows[0]
        if (!revision) throw new Error("Revision not found.")
        if (revision.workflowState !== "pending-approval")
          throw new Error("This revision is not awaiting approval.")
        const department = revision.content.department.trim()
        if (
          input.permittedDepartments &&
          !input.permittedDepartments.some(
            (entry) =>
              entry.localeCompare(department, undefined, {
                sensitivity: "accent",
              }) === 0
          )
        )
          throw new Error("You may approve only your assigned departments.")
        const nextState = input.approve ? "approved" : "draft"
        await client.query(
          `UPDATE branding.revisions SET workflow_state = $1,
             approved_at = CASE WHEN $2 THEN now() ELSE NULL END,
             approved_by_user_id = CASE WHEN $2 THEN $3 ELSE NULL END,
             approval_remarks = NULLIF($4, ''), version = version + 1,
             updated_at = now()
           WHERE id = $5`,
          [nextState, input.approve, input.userId, remarks, input.revisionId]
        )
        await appendDocumentAudit(client, {
          organizationId: input.organizationId,
          documentId: input.documentId,
          actorUserId: input.userId,
          eventType: input.approve
            ? "document.approval.approved"
            : "document.approval.rejected",
          reason: remarks || null,
          beforeState: { workflowState: revision.workflowState },
          afterState: { workflowState: nextState },
          metadata: { revisionId: revision.id, revision: revision.revision },
        })
      })
    },
    async issue(
      input: {
        organizationId: string
        type: BrandingType
        documentId: string
        revisionId: string
        version: number
        userId: string
        userName: string
      },
      render: (input: {
        content: BrandingContent
        number: string
        revision: number
        issuedAt: string
        authorName: string
        type: BrandingType
      }) => Promise<Uint8Array>
    ) {
      return withTransaction(pool, async (client) => {
        const document = (
          await client.query<BrandingDocument>(
            "SELECT id, type, number FROM branding.documents WHERE id = $1 AND organization_id = $2 AND type = $3 FOR UPDATE",
            [input.documentId, input.organizationId, input.type]
          )
        ).rows[0]
        if (!document) throw new Error("Document not found.")
        const revision = (
          await client.query<BrandingRevision>(
            `SELECT ${revisionSelect} FROM branding.revisions WHERE id = $1 AND document_id = $2 FOR UPDATE`,
            [input.revisionId, input.documentId]
          )
        ).rows[0]
        if (!revision) throw new Error("Revision not found.")
        if (revision.state === "issued") return revision.id
        if (revision.workflowState !== "approved")
          throw new Error(
            "Department approval is required before final release."
          )
        if (input.type === "notice" && document.number)
          throw new Error(
            "Issued documents of this type cannot be revised. Create a new document."
          )
        if (revision.version !== input.version)
          throw new Error("This draft changed. Reload and review before issue.")
        const content = parseBrandingContent(revision.content, input.type)
        validateBrandingIssue(content, revision.revision, input.type)
        let number = document.number
        if (!number) {
          const counter = (
            await client.query<{ value: string }>(
              `INSERT INTO document_control.counters(organization_id, value)
               VALUES ($1, 1)
               ON CONFLICT (organization_id) DO UPDATE
               SET value = document_control.counters.value + 1
               RETURNING value`,
              [input.organizationId]
            )
          ).rows[0]!
          number = documentNumber(Number(counter.value))
          await client.query(
            "UPDATE branding.documents SET number = $1 WHERE id = $2",
            [number, input.documentId]
          )
        }
        const issuedAt = new Date().toISOString()
        const previousRelease = (
          await client.query<{ id: string; revision: number }>(
            `SELECT id, revision FROM branding.revisions
             WHERE document_id = $1 AND state = 'issued'
             ORDER BY revision DESC LIMIT 1`,
            [input.documentId]
          )
        ).rows[0]
        const releasedContent = {
          ...content,
          effectiveDate: issuedAt.slice(0, 10),
          inputs:
            input.type === "controlled-document"
              ? { ...content.inputs, "Document number": number }
              : content.inputs,
        }
        const bytes =
          input.type === "controlled-document"
            ? (
                await client.query<{ uploaded_pdf: Buffer | null }>(
                  "SELECT uploaded_pdf FROM branding.revisions WHERE id = $1",
                  [revision.id]
                )
              ).rows[0]?.uploaded_pdf
            : await render({
                content: releasedContent,
                number,
                revision: revision.revision,
                issuedAt,
                authorName: input.userName,
                type: input.type,
              })
        if (!bytes)
          throw new Error("Upload the PDF for this revision before release.")
        if (!bytes.byteLength || bytes.byteLength > 5242880)
          throw new Error("PDF exceeds the 5 MB document limit.")
        await client.query(
          `UPDATE branding.revisions SET state = 'issued',
             workflow_state = 'released', released_by_user_id = $3,
             template_version = $6, content = $7, pdf = $1, uploaded_pdf = NULL,
             issued_at = $2, updated_at = $2, author_user_id = $3,
             author_name = $4, version = version + 1 WHERE id = $5`,
          [
            Buffer.from(bytes),
            issuedAt,
            input.userId,
            input.userName,
            revision.id,
            input.type === "controlled-document"
              ? "uploaded-pdf-v1"
              : input.type === "notice"
                ? "mrm-notice-v13"
                : input.type === "work-instruction"
                  ? "mrm-wi-v11"
                  : "mrm-book-v9",
            releasedContent,
          ]
        )
        await appendDocumentAudit(client, {
          organizationId: input.organizationId,
          documentId: input.documentId,
          actorUserId: input.userId,
          eventType: "document.released",
          reason: content.changeReason || "Initial release",
          beforeState: { workflowState: revision.workflowState },
          afterState: {
            workflowState: "released",
            number,
            revision: revision.revision,
            revisionDate: issuedAt,
          },
          metadata: { revisionId: revision.id },
        })
        if (previousRelease) {
          await appendDocumentAudit(client, {
            organizationId: input.organizationId,
            documentId: input.documentId,
            actorUserId: input.userId,
            eventType: "document.revision.superseded",
            beforeState: {
              revisionId: previousRelease.id,
              revision: previousRelease.revision,
              status: "released",
            },
            afterState: {
              revisionId: previousRelease.id,
              revision: previousRelease.revision,
              status: "superseded",
            },
          })
        }
        return revision.id
      })
    },
    async uploadedDraftPdf(organizationId: string, documentId: string) {
      return (
        (
          await pool.query<{ pdf: Buffer }>(
            `SELECT r.uploaded_pdf AS pdf FROM branding.revisions r
         JOIN branding.documents d ON d.id = r.document_id
         WHERE d.organization_id = $1 AND d.id = $2 AND d.type = 'controlled-document'
           AND r.state = 'draft' AND r.uploaded_pdf IS NOT NULL`,
            [organizationId, documentId]
          )
        ).rows[0] ?? null
      )
    },
    async publishedPdf(
      organizationId: string,
      type: BrandingType,
      documentId: string
    ) {
      return (
        (
          await pool.query<{ pdf: Buffer; number: string; revision: number }>(
            `SELECT r.pdf, d.number, r.revision FROM branding.documents d
        JOIN branding.revisions r ON r.document_id = d.id
        WHERE d.organization_id = $1 AND d.type = $2 AND d.id = $3
          AND d.content_access = 'all-signed-in' AND r.state = 'issued'
        ORDER BY r.revision DESC LIMIT 1`,
            [organizationId, type, documentId]
          )
        ).rows[0] ?? null
      )
    },
    async pdf(
      organizationId: string,
      type: BrandingType,
      documentId: string,
      revisionId: string
    ) {
      return (
        (
          await pool.query<{ pdf: Buffer; number: string; revision: number }>(
            `SELECT r.pdf, d.number, r.revision FROM branding.revisions r JOIN branding.documents d ON d.id = r.document_id
        WHERE d.organization_id = $1 AND d.type = $2 AND d.id = $3 AND r.id = $4 AND r.state = 'issued'`,
            [organizationId, type, documentId, revisionId]
          )
        ).rows[0] ?? null
      )
    },
  }
}
