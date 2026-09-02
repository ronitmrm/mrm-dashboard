import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

export type ProductPortfolioRow = {
  category: string | null
  itemType: string
  mrmplDescription: string
  productType: string | null
  productSize: string | null
  rodSize: string | null
  subCategory: string | null
  uid: string
  designRevision: string | null
}

export type ProductPortfolioDossier = {
  bom: Array<{
    componentUid: string
    depth: number
    description: string
    parentUid: string
    quantity: number
  }>
  design: null | { releasedAt: Date | null; revision: string; status: string }
  description: string
  drawing: null | {
    fileId: string | null
    fileName: string | null
    mediaType: string | null
    number: string
    requirement: string
    revision: string
    status: string
  }
  itemType: string
  latestEcn: null | { number: string; reason: string; status: string }
  pricing: { productCostInr: number; processes: Record<string, number> }
  processesRequired: string[]
  productType: string | null
  uid: string
}

export type DrawingRevisionHistoryRow = {
  approvedAt: Date | null
  approvedBy: string | null
  changeReason: string
  createdAt: Date
  current: boolean
  drawingId: string
  drawingNumber: string
  effectiveOn: string | null
  ecnNumber: string | null
  fileId: string | null
  fileName: string | null
  itemDescription: string
  itemId: string
  mediaType: string | null
  raisedBy: string | null
  requirement: string
  revision: string
  status: string
  uid: string
  uploadedBy: string | null
}

type ProductPortfolioDatabaseRow = {
  category: string | null
  item_type: string
  mrmpl_description: string
  product_size: string | null
  product_type: string | null
  rod_size: string | null
  sub_category: string | null
  uid: string
  design_revision: string | null
}

