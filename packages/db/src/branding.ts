import {
  brandingNumber,
  parseBrandingContent,
  validateBrandingIssue,
  type BrandingContent,
  type BrandingType,
} from "./branding-domain"
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
}
export type BrandingDocument = {
  id: string
  type: BrandingType
  number: string | null
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
  author_name AS "authorName", updated_at::text AS "updatedAt", issued_at::text AS "issuedAt", template_version AS "templateVersion"`
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
    async list(organizationId: string, type: BrandingType, page = 1) {
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
        count(*) FILTER (WHERE issued AND draft AND type NOT IN ('notice','work-instruction'))::integer AS "revisionsInProgress"
        FROM (SELECT d.type,
          EXISTS(SELECT 1 FROM branding.revisions r WHERE r.document_id = d.id AND r.state = 'issued') AS issued,
          EXISTS(SELECT 1 FROM branding.revisions r WHERE r.document_id = d.id AND r.state = 'draft') AS draft
          FROM branding.documents d WHERE d.organization_id = $1 AND d.type = $2
        ) documents`,
          [organizationId, type]
        )
      ).rows[0]!
      const result = await pool.query<BrandingRegisterRow>(
        `SELECT d.id, d.type, d.number,
        r.content->>'title' AS title, r.content->>'department' AS department,
        r.content->'languages' AS languages, r.content->>'effectiveDate' AS "effectiveDate",
        r.revision, r.state, r.author_name AS "authorName", r.updated_at::text AS "updatedAt",
        EXISTS(SELECT 1 FROM branding.revisions draft WHERE draft.document_id = d.id AND draft.state = 'draft') AS "hasDraft"
        FROM branding.documents d JOIN LATERAL (
          SELECT * FROM branding.revisions WHERE document_id = d.id
          ORDER BY (state = 'issued') DESC, revision DESC LIMIT 1
        ) r ON true WHERE d.organization_id = $1 AND d.type = $2
        ORDER BY d.created_at DESC, d.id LIMIT 101 OFFSET $3`,
        [organizationId, type, (page - 1) * 100]
      )
      return {
        summary,
        rows: result.rows.slice(0, 100),
        hasNext: result.rows.length > 100,
      }
    },
    async get(organizationId: string, type: BrandingType, documentId: string) {
      const document = (
        await pool.query<BrandingDocument>(
          "SELECT id, type, number FROM branding.documents WHERE organization_id = $1 AND type = $2 AND id = $3",
          [organizationId, type, documentId]
        )
      ).rows[0]
      if (!document) return null
      const revisions = (
        await pool.query<BrandingRevision>(
          `SELECT ${revisionSelect} FROM branding.revisions WHERE document_id = $1 ORDER BY revision DESC`,
          [documentId]
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
      userId: string
      userName: string
    }) {
      const content = parseBrandingContent(input.content, input.type)
      return withTransaction(pool, async (client) => {
        const documentId =
          input.documentId ??
          (
            await client.query<{ id: string }>(
              "INSERT INTO branding.documents(organization_id, type) VALUES ($1, $2) RETURNING id",
              [input.organizationId, input.type]
            )
          ).rows[0]!.id
        const document = (
          await client.query(
            "SELECT id FROM branding.documents WHERE id = $1 AND organization_id = $2 AND type = $3 FOR UPDATE",
            [documentId, input.organizationId, input.type]
          )
        ).rows[0]
        if (!document) throw new Error("Document not found.")
        if (
          (input.type === "notice" || input.type === "work-instruction") &&
          input.documentId
        ) {
          const issued = await client.query(
            "SELECT 1 FROM branding.revisions WHERE document_id = $1 AND state = 'issued' LIMIT 1",
            [documentId]
          )
          if (issued.rowCount)
            throw new Error(
              "Issued documents of this type cannot be revised. Create a new document."
            )
        }
        if (input.documentId) {
          const result = await client.query(
            `UPDATE branding.revisions SET content = $1, version = version + 1,
            author_user_id = $2, author_name = $3, updated_at = now()
            WHERE document_id = $4 AND state = 'draft' AND version = $5 RETURNING id`,
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
      if (input.type === "notice" || input.type === "work-instruction")
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
        if (
          (input.type === "notice" || input.type === "work-instruction") &&
          document.number
        )
          throw new Error(
            "Issued documents of this type cannot be revised. Create a new document."
          )
        if (revision.version !== input.version)
          throw new Error("This draft changed. Reload and review before issue.")
        const content = parseBrandingContent(revision.content, input.type)
        validateBrandingIssue(content, revision.revision)
        let number = document.number
        if (!number) {
          const counter = (
            await client.query<{ value: string }>(
              `INSERT INTO branding.counters(organization_id, type, value) VALUES ($1, $2, 1)
            ON CONFLICT (organization_id, type) DO UPDATE SET value = branding.counters.value + 1 RETURNING value`,
              [input.organizationId, input.type]
            )
          ).rows[0]!
          number = brandingNumber(input.type, Number(counter.value))
          await client.query(
            "UPDATE branding.documents SET number = $1 WHERE id = $2",
            [number, input.documentId]
          )
        }
        const issuedAt = new Date().toISOString()
        const bytes = await render({
          content,
          number,
          revision: revision.revision,
          issuedAt,
          authorName: input.userName,
          type: input.type,
        })
        if (!bytes.byteLength || bytes.byteLength > 5242880)
          throw new Error("PDF exceeds the 5 MB document limit.")
        await client.query(
          "UPDATE branding.revisions SET state = 'issued', template_version = 'mrm-brand-v3', pdf = $1, issued_at = $2, updated_at = $2, author_user_id = $3, author_name = $4, version = version + 1 WHERE id = $5",
          [
            Buffer.from(bytes),
            issuedAt,
            input.userId,
            input.userName,
            revision.id,
          ]
        )
        return revision.id
      })
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
