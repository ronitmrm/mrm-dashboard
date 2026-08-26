import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

export const artifactStorageAllowanceBytes = 2 * 1024 * 1024 * 1024

export type ArtifactLedgerFilters = {
  dateFrom?: string
  dateTo?: string
  mediaType?: string
  module?: string
  origin?: "generated" | "legacy" | "uploaded"
  organizationId: string
  page: number
  pageSize: number
  purpose?: string
  search?: string
  state?: "current" | "deleted" | "superseded"
}

export type ArtifactLedgerUsage = {
  businessRecord: string
  module: string
  purpose: string
  targetId: string
  targetSchema: string
  targetTable: string
  version: number
}

type LedgerRow = {
  actor_email: string | null
  actor_name: string | null
  byte_size: string
  created_at: Date
  deleted_at: Date | null
  deleted_by_email: string | null
  deleted_by_name: string | null
  deletion_reason: string | null
  file_name: string
  id: string
  lifecycle_state: "current" | "deleted" | "superseded"
  media_type: string | null
  modules: string[]
  object_lifecycle_state: "available" | "deleted" | "deletion_failed"
  origin: "generated" | "legacy" | "uploaded"
  physical_reference_count: string
  public_url: string | null
  purposes: string[]
  sha256: string
  total_count: string
  updated_at: Date
  usages: ArtifactLedgerUsage[]
}

function normalizedOptional(value: string | undefined) {
  return value?.trim() || undefined
}

function positiveInteger(value: number, fallback: number, maximum: number) {
  if (!Number.isInteger(value) || value < 1) return fallback
  return Math.min(value, maximum)
}

const moduleExpression = `CASE usage.target_schema
  WHEN 'sales' THEN 'commercial'
  WHEN 'recruitment' THEN 'hr'
  WHEN 'store' THEN 'store'
  ELSE lower(usage.target_schema)
END`

const businessRecordExpression = `CASE
  WHEN usage.target_schema = 'sales' AND usage.target_table = 'enquiry_items'
    THEN coalesce((
      SELECT enquiry.enquiry_number || ' / line ' || item.line_number::text
      FROM sales.enquiry_items item
      JOIN sales.enquiries enquiry ON enquiry.id = item.enquiry_id
      WHERE item.id = usage.target_id
    ), 'Enquiry item ' || left(usage.target_id::text, 8))
  WHEN usage.target_schema = 'sales' AND usage.target_table = 'design_tasks'
    THEN coalesce((
      SELECT enquiry.enquiry_number || ' / design line ' || item.line_number::text
      FROM sales.design_tasks task
      JOIN sales.enquiry_items item ON item.id = task.enquiry_item_id
      JOIN sales.enquiries enquiry ON enquiry.id = item.enquiry_id
      WHERE task.id = usage.target_id
    ), 'Design task ' || left(usage.target_id::text, 8))
  WHEN usage.target_schema = 'sales' AND usage.target_table = 'clarification_tasks'
    THEN coalesce((
      SELECT enquiry.enquiry_number || ' / clarification'
      FROM sales.clarification_tasks task
      JOIN sales.enquiries enquiry ON enquiry.id = task.enquiry_id
      WHERE task.id = usage.target_id
    ), 'Clarification ' || left(usage.target_id::text, 8))
  WHEN usage.target_schema = 'sales' AND usage.target_table = 'quote_items'
    THEN coalesce((
      SELECT quote.quote_number || ' / rev ' || quote.revision::text
      FROM sales.quote_items quote WHERE quote.id = usage.target_id
    ), 'Quote ' || left(usage.target_id::text, 8))
  WHEN usage.target_schema = 'sales' AND usage.target_table = 'proforma_invoices'
    THEN coalesce((
      SELECT invoice.invoice_number
      FROM sales.proforma_invoices invoice WHERE invoice.id = usage.target_id
    ), 'Proforma invoice ' || left(usage.target_id::text, 8))
  WHEN usage.target_schema = 'sales' AND usage.target_table = 'purchase_orders'
    THEN coalesce((
      SELECT purchase_order.po_number
      FROM sales.purchase_orders purchase_order WHERE purchase_order.id = usage.target_id
    ), 'Customer purchase order ' || left(usage.target_id::text, 8))
  WHEN usage.target_schema = 'recruitment' AND usage.target_table = 'candidates'
    THEN coalesce((
      SELECT candidate.name
      FROM recruitment.candidates candidate WHERE candidate.id = usage.target_id
    ), 'Candidate ' || left(usage.target_id::text, 8))
  WHEN usage.target_schema = 'store' AND usage.target_table = 'purchase_orders'
    THEN coalesce((
      SELECT purchase_order.order_number
      FROM store.purchase_orders purchase_order WHERE purchase_order.id = usage.target_id
    ), 'Store purchase order ' || left(usage.target_id::text, 8))
  WHEN usage.target_schema = 'store' AND usage.target_table = 'item_types'
    THEN coalesce((
      SELECT item.type_code || ' · ' || item.asset_name
      FROM store.item_types item WHERE item.id = usage.target_id
    ), 'Store item ' || left(usage.target_id::text, 8))
  WHEN usage.target_schema = 'store' AND usage.target_table = 'receipts'
    THEN coalesce((
      SELECT receipt.receipt_number
      FROM store.receipts receipt WHERE receipt.id = usage.target_id
    ), 'Store receipt ' || left(usage.target_id::text, 8))
  ELSE usage.target_schema || '.' || usage.target_table || ' · ' || left(usage.target_id::text, 8)
END`