function numeric(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function createProductPortfolioRepository(
  options: RepositoryPoolOptions
) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    async listForOrganization(
      organizationCode: string,
      options: { customerUid?: string } = {}
    ) {
      const customerUid = options.customerUid?.trim() ?? ""
      const result = await pool.query<ProductPortfolioDatabaseRow>(
        `
          SELECT item.uid, item.item_type,
            COALESCE(
              NULLIF(btrim(profile.size), ''),
              NULLIF(btrim(item.source_payload ->> 'productSize'), ''),
              NULLIF(btrim(design.internal_part_size), '')
            ) AS product_size,
            NULLIF(btrim(item.rod_size), '') AS rod_size,
            COALESCE(
              NULLIF(btrim(profile.category), ''),
              NULLIF(btrim(item.source_payload ->> 'category'), ''),
              NULLIF(btrim(design.internal_part_category), '')
            ) AS category,
            COALESCE(
              NULLIF(btrim(profile.sub_category), ''),
              NULLIF(btrim(item.source_payload ->> 'subcategory'), ''),
              NULLIF(btrim(design.internal_part_sub_category), '')
            ) AS sub_category,
            COALESCE(
              NULLIF(btrim(profile.product_description), ''),
              item.description
            ) AS mrmpl_description,
            item.production_type AS product_type
            , design_revision.revision_label AS design_revision
          FROM catalog.items item
          JOIN core.organizations organization
            ON organization.id = item.organization_id
          LEFT JOIN catalog.website_product_profiles profile
            ON profile.item_id = item.id
          LEFT JOIN sales.design_tasks design
            ON design.id::text = item.source_payload ->> 'designTaskId'
          LEFT JOIN LATERAL (
            SELECT revision.revision_label
            FROM catalog.product_design_revisions revision
            WHERE revision.item_id = item.id AND revision.is_current
            LIMIT 1
          ) design_revision ON true
          WHERE lower(organization.code) = lower($1)
            AND (
              (
                item.uid_kind = 'INTERNAL'
                AND item.lifecycle_status = 'P'
              )
              OR (
                $2::text <> ''
                AND (item.uid_kind = 'QUOTE' OR item.lifecycle_status = 'Q')
                AND EXISTS (
                  SELECT 1
                  FROM sales.quote_items quote
                  JOIN sales.customers customer
                    ON customer.id = quote.customer_id
                  WHERE quote.organization_id = item.organization_id
                    AND quote.item_id = item.id
                    AND lower(customer.customer_uid) = lower($2)
                    AND quote.status = 'Sent'
                    AND quote.is_active
                    AND quote.ordered_at IS NULL
                )
              )
            )
          ORDER BY CASE WHEN item.uid ~ '^[A-Za-z]+[0-9]+$'
              THEN substring(item.uid from '[0-9]+$')::bigint
              ELSE 9223372036854775807
            END,
            item.uid,
            item.id
        `,
        [organizationCode.trim(), customerUid]
      )

      const products = result.rows.map((row) => ({
        category: row.category,
        itemType: row.item_type,
        mrmplDescription: row.mrmpl_description,
        productSize: row.product_size,
        productType: row.product_type,
        rodSize: row.rod_size,
        subCategory: row.sub_category,
        uid: row.uid,
        designRevision: row.design_revision,
      }))
      return [
        ...new Map(
          products.map((product) => [product.uid.toLowerCase(), product])
        ).values(),
      ]
    },

    async getDossierForOrganization(
      organizationCode: string,
      productUid: string
    ): Promise<ProductPortfolioDossier | null> {
      type HeaderRow = {
        annealing: string
        assembly_operation_cost: string
        buffing: string
        checking: string
        deburring: string
        description: string
        design_released_at: Date | null
        design_revision: string | null
        design_status: string | null
        drawing_file_id: string | null
        drawing_file_name: string | null
        drawing_media_type: string | null
        drawing_number: string | null
        drawing_requirement: string | null
        drawing_revision: string | null
        drawing_status: string | null
        item_type: string
        latest_ecn_number: string | null
        latest_ecn_reason: string | null
        latest_ecn_status: string | null
        machining_cost: string
        marking: string
        plating: string
        product_cost_inr: string
        production_type: string | null
        sealant: string
        source_payload: Record<string, unknown> | null
        uid: string
        washing: string
      }
      const header = await pool.query<HeaderRow>(
        `
          SELECT item.uid, item.description, item.item_type,
            item.production_type, item.source_payload,
            item.product_cost_inr::text, item.machining_cost::text,
            item.washing::text, item.checking::text, item.marking::text,
            item.plating::text, item.annealing::text, item.deburring::text,
            item.buffing::text, item.sealant::text,
            item.assembly_operation_cost::text,
            design.revision_label AS design_revision,
            design.status AS design_status,
            design.released_at AS design_released_at,
            drawing.revision_label AS drawing_revision,
            drawing.drawing_number, drawing.status AS drawing_status,
            drawing.requirement_status AS drawing_requirement,
            drawing.file_id AS drawing_file_id,
            file.file_name AS drawing_file_name,
            file.media_type AS drawing_media_type,
            ecn.ecn_number AS latest_ecn_number,
            ecn.status AS latest_ecn_status,
            ecn.reason AS latest_ecn_reason
          FROM catalog.items item
          JOIN core.organizations organization
            ON organization.id = item.organization_id
          LEFT JOIN catalog.product_design_revisions design
            ON design.item_id = item.id AND design.is_current
          LEFT JOIN catalog.drawing_revisions drawing
            ON drawing.item_id = item.id AND drawing.is_current
          LEFT JOIN core.files file ON file.id = drawing.file_id
          LEFT JOIN LATERAL (
            SELECT change.ecn_number, change.status, change.reason
            FROM sales.engineering_change_notes change
            WHERE change.item_id = item.id
            ORDER BY change.created_at DESC, change.id DESC
            LIMIT 1
          ) ecn ON true
          WHERE lower(organization.code) = lower($1)
            AND lower(item.uid) = lower($2)
            AND item.lifecycle_status IN ('P', 'Q')
          LIMIT 1
        `,
        [organizationCode.trim(), productUid.trim()]
      )
      const row = header.rows[0]
      if (!row) return null

      type BomRow = {
        component_uid: string
        depth: number
        description: string
        parent_uid: string
        quantity: string
      }
      const hierarchy = await pool.query<BomRow>(
        `
          WITH RECURSIVE hierarchy AS (
            SELECT line.component_item_id, line.parent_item_id,
              component.uid AS component_uid, parent.uid AS parent_uid,
              component.description, line.quantity, 1 AS depth,
              ARRAY[line.parent_item_id, line.component_item_id] AS path
            FROM catalog.bom_lines line
            JOIN catalog.items parent ON parent.id = line.parent_item_id
            JOIN catalog.items component ON component.id = line.component_item_id
            JOIN core.organizations organization
              ON organization.id = parent.organization_id
            WHERE lower(organization.code) = lower($1)
              AND lower(parent.uid) = lower($2)
            UNION ALL
            SELECT line.component_item_id, line.parent_item_id,
              component.uid, parent.uid, component.description,
              line.quantity, hierarchy.depth + 1,
              hierarchy.path || line.component_item_id
            FROM hierarchy
            JOIN catalog.bom_lines line
              ON line.parent_item_id = hierarchy.component_item_id
            JOIN catalog.items parent ON parent.id = line.parent_item_id
            JOIN catalog.items component ON component.id = line.component_item_id
            WHERE NOT line.component_item_id = ANY(hierarchy.path)
          )
          SELECT depth, parent_uid, component_uid, description, quantity::text
          FROM hierarchy
          ORDER BY depth, parent_uid, component_uid
        `,
        [organizationCode.trim(), productUid.trim()]
      )
      const configuredProcesses = row.source_payload?.processesRequired
      const processesRequired = Array.isArray(configuredProcesses)
        ? configuredProcesses.filter(
            (value): value is string => typeof value === "string"
          )
        : []
      return {
        bom: hierarchy.rows.map((line) => ({
          componentUid: line.component_uid,
          depth: Number(line.depth),
          description: line.description,
          parentUid: line.parent_uid,
          quantity: numeric(line.quantity),
        })),
        design:
          row.design_revision && row.design_status
            ? {
                releasedAt: row.design_released_at,
                revision: row.design_revision,
                status: row.design_status,
              }
            : null,
        description: row.description,
        drawing:
          row.drawing_revision &&
          row.drawing_number &&
          row.drawing_status &&
          row.drawing_requirement
            ? {
                fileId: row.drawing_file_id,
                fileName: row.drawing_file_name,
                mediaType: row.drawing_media_type,
                number: row.drawing_number,
                requirement: row.drawing_requirement,
                revision: row.drawing_revision,
                status: row.drawing_status,
              }
            : null,
        itemType: row.item_type,
        latestEcn:
          row.latest_ecn_number &&
          row.latest_ecn_status &&
          row.latest_ecn_reason
            ? {
                number: row.latest_ecn_number,
                reason: row.latest_ecn_reason,
                status: row.latest_ecn_status,
              }
            : null,
        pricing: {
          productCostInr: numeric(row.product_cost_inr),
          processes: {
            Annealing: numeric(row.annealing),
            Assembly: numeric(row.assembly_operation_cost),
            Buffing: numeric(row.buffing),
            Checking: numeric(row.checking),
            Deburring: numeric(row.deburring),
            Machining: numeric(row.machining_cost),
            Marking: numeric(row.marking),
            Plating: numeric(row.plating),
            Sealant: numeric(row.sealant),
            Washing: numeric(row.washing),
          },
        },
        processesRequired,
        productType: row.production_type,
        uid: row.uid,
      }
    },

    async listDrawingRevisionsForOrganization(
      organizationCode: string,
      options: { uid?: string } = {}
    ): Promise<DrawingRevisionHistoryRow[]> {
      type Row = {
        approved_at: Date | null
        approved_by: string | null
        change_reason: string
        created_at: Date
        drawing_id: string
        drawing_number: string
        effective_on: string | null
        ecn_number: string | null
        file_id: string | null
        file_name: string | null
        is_current: boolean
        item_description: string
        item_id: string
        media_type: string | null
        raised_by: string | null
        requirement_status: string
        revision_label: string
        status: string
        uid: string
        uploaded_by: string | null
      }
      const result = await pool.query<Row>(
        `
          SELECT revision.id AS drawing_id, revision.item_id, item.uid,
            item.description AS item_description, revision.drawing_number,
            revision.revision_label, revision.requirement_status,
            revision.status, revision.is_current,
            revision.effective_on::text, revision.change_reason,
            revision.created_at, revision.approved_at,
            file.id AS file_id, file.file_name, file.media_type,
            ecn.ecn_number,
            COALESCE(raised.name, raised.email) AS raised_by,
            COALESCE(uploaded.name, uploaded.email) AS uploaded_by,
            COALESCE(approved.name, approved.email) AS approved_by
          FROM catalog.drawing_revisions revision
          JOIN catalog.items item ON item.id = revision.item_id
          JOIN core.organizations organization
            ON organization.id = revision.organization_id
          LEFT JOIN core.files file ON file.id = revision.file_id
          LEFT JOIN sales.engineering_change_notes ecn
            ON ecn.id = revision.engineering_change_note_id
          LEFT JOIN identity.users raised ON raised.id = revision.raised_by_user_id
          LEFT JOIN identity.users uploaded
            ON uploaded.id = revision.uploaded_by_user_id
          LEFT JOIN identity.users approved
            ON approved.id = revision.approved_by_user_id
          WHERE lower(organization.code) = lower($1)
            AND ($2::text = '' OR lower(item.uid) = lower($2))
          ORDER BY CASE WHEN item.uid ~ '^[A-Za-z]+[0-9]+$'
              THEN substring(item.uid from '[0-9]+$')::bigint
              ELSE 9223372036854775807 END,
            item.uid, revision.revision_number DESC
        `,
        [organizationCode.trim(), options.uid?.trim() ?? ""]
      )
      return result.rows.map((row) => ({
        approvedAt: row.approved_at,
        approvedBy: row.approved_by,
        changeReason: row.change_reason,
        createdAt: row.created_at,
        current: row.is_current,
        drawingId: row.drawing_id,
        drawingNumber: row.drawing_number,
        effectiveOn: row.effective_on,
        ecnNumber: row.ecn_number,
        fileId: row.file_id,
        fileName: row.file_name,
        itemDescription: row.item_description,
        itemId: row.item_id,
        mediaType: row.media_type,
        raisedBy: row.raised_by,
        requirement: row.requirement_status,
        revision: row.revision_label,
        status: row.status,
        uid: row.uid,
        uploadedBy: row.uploaded_by,
      }))
    },

    async getDrawingFileForOrganization(
      organizationCode: string,
      productUid: string,
      revisionLabel: string
    ) {
      const result = await pool.query<{
        byte_size: string
        file_name: string
        media_type: string | null
        public_url: string | null
        storage_key: string | null
      }>(
        `
          SELECT file.file_name, file.media_type, file.byte_size::text,
            file.storage_key, object.public_url
          FROM catalog.drawing_revisions revision
          JOIN catalog.items item ON item.id = revision.item_id
          JOIN core.organizations organization
            ON organization.id = revision.organization_id
          JOIN core.files file ON file.id = revision.file_id
          LEFT JOIN core.file_objects object
            ON object.id = file.physical_object_id
          WHERE lower(organization.code) = lower($1)
            AND lower(item.uid) = lower($2)
            AND revision.revision_label = $3
            AND file.lifecycle_state <> 'deleted'
          LIMIT 1
        `,
        [organizationCode.trim(), productUid.trim(), revisionLabel.trim()]
      )
      const row = result.rows[0]
      return row
        ? {
            byteSize: numeric(row.byte_size),
            fileName: row.file_name,
            mediaType: row.media_type,
            publicUrl: row.public_url,
            storageKey: row.storage_key,
          }
        : null
    },
  }
}
