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
    blankPieceWeight: number | null
    category: string | null
    componentItemId: string
    componentUid: string
    depth: number
    description: string
    designRevision: string | null
    drawingRequirement: string | null
    grade: string | null
    itemType: string
    lineNumber: number
    notes: string | null
    parentUid: string
    parentLineNumber: number | null
    processesRequired: string[]
    productSize: string | null
    productType: string | null
    productionType: string | null
    quantity: number
    rodSize: string | null
    rodType: string | null
    subCategory: string | null
    totalQuantity: number
    weight: number | null
  }>
  blankPieceWeight: number | null
  category: string | null
  design: null | { releasedAt: Date | null; revision: string; status: string }
  description: string
  designTaskEnquiryItemId: string | null
  dieCode: string | null
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
  processesRequired: string[]
  productSize: string | null
  productType: string | null
  productWeight: number | null
  productionType: string | null
  revisionHistory: ProductDesignRevisionHistoryRow[]
  rodSize: string | null
  rodType: string | null
  subCategory: string | null
  uid: string
}

export type ProductDesignRevisionHistoryRow = {
  approvedAt: Date | null
  approvedBy: string | null
  changeReason: string
  current: boolean
  ecnId: string | null
  ecnNumber: string | null
  effectiveOn: string | null
  releasedAt: Date | null
  revision: string
  status: string
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
  pendingUpload: boolean
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

function numeric(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNumeric(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function textValue(...values: unknown[]) {
  const value = values.find(
    (candidate) => typeof candidate === "string" && candidate.trim()
  )
  return typeof value === "string" ? value : null
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
        casting: string
        category: string | null
        description: string
        design_task_enquiry_item_id: string | null
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
        die_code: string | null
        item_type: string
        latest_ecn_number: string | null
        latest_ecn_reason: string | null
        latest_ecn_status: string | null
        product_size: string | null
        production_type: string | null
        production_process: string | null
        rod_size: string | null
        rod_type: string | null
        source_payload: Record<string, unknown> | null
        subcategory: string | null
        uid: string
        weight_100_pcs: string
      }
      const header = await pool.query<HeaderRow>(
        `
          SELECT item.uid, item.description, item.item_type,
            item.production_type, machine.name AS production_process,
            item.source_payload, item.weight_100_pcs::text,
            original_design.enquiry_item_id AS design_task_enquiry_item_id,
            item.casting::text, item.rod_size, rod_type.name AS rod_type,
            item.die_code,
            COALESCE(
              NULLIF(btrim(item.source_payload ->> 'productSize'), ''),
              NULLIF(btrim(profile.size), ''),
              NULLIF(btrim(original_design.internal_part_size), '')
            ) AS product_size,
            COALESCE(
              NULLIF(btrim(item.source_payload ->> 'category'), ''),
              NULLIF(btrim(profile.category), ''),
              NULLIF(btrim(original_design.internal_part_category), '')
            ) AS category,
            COALESCE(
              NULLIF(btrim(item.source_payload ->> 'subcategory'), ''),
              NULLIF(btrim(profile.sub_category), ''),
              NULLIF(btrim(original_design.internal_part_sub_category), '')
            ) AS subcategory,
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
          LEFT JOIN catalog.machine_types machine ON machine.id = item.machine_type_id
          LEFT JOIN catalog.rod_types rod_type ON rod_type.id = item.rod_type_id
          LEFT JOIN catalog.website_product_profiles profile
            ON profile.item_id = item.id
          LEFT JOIN sales.design_tasks original_design
            ON original_design.id::text = item.source_payload ->> 'designTaskId'
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
        blank_piece_weight: string
        category: string | null
        component_item_id: string
        component_uid: string
        depth: number
        description: string
        design_revision: string | null
        drawing_requirement: string | null
        grade: string | null
        item_type: string
        line_path: string[]
        notes: string | null
        parent_uid: string
        parent_line_path: string[] | null
        process_required: unknown
        product_size: string | null
        product_type: string | null
        production_type: string | null
        quantity: string
        rod_size: string | null
        rod_type: string | null
        subcategory: string | null
        total_quantity: string
        weight: string
      }
      const hierarchy = await pool.query<BomRow>(
        `
          WITH RECURSIVE hierarchy AS (
            SELECT line.component_item_id, line.parent_item_id,
              component.uid AS component_uid, parent.uid AS parent_uid,
              component.description, component.item_type,
              line.quantity::numeric AS quantity,
              line.quantity::numeric AS total_quantity, 1 AS depth,
              ARRAY[line.parent_item_id, line.component_item_id] AS path,
              ARRAY[line.id]::uuid[] AS line_path,
              NULL::uuid[] AS parent_line_path,
              ARRAY[line.sequence]::integer[] AS sequence_path,
              line.notes
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
              component.item_type, line.quantity::numeric,
              (hierarchy.total_quantity * line.quantity)::numeric,
              hierarchy.depth + 1,
              hierarchy.path || line.component_item_id,
              hierarchy.line_path || line.id,
              hierarchy.line_path,
              hierarchy.sequence_path || line.sequence,
              line.notes
            FROM hierarchy
            JOIN catalog.bom_lines line
              ON line.parent_item_id = hierarchy.component_item_id
            JOIN catalog.items parent ON parent.id = line.parent_item_id
            JOIN catalog.items component ON component.id = line.component_item_id
            WHERE NOT line.component_item_id = ANY(hierarchy.path)
          )
          SELECT hierarchy.depth, hierarchy.parent_uid,
            hierarchy.component_item_id, hierarchy.line_path,
            hierarchy.parent_line_path, hierarchy.notes,
            hierarchy.component_uid, hierarchy.description,
            hierarchy.item_type, hierarchy.quantity::text,
            component_design.revision_label AS design_revision,
            hierarchy.total_quantity::text,
            component.weight_100_pcs::text AS weight,
            component.casting::text AS blank_piece_weight,
            component.production_type AS product_type,
            machine.name AS production_type, component.rod_size,
            rod_type.name AS rod_type, grade.name AS grade,
            component_drawing.requirement_status AS drawing_requirement,
            COALESCE(
              NULLIF(btrim(component.source_payload ->> 'productSize'), ''),
              NULLIF(btrim(profile.size), '')
            ) AS product_size,
            COALESCE(
              NULLIF(btrim(component.source_payload ->> 'category'), ''),
              NULLIF(btrim(profile.category), '')
            ) AS category,
            COALESCE(
              NULLIF(btrim(component.source_payload ->> 'subcategory'), ''),
              NULLIF(btrim(profile.sub_category), '')
            ) AS subcategory,
            COALESCE(component.source_payload -> 'processesRequired', '[]'::jsonb)
              AS process_required
          FROM hierarchy
          JOIN catalog.items component ON component.id = hierarchy.component_item_id
          LEFT JOIN catalog.machine_types machine ON machine.id = component.machine_type_id
          LEFT JOIN catalog.rod_types rod_type ON rod_type.id = component.rod_type_id
          LEFT JOIN catalog.material_grades grade
            ON grade.id = component.material_grade_id
          LEFT JOIN catalog.drawing_revisions component_drawing
            ON component_drawing.item_id = component.id
            AND component_drawing.is_current
          LEFT JOIN catalog.product_design_revisions component_design
            ON component_design.item_id = component.id
            AND component_design.is_current
          LEFT JOIN catalog.website_product_profiles profile
            ON profile.item_id = component.id
          ORDER BY hierarchy.sequence_path, hierarchy.line_path
        `,
        [organizationCode.trim(), productUid.trim()]
      )
      const revisions = await pool.query<{
        approved_at: Date | null
        approved_by: string | null
        change_reason: string
        ecn_id: string | null
        ecn_number: string | null
        effective_on: string | null
        is_current: boolean
        released_at: Date | null
        revision_label: string
        status: string
      }>(
        `SELECT revision.revision_label, revision.status, revision.is_current,
          revision.effective_on::text, revision.change_reason,
          revision.released_at, revision.approved_at,
          ecn.id AS ecn_id, ecn.ecn_number,
          COALESCE(approved.name, approved.email) AS approved_by
         FROM catalog.product_design_revisions revision
         JOIN catalog.items item ON item.id = revision.item_id
         JOIN core.organizations organization
           ON organization.id = revision.organization_id
         LEFT JOIN sales.engineering_change_notes ecn
           ON ecn.id = revision.engineering_change_note_id
         LEFT JOIN identity.users approved
           ON approved.id = revision.approved_by_user_id
         WHERE lower(organization.code) = lower($1)
           AND lower(item.uid) = lower($2)
         ORDER BY revision.revision_number DESC`,
        [organizationCode.trim(), productUid.trim()]
      )
      const processesRequired = stringArray(
        row.source_payload?.processesRequired
      )
      const lineNumberByPath = new Map(
        hierarchy.rows.map((line, index) => [
          line.line_path?.join("/") ?? String(index),
          index + 1,
        ])
      )
      return {
        bom: hierarchy.rows.map((line, index) => ({
          blankPieceWeight: numeric(line.blank_piece_weight),
          category: line.category,
          componentItemId: line.component_item_id,
          componentUid: line.component_uid,
          depth: Number(line.depth),
          description: line.description,
          designRevision: line.design_revision,
          drawingRequirement: line.drawing_requirement,
          grade: line.grade,
          itemType: line.item_type,
          lineNumber: index + 1,
          notes: line.notes,
          parentUid: line.parent_uid,
          parentLineNumber: line.parent_line_path?.length
            ? (lineNumberByPath.get(line.parent_line_path.join("/")) ?? null)
            : null,
          processesRequired: stringArray(line.process_required),
          productSize: line.product_size,
          productType: line.product_type,
          productionType: line.production_type,
          quantity: numeric(line.quantity),
          rodSize: line.rod_size,
          rodType: line.rod_type,
          subCategory: line.subcategory,
          totalQuantity: numeric(line.total_quantity),
          weight: numeric(line.weight),
        })),
        blankPieceWeight: numeric(row.casting),
        category: row.category,
        design:
          row.design_revision && row.design_status
            ? {
                releasedAt: row.design_released_at,
                revision: row.design_revision,
                status: row.design_status,
              }
            : null,
        description: row.description,
        designTaskEnquiryItemId: row.design_task_enquiry_item_id ?? null,
        dieCode: row.die_code,
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
        processesRequired,
        productSize: row.product_size,
        productType: row.production_type,
        productWeight: numeric(row.weight_100_pcs),
        productionType: row.production_process,
        revisionHistory: revisions.rows.map((revision) => ({
          approvedAt: revision.approved_at,
          approvedBy: revision.approved_by,
          changeReason: revision.change_reason,
          current: revision.is_current,
          ecnId: revision.ecn_id,
          ecnNumber: revision.ecn_number,
          effectiveOn: revision.effective_on,
          releasedAt: revision.released_at,
          revision: revision.revision_label,
          status: revision.status,
        })),
        rodSize: row.rod_size,
        rodType: row.rod_type,
        subCategory: row.subcategory,
        uid: row.uid,
      }
    },

    async getDesignRevisionSummaryForOrganization(
      organizationCode: string,
      productUid: string,
      revisionLabel: string
    ): Promise<ProductPortfolioDossier | null> {
      type Row = {
        approved_at: Date | null
        approved_by: string | null
        bom_snapshot: unknown
        change_reason: string
        design_snapshot: Record<string, unknown>
        drawing_file_id: string | null
        drawing_file_name: string | null
        drawing_media_type: string | null
        drawing_number: string | null
        drawing_requirement: string | null
        drawing_revision: string | null
        drawing_status: string | null
        ecn_number: string | null
        ecn_reason: string | null
        ecn_status: string | null
        effective_on: string | null
        item_uid: string
        released_at: Date | null
        revision_label: string
        source_payload: Record<string, unknown> | null
        status: string
      }
      const result = await pool.query<Row>(
        `
          SELECT item.uid AS item_uid, revision.revision_label,
            revision.status, revision.effective_on::text,
            revision.change_reason, revision.design_snapshot,
            revision.bom_snapshot, revision.source_payload,
            revision.released_at, revision.approved_at,
            COALESCE(approved.name, approved.email) AS approved_by,
            ecn.ecn_number, ecn.status AS ecn_status,
            ecn.reason AS ecn_reason,
            drawing.revision_label AS drawing_revision,
            drawing.drawing_number, drawing.status AS drawing_status,
            drawing.requirement_status AS drawing_requirement,
            drawing.file_id AS drawing_file_id,
            file.file_name AS drawing_file_name,
            file.media_type AS drawing_media_type
          FROM catalog.product_design_revisions revision
          JOIN catalog.items item ON item.id = revision.item_id
          JOIN core.organizations organization
            ON organization.id = revision.organization_id
          LEFT JOIN sales.engineering_change_notes ecn
            ON ecn.id = revision.engineering_change_note_id
          LEFT JOIN identity.users approved
            ON approved.id = revision.approved_by_user_id
          LEFT JOIN catalog.drawing_revisions drawing
            ON drawing.product_design_revision_id = revision.id
          LEFT JOIN core.files file ON file.id = drawing.file_id
          WHERE lower(organization.code) = lower($1)
            AND lower(item.uid) = lower($2)
            AND revision.revision_label = $3
          LIMIT 1
        `,
        [organizationCode.trim(), productUid.trim(), revisionLabel.trim()]
      )
      const row = result.rows[0]
      if (!row) return null

      const snapshot = record(row.design_snapshot)
      const source = record(snapshot.sourcePayload ?? snapshot.source_payload)
      const revisionDetails = record(row.source_payload?.designDetails)
      const dossier = {
        ...record(source.productDesignDossier),
        ...revisionDetails,
      }
      const uid = textValue(snapshot.uid, row.item_uid) ?? row.item_uid
      const bomSnapshot = Array.isArray(row.bom_snapshot)
        ? row.bom_snapshot.map(record)
        : []
      const processesRequired = stringArray(
        snapshot.processesRequired ??
          snapshot.processes_required ??
          source.processesRequired ??
          dossier.processesRequired
      )

      return {
        blankPieceWeight: nullableNumeric(snapshot.casting ?? dossier.casting),
        bom: bomSnapshot.map((line, index) => {
          const quantity = numeric(line.quantity)
          return {
            blankPieceWeight: nullableNumeric(
              line.blankPieceWeight ?? line.casting
            ),
            category: textValue(line.category),
            componentItemId:
              textValue(line.componentItemId, line.component_item_id) ?? "",
            componentUid:
              textValue(
                line.componentUid,
                line.component_uid,
                line.componentItemId,
                line.component_item_id
              ) ?? "Unavailable",
            depth: numeric(line.depth) || 1,
            description:
              textValue(line.description) ?? "Not captured in this revision",
            designRevision: textValue(
              line.componentDesignRevision,
              line.component_design_revision,
              line.designRevision,
              line.design_revision
            ),
            drawingRequirement: textValue(
              line.drawingRequirement,
              line.drawing_requirement
            ),
            grade: textValue(line.grade),
            itemType: textValue(line.itemType, line.item_type) ?? "—",
            lineNumber: index + 1,
            notes: textValue(line.notes),
            parentUid: textValue(line.parentUid, line.parent_uid) ?? uid,
            parentLineNumber: nullableNumeric(line.parentLineNumber),
            processesRequired: stringArray(
              line.processesRequired ?? line.processes_required
            ),
            productSize: textValue(line.productSize, line.product_size),
            productType: textValue(line.productType, line.product_type),
            productionType: textValue(
              line.productionType,
              line.production_type
            ),
            quantity,
            rodSize: textValue(line.rodSize, line.rod_size),
            rodType: textValue(line.rodType, line.rod_type),
            subCategory: textValue(line.subCategory, line.sub_category),
            totalQuantity: numeric(line.totalQuantity) || quantity,
            weight: nullableNumeric(line.weight ?? line.weight100Pcs),
          }
        }),
        category: textValue(dossier.category, source.category),
        design: {
          releasedAt: row.released_at,
          revision: row.revision_label,
          status: row.status,
        },
        description:
          textValue(snapshot.description, dossier.description) ??
          "Description not captured in this revision",
        designTaskEnquiryItemId: null,
        dieCode: textValue(
          snapshot.dieCode,
          snapshot.die_code,
          dossier.dieCode
        ),
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
        itemType:
          textValue(snapshot.itemType, snapshot.item_type, dossier.itemType) ??
          "Unavailable",
        latestEcn:
          row.ecn_number && row.ecn_status && row.ecn_reason
            ? {
                number: row.ecn_number,
                reason: row.ecn_reason,
                status: row.ecn_status,
              }
            : null,
        processesRequired,
        productSize: textValue(dossier.productSize, source.productSize),
        productType: textValue(
          snapshot.productionType,
          snapshot.production_type,
          dossier.productType
        ),
        productWeight: nullableNumeric(
          snapshot.weight100Pcs ?? snapshot.weight_100_pcs ?? dossier.weight
        ),
        productionType: textValue(
          dossier.manufacturingProcess,
          dossier.productionType
        ),
        revisionHistory: [],
        rodSize: textValue(
          snapshot.rodSize,
          snapshot.rod_size,
          dossier.rodSize
        ),
        rodType: textValue(dossier.rodType),
        subCategory: textValue(
          dossier.subcategory,
          dossier.subCategory,
          source.subcategory
        ),
        uid,
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
        source_payload: Record<string, unknown> | null
        source_system: string
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
            revision.source_system, revision.source_payload,
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
        pendingUpload:
          row.source_system === "legacy-drawing-baseline" &&
          row.status === "Draft" &&
          row.file_id === null &&
          row.source_payload?.filePending === true,
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