export function createArtifactLedgerRepository(options: RepositoryPoolOptions) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    async organizationIdForUser(userId: string) {
      const linked = await pool.query<{ organization_id: string }>(
        `
          SELECT DISTINCT organization_id
          FROM identity.employee_links
          WHERE user_id = $1
          ORDER BY organization_id
        `,
        [userId]
      )
      if (linked.rows.length === 1) return linked.rows[0]!.organization_id
      if (linked.rows.length > 1) {
        throw new Error(
          "Artifact ledger Organization is ambiguous for this user."
        )
      }
      const organizations = await pool.query<{ id: string }>(
        `SELECT id FROM core.organizations ORDER BY id LIMIT 2`
      )
      if (organizations.rows.length === 1) return organizations.rows[0]!.id
      throw new Error(
        "Artifact ledger Organization is not assigned to this user."
      )
    },

    async list(input: ArtifactLedgerFilters) {
      const page = positiveInteger(input.page, 1, Number.MAX_SAFE_INTEGER)
      const pageSize = positiveInteger(input.pageSize, 25, 100)
      const values: unknown[] = [input.organizationId]
      const conditions = [
        "file.organization_id = $1",
        "file.source_system = 'artifact-service'",
      ]
      const add = (value: unknown) => {
        values.push(value)
        return `$${values.length}`
      }
      const search = normalizedOptional(input.search)?.toLowerCase()
      if (search) {
        const parameter = add(`%${search}%`)
        conditions.push(`(
          lower(file.file_name) LIKE ${parameter}
          OR EXISTS (
            SELECT 1 FROM usage_rows searched
            WHERE searched.file_id = file.id
              AND (
                lower(searched.business_record) LIKE ${parameter}
                OR lower(searched.target_schema || '.' || searched.target_table) LIKE ${parameter}
                OR lower(searched.target_id::text) LIKE ${parameter}
              )
          )
        )`)
      }
      const module = normalizedOptional(input.module)?.toLowerCase()
      if (module) {
        const parameter = add(module)
        conditions.push(`EXISTS (
          SELECT 1 FROM usage_rows filtered_module
          WHERE filtered_module.file_id = file.id
            AND filtered_module.module = ${parameter}
        )`)
      }
      const purpose = normalizedOptional(input.purpose)
      if (purpose) {
        const parameter = add(purpose)
        conditions.push(`EXISTS (
          SELECT 1 FROM usage_rows filtered_purpose
          WHERE filtered_purpose.file_id = file.id
            AND filtered_purpose.purpose = ${parameter}
        )`)
      }
      if (input.origin) conditions.push(`file.origin = ${add(input.origin)}`)
      if (input.state) {
        conditions.push(`file.lifecycle_state = ${add(input.state)}`)
      }
      const mediaType = normalizedOptional(input.mediaType)?.toLowerCase()
      if (mediaType) {
        conditions.push(
          `lower(coalesce(file.media_type, '')) = ${add(mediaType)}`
        )
      }
      if (input.dateFrom) {
        conditions.push(`file.created_at >= ${add(input.dateFrom)}::date`)
      }
      if (input.dateTo) {
        conditions.push(
          `file.created_at < (${add(input.dateTo)}::date + interval '1 day')`
        )
      }
      const offsetParameter = add((page - 1) * pageSize)
      const limitParameter = add(pageSize)

      const result = await pool.query<LedgerRow>(
        `
          WITH usage_rows AS (
            SELECT usage.file_id,
              ${moduleExpression} AS module,
              usage.purpose,
              usage.target_schema,
              usage.target_table,
              usage.target_id,
              usage.version,
              ${businessRecordExpression} AS business_record
            FROM core.file_links usage
            WHERE usage.organization_id = $1
          ), aggregated_usages AS (
            SELECT file_id,
              array_agg(DISTINCT module ORDER BY module) AS modules,
              array_agg(DISTINCT purpose ORDER BY purpose) AS purposes,
              jsonb_agg(
                jsonb_build_object(
                  'businessRecord', business_record,
                  'module', module,
                  'purpose', purpose,
                  'targetId', target_id,
                  'targetSchema', target_schema,
                  'targetTable', target_table,
                  'version', version
                ) ORDER BY module, business_record, purpose, target_id
              ) AS usages
            FROM usage_rows
            GROUP BY file_id
          )
          SELECT file.id, file.file_name, file.media_type, file.origin,
            file.lifecycle_state, file.byte_size::text, file.sha256,
            file.created_at, file.updated_at,
            actor.name AS actor_name, actor.email AS actor_email,
            file.deleted_at, file.deletion_reason,
            deleted_by.name AS deleted_by_name,
            deleted_by.email AS deleted_by_email,
            object.lifecycle_state AS object_lifecycle_state,
            CASE
              WHEN file.lifecycle_state = 'deleted'
                OR object.lifecycle_state = 'deleted' THEN NULL
              ELSE object.public_url
            END AS public_url,
            usages.modules, usages.purposes, usages.usages,
            (
              SELECT count(*)::text
              FROM core.files reference
              WHERE reference.organization_id = file.organization_id
                AND reference.physical_object_id = file.physical_object_id
                AND reference.source_system = 'artifact-service'
                AND reference.lifecycle_state <> 'deleted'
            ) AS physical_reference_count,
            count(*) OVER()::text AS total_count
          FROM core.files file
          JOIN core.file_objects object ON object.id = file.physical_object_id
          JOIN aggregated_usages usages ON usages.file_id = file.id
          LEFT JOIN identity.users actor ON actor.id = file.created_by_user_id
          LEFT JOIN identity.users deleted_by ON deleted_by.id = file.deleted_by_user_id
          WHERE ${conditions.join(" AND ")}
          ORDER BY file.created_at DESC, file.id DESC
          OFFSET ${offsetParameter} LIMIT ${limitParameter}
        `,
        values
      )
      const totalArtifacts = Number(result.rows[0]?.total_count ?? 0)
      const totals = await pool.query<{
        live_physical_objects: string
        logical_artifacts: string
        unique_live_bytes: string
      }>(
        `
          WITH logical AS (
            SELECT count(*)::text AS count
            FROM core.files
            WHERE organization_id = $1 AND source_system = 'artifact-service'
          ), live_objects AS (
            SELECT object.id, object.byte_size
            FROM core.file_objects object
            WHERE object.organization_id = $1
              AND object.lifecycle_state <> 'deleted'
              AND EXISTS (
                SELECT 1 FROM core.files live_reference
                WHERE live_reference.organization_id = $1
                  AND live_reference.physical_object_id = object.id
                  AND live_reference.source_system = 'artifact-service'
                  AND live_reference.lifecycle_state <> 'deleted'
              )
          )
          SELECT logical.count AS logical_artifacts,
            count(live_objects.id)::text AS live_physical_objects,
            coalesce(sum(live_objects.byte_size), 0)::text AS unique_live_bytes
          FROM logical
          LEFT JOIN live_objects ON true
          GROUP BY logical.count
        `,
        [input.organizationId]
      )
      const summary = totals.rows[0]!

      return {
        page,
        pageSize,
        rows: result.rows.map((row) => ({
          actorEmail: row.actor_email,
          actorName: row.actor_name,
          byteSize: Number(row.byte_size),
          createdAt: row.created_at.toISOString(),
          deletedAt: row.deleted_at?.toISOString() ?? null,
          deletedByEmail: row.deleted_by_email,
          deletedByName: row.deleted_by_name,
          deletionReason: row.deletion_reason,
          fileName: row.file_name,
          id: row.id,
          lifecycleState: row.lifecycle_state,
          mediaType: row.media_type,
          modules: row.modules,
          origin: row.origin,
          physicalReferenceCount: Number(row.physical_reference_count),
          previewKind: row.media_type?.startsWith("image/")
            ? ("image" as const)
            : row.media_type === "application/pdf"
              ? ("pdf" as const)
              : ("none" as const),
          providerState: row.object_lifecycle_state,
          publicUrl: row.public_url,
          purposes: row.purposes,
          sha256: row.sha256,
          updatedAt: row.updated_at.toISOString(),
          usages: row.usages,
        })),
        totalArtifacts,
        totalPages: Math.max(1, Math.ceil(totalArtifacts / pageSize)),
        totals: {
          allowanceBytes: artifactStorageAllowanceBytes,
          livePhysicalObjects: Number(summary.live_physical_objects),
          logicalArtifacts: Number(summary.logical_artifacts),
          uniqueLiveBytes: Number(summary.unique_live_bytes),
        },
      }
    },
  }
}
