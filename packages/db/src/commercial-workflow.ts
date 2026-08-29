import { createHash, randomUUID } from "node:crypto"
import path from "node:path"

import type { Pool, PoolClient, QueryResult } from "pg"

import {
  boundedResult,
  commercialSelectorLimit,
  selectorResult,
  selectorSearchTerm,
  type BoundedCommercialResult,
} from "./commercial-bounds"
import {
  deriveDesignTaskState,
  designItemType,
  designProductName,
  designTaskIsEditable,
  designTaskStatusAfterStart,
  normalizeDesignAllocatedUid,
} from "./commercial-design-domain"
import {
  repositoryPool,
  withTransaction as transaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"

type CommercialTerms = {
  conversionRate?: number
  currency?: string
  incoterms?: string | null
  packagingTerms?: string | null
  paymentTerms?: string | null
  shipmentMode?: string | null
}

function enquiryRegisterSourceId(input: {
  actorUserId?: string | null
  buyerName?: string | null
  customerId: string
  organizationId: string
  priority?: string | null
  receivedOn: string
  remarks?: string | null
  source?: string | null
}) {
  const identity = JSON.stringify([
    input.organizationId,
    input.actorUserId ?? null,
    input.customerId,
    input.receivedOn,
    input.source?.trim() || "Email",
    input.priority?.trim() || "Normal",
    input.buyerName?.trim() || "",
    input.remarks?.trim() || "",
  ])
  return `enquiry-register:${createHash("sha256").update(identity).digest("hex")}`
}

type AddEnquiryItem = {
  actorUserId?: string | null
  customerPartCode: string
  description: string
  drawingReference?: string | null
  enquiryId: string
  grade?: string | null
  organizationId: string
  quantity?: number
  remarks?: string | null
  sourceId?: string
  targetPrice?: number
}

type SalesWorkScope = {
  originatingSalespersonUserId: string
}

type TechnicalChecklist = Record<string, boolean>

type EnquirySpreadsheetDatabaseRow = {
  buyer_name: string | null
  company_name: string
  current_status: string
  customer_part_code: string | null
  customer_uid: string
  description: string
  design_part_no: string | null
  drawing_file_name: string | null
  drawing_reference: string | null
  enquiry_id: string
  enquiry_item_id: string
  enquiry_number: string
  grade: string | null
  line_number: number
  priority: string
  quantity: string
  quote_pdf_sent_at: Date | null
  quote_pdf_status: string
  received_on: string
  source: string
  target_price: string | null
}

function enquirySpreadsheetItemFromRow(row: EnquirySpreadsheetDatabaseRow) {
  return {
    buyerName: row.buyer_name,
    companyName: row.company_name,
    currentStatus: row.current_status,
    customerPartCode: row.customer_part_code,
    customerUid: row.customer_uid,
    description: row.description,
    designPartNumber: row.design_part_no,
    drawingFileName: row.drawing_file_name,
    drawingReference: row.drawing_reference,
    enquiryId: row.enquiry_id,
    enquiryItemId: row.enquiry_item_id,
    enquiryNumber: row.enquiry_number,
    grade: row.grade,
    lineNumber: row.line_number,
    priority: row.priority,
    quantity: Number(row.quantity),
    quotePdfSentAt: row.quote_pdf_sent_at,
    quotePdfStatus: row.quote_pdf_status,
    receivedOn: row.received_on,
    source: row.source,
    targetPrice: row.target_price === null ? null : Number(row.target_price),
  }
}

type TechnicalReviewDatabaseRow = {
  company_name: string
  customer_part_code: string
  customer_uid: string
  description: string
  drawing_file_name: string | null
  drawing_reference: string | null
  enquiry_id: string
  enquiry_item_id: string
  enquiry_number: string
  feasibility_reason: string | null
  grade: string | null
  latest_clarification_message: string | null
  latest_clarification_source: string | null
  line_number: number
  missing_information: string | null
  quantity: string
  reviewed_at: Date | null
  target_price: string | null
  technical_checklist: TechnicalChecklist
  technical_remarks: string | null
  technical_review_status: string
}

function technicalReviewItemFromRow(row: TechnicalReviewDatabaseRow) {
  return {
    companyName: row.company_name,
    customerPartCode: row.customer_part_code,
    customerUid: row.customer_uid,
    description: row.description,
    drawingFileName: row.drawing_file_name,
    drawingReference: row.drawing_reference,
    enquiryId: row.enquiry_id,
    enquiryItemId: row.enquiry_item_id,
    enquiryNumber: row.enquiry_number,
    feasibilityReason: row.feasibility_reason,
    grade: row.grade,
    latestClarificationMessage: row.latest_clarification_message,
    latestClarificationSource: row.latest_clarification_source,
    lineNumber: row.line_number,
    missingInformation: row.missing_information,
    quantity: Number(row.quantity),
    reviewedAt: row.reviewed_at,
    targetPrice: row.target_price === null ? null : Number(row.target_price),
    technicalChecklist: row.technical_checklist ?? {},
    technicalRemarks: row.technical_remarks,
    technicalReviewStatus: row.technical_review_status,
  }
}

type DesignBomLine = {
  bomItem?: string | null
  casting?: number | null
  componentCode: string
  componentCategory?: string | null
  componentItemType?: string
  componentProductSize?: string | null
  componentSource: string
  componentSubcategory?: string | null
  existingProductId?: string | null
  grade?: string | null
  lineNumber: number
  manufacturingProcess?: string | null
  notes?: string | null
  packagePart?: string | null
  packagePartUid?: string | null
  parentLineNumber?: number | null
  pieceWeight?: number | null
  productionType?: string | null
  processRequired?: string | null
  quantity: number
  rodSize?: string | null
  rodType?: string | null
}

type DesignAttachment = {
  byteSize: number
  createdAt: Date
  fileName: string
  id: string
  mediaType: string | null
  purpose: string
  storageKey: string
}

type DesignQueueDatabaseRow = {
  approval_status: string | null
  assembly_required: string | null
  checked_by: string | null
  company_name: string
  components_required: string | null
  customer_part_code: string
  customer_uid: string
  delivery_terms: string | null
  design_bom_completed: string | null
  design_bom_required: string | null
  design_id: string | null
  design_remarks: string | null
  design_status: string | null
  designer_name: string | null
  description: string
  drawing_reference: string | null
  enquiry_id: string
  enquiry_item_id: string
  enquiry_number: string
  enquiry_remarks: string | null
  fixture_approx_cost: string | null
  fixture_required: string | null
  feasibility_reason: string | null
  gauges_required: string | null
  grade: string | null
  inspection_approx_cost: string | null
  internal_part_category: string | null
  internal_part_size: string | null
  internal_part_sub_category: string | null
  item_type: string | null
  line_number: number
  line_remarks: string | null
  manufacturing_process: string | null
  matched_product_description: string | null
  matched_product_id: string | null
  matched_product_uid: string | null
  next_stage_status: string | null
  missing_information: string | null
  operation_notes: string | null
  organization_id: string
  package_process_required: string | null
  payment_terms: string | null
  portfolio_match_status: string | null
  quantity: string
  quoted_part_uid: string | null
  revision_no: string | null
  target_completion_date: string | null
  target_price: string | null
  technical_checklist: TechnicalChecklist
  technical_remarks: string | null
  technical_review_status: string
  tooling_approx_cost: string | null
  tooling_required: string | null
}

function designQueueItemFromRow(
  row: DesignQueueDatabaseRow,
  bomLines: DesignBomLine[],
  latestClarificationMessage: string | null,
  latestClarificationSource: string | null = null,
  customerDrawingFileName: string | null = null
) {
  return {
    approvalStatus: row.approval_status ?? "Pending",
    assemblyRequired: row.assembly_required ?? "No",
    bomLines,
    checkedBy: row.checked_by,
    companyName: row.company_name,
    componentsRequired: row.components_required,
    customerPartCode: row.customer_part_code,
    customerUid: row.customer_uid,
    customerDrawingFileName,
    deliveryTerms: row.delivery_terms ?? null,
    designBomCompleted: row.design_bom_completed ?? "No",
    designBomRequired: row.design_bom_required ?? "No",
    designId: row.design_id,
    designRemarks: row.design_remarks,
    designStatus: row.design_status ?? "Pending Design",
    designerName: row.designer_name,
    description: row.description,
    drawingReference: row.drawing_reference ?? null,
    enquiryId: row.enquiry_id,
    enquiryItemId: row.enquiry_item_id,
    enquiryNumber: row.enquiry_number,
    enquiryRemarks: row.enquiry_remarks ?? null,
    fixtureApproxCost: Number(row.fixture_approx_cost ?? 0),
    fixtureRequired: row.fixture_required ?? "No",
    feasibilityReason: row.feasibility_reason ?? null,
    gaugesRequired: row.gauges_required ?? "No",
    grade: row.grade ?? null,
    inspectionApproxCost: Number(row.inspection_approx_cost ?? 0),
    internalPartCategory: row.internal_part_category,
    internalPartSize: row.internal_part_size,
    internalPartSubCategory: row.internal_part_sub_category,
    itemType: row.item_type ?? "List",
    latestClarificationMessage,
    latestClarificationSource,
    lineNumber: row.line_number,
    lineRemarks: row.line_remarks ?? null,
    manufacturingProcess: row.manufacturing_process,
    matchedProductDescription: row.matched_product_description,
    matchedProductId: row.matched_product_id,
    matchedProductUid: row.matched_product_uid,
    nextStageStatus: row.next_stage_status ?? "Not Started",
    missingInformation: row.missing_information ?? null,
    operationNotes: row.operation_notes,
    organizationId: row.organization_id,
    packageProcessRequired: row.package_process_required,
    paymentTerms: row.payment_terms ?? null,
    portfolioMatchStatus:
      row.portfolio_match_status === "New Design Required"
        ? "New Quoted Part"
        : (row.portfolio_match_status ?? "Pending"),
    quantity: Number(row.quantity),
    quotedPartUid: row.quoted_part_uid,
    revisionNo: row.revision_no ?? "0",
    targetCompletionDate: row.target_completion_date,
    targetPrice: row.target_price == null ? null : Number(row.target_price),
    technicalChecklist: row.technical_checklist ?? {},
    technicalRemarks: row.technical_remarks ?? null,
    technicalReviewStatus: row.technical_review_status,
    toolingApproxCost: Number(row.tooling_approx_cost ?? 0),
    toolingRequired: row.tooling_required ?? "No",
  }
}

async function designRowsWithRelations(
  queryable: Pick<Pool, "query">,
  roots: readonly DesignQueueDatabaseRow[]
) {
  if (!roots.length) return []

  const itemIds = roots.map((root) => root.enquiry_item_id)
  const designIds = roots.flatMap((root) =>
    root.design_id ? [root.design_id] : []
  )
  const [bomLines, clarifications, files, drawings] = await Promise.all([
    designIds.length
      ? queryable.query<{
          bom_item: string | null
          casting: string | null
          component_code: string
          component_category: string | null
          component_item_type: string
          component_product_size: string | null
          component_source: string
          component_subcategory: string | null
          design_notes: string | null
          design_task_id: string
          existing_product_id: string | null
          grade: string | null
          line_number: number
          manufacturing_process: string | null
          package_part: string | null
          package_part_uid: string | null
          parent_line_number: number | null
          piece_weight: string | null
          production_type: string | null
          process_required: string | null
          quantity: string
          rod_size: string | null
          rod_type: string | null
        }>(
          `
            SELECT bom.design_task_id, bom.component_code,
              bom.source_payload ->> 'componentCategory' AS component_category,
              bom.component_item_type, bom.component_source,
              bom.source_payload ->> 'componentProductSize'
                AS component_product_size,
              bom.source_payload ->> 'componentSubcategory'
                AS component_subcategory,
              bom.existing_product_id, bom.line_number, bom.design_notes,
              bom.package_part, bom.package_part_uid,
              bom.parent_line_number, bom.quantity::text, bom.bom_item,
              bom.rod_size, bom.rod_type, bom.grade,
              bom.production_type, bom.manufacturing_process, bom.casting::text,
              bom.piece_weight::text, bom.process_required
            FROM sales.design_bom_lines bom
            WHERE bom.design_task_id = ANY($1::uuid[])
            ORDER BY bom.design_task_id, bom.line_number, bom.id
          `,
          [designIds]
        )
      : Promise.resolve({ rows: [] }),
    queryable.query<{
      enquiry_item_id: string
      question: string
      source_stage: string
    }>(
      `
        SELECT DISTINCT ON (clarification.enquiry_item_id)
          clarification.enquiry_item_id, clarification.question,
          clarification.source_stage
        FROM sales.clarification_tasks clarification
        WHERE clarification.enquiry_item_id = ANY($1::uuid[])
          AND clarification.target_stage = 'Design'
          AND clarification.status = 'Open'
        ORDER BY clarification.enquiry_item_id,
          clarification.created_at DESC, clarification.id DESC
      `,
      [itemIds]
    ),
    designIds.length
      ? queryable.query<{
          byte_size: string
          created_at: Date
          file_name: string
          id: string
          media_type: string | null
          purpose: string
          storage_key: string
          target_id: string
        }>(
          `
            SELECT file_link.target_id, file.id, file.file_name,
              file.media_type, file.byte_size::text, file.storage_key,
              file.created_at, file_link.purpose
            FROM core.file_links file_link
            JOIN core.files file ON file.id = file_link.file_id
            WHERE file_link.organization_id = $1
              AND file_link.target_schema = 'sales'
              AND file_link.target_table = 'design_tasks'
              AND file_link.target_id = ANY($2::uuid[])
              AND file_link.is_current
            ORDER BY file_link.target_id, file.created_at DESC, file.id DESC
          `,
          [roots[0]!.organization_id, designIds]
        )
      : Promise.resolve({ rows: [] }),
    queryable.query<{ enquiry_item_id: string; file_name: string }>(
      `
        SELECT DISTINCT ON (file_link.target_id)
          file_link.target_id AS enquiry_item_id, file.file_name
        FROM core.file_links file_link
        JOIN core.files file ON file.id = file_link.file_id
        WHERE file_link.target_schema = 'sales'
          AND file_link.target_table = 'enquiry_items'
          AND file_link.target_id = ANY($1::uuid[])
          AND file_link.purpose IN ('drawing', 'sales_clarification')
          AND file_link.is_current
        ORDER BY file_link.target_id, file.created_at DESC, file.id DESC
      `,
      [itemIds]
    ),
  ])

  const bomLinesByDesign = new Map<string, DesignBomLine[]>()
  for (const row of bomLines.rows) {
    const rows = bomLinesByDesign.get(row.design_task_id) ?? []
    rows.push({
      bomItem: row.bom_item,
      casting: row.casting === null ? null : Number(row.casting),
      componentCode: row.component_code,
      componentCategory: row.component_category,
      componentItemType: row.component_item_type,
      componentProductSize: row.component_product_size,
      componentSource: row.component_source,
      componentSubcategory: row.component_subcategory,
      existingProductId: row.existing_product_id,
      grade: row.grade,
      lineNumber: row.line_number,
      manufacturingProcess: row.manufacturing_process,
      notes: row.design_notes,
      packagePart: row.package_part,
      packagePartUid: row.package_part_uid,
      parentLineNumber: row.parent_line_number,
      pieceWeight: row.piece_weight === null ? null : Number(row.piece_weight),
      productionType: row.production_type,
      processRequired: row.process_required,
      quantity: Number(row.quantity),
      rodSize: row.rod_size,
      rodType: row.rod_type,
    })
    bomLinesByDesign.set(row.design_task_id, rows)
  }
  const clarificationByItem = new Map(
    clarifications.rows.map((row) => [row.enquiry_item_id, row] as const)
  )
  const drawingByItem = new Map(
    drawings.rows.map((row) => [row.enquiry_item_id, row.file_name] as const)
  )
  const attachmentsByDesign = new Map<string, DesignAttachment[]>()
  for (const row of files.rows) {
    const rows = attachmentsByDesign.get(row.target_id) ?? []
    rows.push({
      byteSize: Number(row.byte_size),
      createdAt: row.created_at,
      fileName: row.file_name,
      id: row.id,
      mediaType: row.media_type,
      purpose: row.purpose,
      storageKey: row.storage_key,
    })
    attachmentsByDesign.set(row.target_id, rows)
  }

  return roots.map((row) => {
    const clarification = clarificationByItem.get(row.enquiry_item_id)
    return {
      ...designQueueItemFromRow(
        row,
        row.design_id ? (bomLinesByDesign.get(row.design_id) ?? []) : [],
        clarification?.question ?? null,
        clarification?.source_stage ?? null,
        drawingByItem.get(row.enquiry_item_id) ?? null
      ),
      attachments: row.design_id
        ? (attachmentsByDesign.get(row.design_id) ?? [])
        : [],
    }
  })
}

type SalesMatchCandidate = {
  customerPartCode: string | null
  description: string
  itemType: string | null
  productId: string
  productUid: string
  quoteItemId: string
  quoteNumber: string
  revision: number
  status: string
  unitPrice: number
}

type SalesMatchCandidateDatabaseRow = {
  customer_part_code: string | null
  description: string | null
  enquiry_item_id: string
  item_type: string | null
  product_id: string | null
  product_uid: string | null
  quote_item_id: string | null
  quote_number: string | null
  revision: number | null
  status: string | null
  unit_price: string | null
}

function salesMatchCandidateFromRow(
  row: SalesMatchCandidateDatabaseRow
): SalesMatchCandidate {
  return {
    customerPartCode: row.customer_part_code,
    description: row.description!,
    itemType: row.item_type,
    productId: row.product_id!,
    productUid: row.product_uid!,
    quoteItemId: row.quote_item_id!,
    quoteNumber: row.quote_number!,
    revision: row.revision!,
    status: row.status!,
    unitPrice: Number(row.unit_price),
  }
}

async function loadSalesMatchCandidatesForItems(
  queryable: Pick<Pool, "query">,
  enquiryItemIds: readonly string[]
) {
  const grouped = new Map<
    string,
    BoundedCommercialResult<SalesMatchCandidate>
  >()
  if (!enquiryItemIds.length) return grouped

  const candidates = await queryable.query<SalesMatchCandidateDatabaseRow>(
    `
      WITH requested_input AS (
        SELECT input.id, min(input.ordinality)::bigint AS ordinal
        FROM unnest($1::uuid[]) WITH ORDINALITY input(id, ordinality)
        GROUP BY input.id
      ),
      requested AS (
        SELECT requested_input.ordinal, enquiry_item.id,
          enquiry.customer_id, enquiry.organization_id,
          enquiry_item.customer_part_code
        FROM requested_input
        JOIN sales.enquiry_items enquiry_item
          ON enquiry_item.id = requested_input.id
        JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
      )
      SELECT requested.id::text AS enquiry_item_id,
        candidate.quote_item_id, candidate.quote_number,
        candidate.revision, candidate.customer_part_code,
        candidate.unit_price, candidate.status, candidate.product_id,
        candidate.product_uid, candidate.description, candidate.item_type
      FROM requested
      LEFT JOIN LATERAL (
        SELECT quote.id AS quote_item_id, quote.quote_number,
          quote.revision, quote.customer_part_code,
          quote.unit_price::text, quote.status,
          item.id AS product_id, item.uid AS product_uid,
          item.description, item.item_type,
          CASE WHEN lower(btrim(coalesce(quote.customer_part_code, '')))
            = lower(btrim(requested.customer_part_code))
            THEN 0 ELSE 1 END AS match_rank,
          quote.sent_at, quote.updated_at
        FROM sales.quote_items quote
        JOIN catalog.items item ON item.id = quote.item_id
        WHERE quote.organization_id = requested.organization_id
          AND quote.customer_id = requested.customer_id
          AND quote.status IN ('Draft', 'Ready', 'Sent', 'Accepted', 'Ordered')
        ORDER BY match_rank, quote.sent_at DESC NULLS LAST,
          quote.updated_at DESC, quote.id DESC
        LIMIT $2
      ) candidate ON true
      ORDER BY requested.ordinal, candidate.match_rank NULLS LAST,
        candidate.sent_at DESC NULLS LAST, candidate.updated_at DESC NULLS LAST,
        candidate.quote_item_id DESC NULLS LAST
    `,
    [enquiryItemIds, commercialSelectorLimit + 1]
  )
  const rowsByItem = new Map<string, SalesMatchCandidate[]>()
  for (const row of candidates.rows) {
    const rows = rowsByItem.get(row.enquiry_item_id) ?? []
    if (row.quote_item_id) rows.push(salesMatchCandidateFromRow(row))
    rowsByItem.set(row.enquiry_item_id, rows)
  }
  for (const [enquiryItemId, rows] of rowsByItem) {
    grouped.set(enquiryItemId, selectorResult(rows))
  }
  return grouped
}

type ImportRow = {
  matchedEnquiryItemId?: string | null
  matchedItemId?: string | null
  matchedProductId?: string | null
  rawValues: Record<string, unknown>
  rowNumber: number
  status: string
  suggestedAction?: string | null
}

type ClassifiedImportRow = {
  matchNote: string
  matchedEnquiryItemId: string | null
  matchedProductId: string | null
  matchedQuoteItemId: string | null
  status: string
  suggestedAction: string
}

const asTrimmed = (value: unknown) =>
  typeof value === "string" ? value.trim() : ""

const boundedListLimit = (limit: number) =>
  Math.min(Math.max(Math.floor(limit), 1), 500)

const operationalRootLimit = (limit: number) =>
  Math.min(boundedListLimit(limit), 200)

type EnquiryRootDatabaseRow = {
  buyer_name: string | null
  company_name: string
  created_at: Date
  cursor_created_at?: string
  customer_uid: string
  enquiry_number: string
  id: string
  organization_id: string
  priority: string
  received_on: string
  remarks: string | null
  source: string
  status: string
  technical_handover_at: Date | null
  technical_handover_status: string
}

type EnquiryStatsDatabaseRow = {
  design_task_count: string
  enquiry_id: string
  item_count: string
  latest_quote_sent_at: Date | null
  not_feasible_line_count: string
  open_sales_clarification_count: string
  ordered_line_count: string
  pending_line_count: string
  po_line_count: string
  quote_item_count: string
  quote_sent_count: string
  quoted_line_count: string
  technical_started_count: string
}

type FollowupStatsDatabaseRow = {
  due_followup_count: string
  enquiry_id: string
  next_followup_due: string | null
}

type EnquiryLineExportDatabaseRow = {
  customer_part_code: string | null
  description: string
  drawing_file_name: string | null
  drawing_reference: string | null
  grade: string | null
  id: string
  line_number: number
  quantity: string
  remarks: string | null
  target_price: string | null
}

async function enquiryRowsWithRelations(
  queryable: Pick<Pool, "query">,
  roots: EnquiryRootDatabaseRow[]
) {
  if (!roots.length) return []
  const rootIds = roots.map((root) => root.id)
  const related = await queryable.query<EnquiryStatsDatabaseRow>(
    `
      SELECT root.enquiry_id,
        count(DISTINCT item.id)::text AS item_count,
        count(DISTINCT item.id) FILTER (
          WHERE quote.id IS NOT NULL
        )::text AS quoted_line_count,
        count(DISTINCT item.id) FILTER (
          WHERE po_line.id IS NOT NULL
        )::text AS ordered_line_count,
        count(DISTINCT item.id) FILTER (
          WHERE item.technical_review_status IN (
            'Pending Review', 'Need Clarification',
            'Need Sales Confirmation'
          )
        )::text AS pending_line_count,
        count(DISTINCT item.id) FILTER (
          WHERE item.technical_review_status = 'Not Feasible'
        )::text AS not_feasible_line_count,
        count(DISTINCT quote.id)::text AS quote_item_count,
        count(DISTINCT quote.id) FILTER (
          WHERE quote.sent_at IS NOT NULL
        )::text AS quote_sent_count,
        max(quote.sent_at) AS latest_quote_sent_at,
        count(DISTINCT po_line.id)::text AS po_line_count,
        count(DISTINCT item.id) FILTER (
          WHERE item.reviewed_at IS NOT NULL
        )::text AS technical_started_count,
        count(DISTINCT design.id)::text AS design_task_count,
        count(DISTINCT clarification.id)::text
          AS open_sales_clarification_count
      FROM unnest($1::uuid[]) root(enquiry_id)
      LEFT JOIN sales.enquiry_items item
        ON item.enquiry_id = root.enquiry_id
      LEFT JOIN sales.quote_items quote
        ON quote.enquiry_item_id = item.id
      LEFT JOIN sales.purchase_order_lines po_line
        ON po_line.quote_item_id = quote.id
      LEFT JOIN sales.design_tasks design
        ON design.enquiry_item_id = item.id
      LEFT JOIN sales.clarification_tasks clarification
        ON clarification.enquiry_id = root.enquiry_id
        AND clarification.target_stage = 'Sales'
        AND clarification.status = 'Open'
      GROUP BY root.enquiry_id
    `,
    [rootIds]
  )
  const followups = await queryable.query<FollowupStatsDatabaseRow>(
    `
      SELECT root.enquiry_id,
        (min(followup.due_on) FILTER (
          WHERE followup.status = 'Pending'
        ))::text AS next_followup_due,
        (count(followup.id) FILTER (
          WHERE followup.status = 'Pending'
            AND followup.due_on <= current_date
        ))::text AS due_followup_count
      FROM unnest($1::uuid[]) root(enquiry_id)
      LEFT JOIN sales.followups followup
        ON followup.enquiry_id = root.enquiry_id
      GROUP BY root.enquiry_id
    `,
    [rootIds]
  )
  const relatedByEnquiry = new Map(
    related.rows.map((row) => [row.enquiry_id, row] as const)
  )
  const followupsByEnquiry = new Map(
    followups.rows.map((row) => [row.enquiry_id, row] as const)
  )

  return roots.map((root) => {
    const stats = relatedByEnquiry.get(root.id)
    const followup = followupsByEnquiry.get(root.id)
    const quoteItemCount = Number(stats?.quote_item_count ?? 0)
    const poLineCount = Number(stats?.po_line_count ?? 0)
    const technicalStartedCount = Number(stats?.technical_started_count ?? 0)
    const designTaskCount = Number(stats?.design_task_count ?? 0)
    const openSalesClarificationCount = Number(
      stats?.open_sales_clarification_count ?? 0
    )

    return {
      buyerName: root.buyer_name,
      canDelete:
        quoteItemCount === 0 &&
        poLineCount === 0 &&
        root.technical_handover_status !== "Handed Over" &&
        technicalStartedCount === 0 &&
        designTaskCount === 0,
      canEdit:
        quoteItemCount === 0 &&
        poLineCount === 0 &&
        (root.technical_handover_status !== "Handed Over" ||
          openSalesClarificationCount > 0 ||
          (technicalStartedCount === 0 && designTaskCount === 0)),
      companyName: root.company_name,
      customerUid: root.customer_uid,
      dueFollowupCount: Number(followup?.due_followup_count ?? 0),
      enquiryNumber: root.enquiry_number,
      id: root.id,
      itemCount: Number(stats?.item_count ?? 0),
      latestQuoteSentAt: stats?.latest_quote_sent_at ?? null,
      nextFollowupDue: followup?.next_followup_due ?? null,
      notFeasibleLineCount: Number(stats?.not_feasible_line_count ?? 0),
      orderedLineCount: Number(stats?.ordered_line_count ?? 0),
      organizationId: root.organization_id,
      pendingLineCount: Number(stats?.pending_line_count ?? 0),
      priority: root.priority,
      quoteSentCount: Number(stats?.quote_sent_count ?? 0),
      quotedLineCount: Number(stats?.quoted_line_count ?? 0),
      receivedOn: root.received_on,
      remarks: root.remarks,
      source: root.source,
      status: root.status,
      technicalHandoverAt: root.technical_handover_at,
      technicalHandoverStatus: root.technical_handover_status,
    }
  })
}

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

async function classifyImportRow(
  client: PoolClient,
  input: {
    customerId: string
    enquiryId: string
    organizationId: string
    rawValues: Record<string, unknown>
  }
): Promise<ClassifiedImportRow> {
  const part = asTrimmed(input.rawValues.part)
  const description = asTrimmed(input.rawValues.description)
  const normalizedPart = part.toLowerCase()
  const normalizedDescription = description.toLowerCase()

  if (!part || !description) {
    return {
      matchNote: "Part and description are required.",
      matchedEnquiryItemId: null,
      matchedProductId: null,
      matchedQuoteItemId: null,
      status: "Missing Information",
      suggestedAction: "Skip",
    }
  }

  const exactMatch = await client.query<{
    item_id: string
    item_uid: string
    quote_item_id: string
  }>(
    `
      SELECT quote.id AS quote_item_id, quote.item_id,
        item.uid AS item_uid
      FROM sales.quote_items quote
      JOIN catalog.items item ON item.id = quote.item_id
      WHERE quote.organization_id = $1
        AND quote.customer_id = $2
        AND quote.status IN ('Draft', 'Ready', 'Sent', 'Accepted')
        AND (
          lower(btrim(coalesce(quote.customer_part_code, ''))) = $3
          OR lower(btrim(item.uid)) = $3
          OR lower(btrim(coalesce(item.converted_from_quote_uid, ''))) = $3
          OR EXISTS (
            SELECT 1
            FROM catalog.item_aliases alias
            WHERE alias.item_id = item.id
              AND alias.alias_type = 'QUOTE_UID'
              AND lower(btrim(alias.alias)) = $3
          )
          OR EXISTS (
            SELECT 1
            FROM sales.quote_product_snapshots snapshot
            WHERE snapshot.quote_item_id = quote.id
              AND lower(btrim(snapshot.item_uid)) = $3
          )
          OR EXISTS (
            SELECT 1
            FROM sales.design_tasks design
            JOIN sales.enquiry_items enquiry_item
              ON enquiry_item.id = design.enquiry_item_id
            WHERE enquiry_item.enquiry_id = quote.enquiry_id
              AND coalesce(design.matched_product_id, enquiry_item.item_id)
                = quote.item_id
              AND lower(btrim(enquiry_item.customer_part_code)) = $3
          )
        )
      ORDER BY quote.sent_at DESC NULLS LAST, quote.updated_at DESC,
        quote.id DESC
      LIMIT 1
    `,
    [input.organizationId, input.customerId, normalizedPart]
  )
  if (exactMatch.rows[0]) {
    return {
      matchNote: `Matched ${exactMatch.rows[0].item_uid}`,
      matchedEnquiryItemId: null,
      matchedProductId: exactMatch.rows[0].item_id,
      matchedQuoteItemId: exactMatch.rows[0].quote_item_id,
      status: "Existing Quoted Match",
      suggestedAction: "Commercial Requote",
    }
  }

  const inProgressMatch = await client.query<{
    design_status: string | null
    enquiry_item_id: string
    enquiry_number: string
    item_id: string | null
    line_number: number
    next_stage_status: string | null
    technical_review_status: string
  }>(
    `
      SELECT enquiry_item.id AS enquiry_item_id, enquiry.enquiry_number,
        enquiry_item.line_number, enquiry_item.technical_review_status,
        design.design_status, design.next_stage_status,
        coalesce(design.matched_product_id, enquiry_item.item_id) AS item_id
      FROM sales.enquiry_items enquiry_item
      JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
      LEFT JOIN sales.design_tasks design
        ON design.enquiry_item_id = enquiry_item.id
      WHERE enquiry.organization_id = $1
        AND enquiry.customer_id = $2
        AND enquiry.id <> $3
        AND enquiry_item.linked_enquiry_item_id IS NULL
        AND enquiry_item.technical_review_status <> 'Not Feasible'
        AND lower(btrim(enquiry_item.customer_part_code)) = $4
        AND NOT EXISTS (
          SELECT 1
          FROM sales.quote_items quote
          WHERE quote.enquiry_id = enquiry.id
            AND quote.item_id = coalesce(
              design.matched_product_id,
              enquiry_item.item_id
            )
            AND quote.status IN ('Draft', 'Ready', 'Sent', 'Accepted')
        )
      ORDER BY enquiry.created_at DESC, enquiry_item.line_number DESC,
        enquiry_item.id DESC
      LIMIT 1
    `,
    [input.organizationId, input.customerId, input.enquiryId, normalizedPart]
  )
  if (inProgressMatch.rows[0]) {
    const match = inProgressMatch.rows[0]
    const stage =
      match.next_stage_status ??
      match.design_status ??
      match.technical_review_status ??
      "In progress"
    return {
      matchNote: `In progress at ${match.enquiry_number} / Line ${match.line_number} (${stage})`,
      matchedEnquiryItemId: match.enquiry_item_id,
      matchedProductId: match.item_id,
      matchedQuoteItemId: null,
      status: "In Progress Match",
      suggestedAction: "Link to existing work",
    }
  }

  const possibleCodeMatch = await client.query<{
    item_id: string
    item_uid: string
    quote_item_id: string
  }>(
    `
      SELECT quote.id AS quote_item_id, quote.item_id,
        item.uid AS item_uid
      FROM sales.quote_items quote
      JOIN catalog.items item ON item.id = quote.item_id
      WHERE quote.organization_id = $1
        AND quote.customer_id = $2
        AND quote.status IN ('Draft', 'Ready', 'Sent', 'Accepted')
        AND lower(coalesce(quote.customer_part_code, '')) LIKE $3
      ORDER BY quote.sent_at DESC NULLS LAST, quote.updated_at DESC,
        quote.id DESC
      LIMIT 1
    `,
    [input.organizationId, input.customerId, `%${normalizedPart.slice(0, 6)}%`]
  )
  if (possibleCodeMatch.rows[0]) {
    return {
      matchNote: `Possible code match ${possibleCodeMatch.rows[0].item_uid}`,
      matchedEnquiryItemId: null,
      matchedProductId: possibleCodeMatch.rows[0].item_id,
      matchedQuoteItemId: possibleCodeMatch.rows[0].quote_item_id,
      status: "Possible Match",
      suggestedAction: "Review Manually",
    }
  }

  const descriptionMatch = await client.query<{ item_uid: string }>(
    `
      SELECT item.uid AS item_uid
      FROM sales.quote_items quote
      JOIN catalog.items item ON item.id = quote.item_id
      WHERE quote.organization_id = $1
        AND quote.customer_id = $2
        AND quote.status IN ('Draft', 'Ready', 'Sent', 'Accepted')
        AND lower(btrim(item.description)) = $3
      ORDER BY quote.sent_at DESC NULLS LAST, quote.updated_at DESC,
        quote.id DESC
      LIMIT 1
    `,
    [input.organizationId, input.customerId, normalizedDescription]
  )
  if (descriptionMatch.rows[0]) {
    return {
      matchNote: `Same description as ${descriptionMatch.rows[0].item_uid}. Confirm the customer code before matching.`,
      matchedEnquiryItemId: null,
      matchedProductId: null,
      matchedQuoteItemId: null,
      status: "Description Match - Sales Check",
      suggestedAction: "Ask Sales",
    }
  }

  return {
    matchNote: "No previous quote match found.",
    matchedEnquiryItemId: null,
    matchedProductId: null,
    matchedQuoteItemId: null,
    status: "New Line",
    suggestedAction: "Add New Line",
  }
}

type SalesFollowupHistoryRow = {
  channel: string
  companyName: string
  customerUid: string
  dueOn: string
  enquiryId: string
  enquiryNumber: string
  id: string
  note: string
  quoteItemId: string | null
  quoteNumber: string | null
  status: string
}

type SalesFollowupHistoryDatabaseRow = {
  channel: string
  company_name: string
  created_at: string
  customer_uid: string
  due_on: string
  enquiry_id: string
  enquiry_number: string
  id: string
  note: string
  quote_item_id: string | null
  quote_number: string | null
  status: string
}

type SalesSentQuoteHistoryRow = {
  companyName: string
  currency: string
  customerUid: string
  enquiryId: string
  enquiryNumber: string
  latestSentAt: Date
  nextFollowupDue: string | null
  pendingFollowups: number
  sentQuoteItems: number
  totalLines: number
}

type SalesSentQuoteHistoryDatabaseRow = {
  company_name: string
  created_at: Date
  currency: string
  cursor_created_at: string
  cursor_latest_sent_at: string
  customer_uid: string
  enquiry_id: string
  enquiry_number: string
  latest_sent_at: Date
  next_followup_due: string | null
  pending_followups: string
  sent_quote_items: string
  total_lines: string
}

async function followupsForExport(
  client: PoolClient,
  organizationCode: string,
  requestedBatchSize: number,
  scope?: SalesWorkScope
) {
  const batchSize = boundedListLimit(requestedBatchSize)
  const rows: SalesFollowupHistoryRow[] = []
  let cursorDueOn: string | null = null
  let cursorCreatedAt: string | null = null
  let cursorId: string | null = null

  while (true) {
    const batch: QueryResult<SalesFollowupHistoryDatabaseRow> =
      await client.query<SalesFollowupHistoryDatabaseRow>(
        `
        SELECT followup.id, followup.enquiry_id,
          followup.quote_item_id, followup.due_on::text,
          followup.created_at::text AS created_at,
          followup.channel, followup.status,
          followup.note, enquiry.enquiry_number, customer.customer_uid,
          customer.company_name, quote.quote_number
        FROM sales.followups followup
        JOIN sales.enquiries enquiry ON enquiry.id = followup.enquiry_id
        JOIN sales.customers customer ON customer.id = enquiry.customer_id
        JOIN core.organizations organization
          ON organization.id = followup.organization_id
        LEFT JOIN sales.quote_items quote ON quote.id = followup.quote_item_id
        WHERE lower(organization.code) = lower($1)
          AND ($6::uuid IS NULL OR enquiry.created_by_user_id = $6)
          AND (
            $2::date IS NULL
            OR (followup.due_on, followup.created_at, followup.id)
              > ($2::date, $3::timestamptz, $4::uuid)
          )
        ORDER BY followup.due_on, followup.created_at, followup.id
        LIMIT $5
      `,
        [
          organizationCode.trim(),
          cursorDueOn,
          cursorCreatedAt,
          cursorId,
          batchSize,
          scope?.originatingSalespersonUserId ?? null,
        ]
      )
    rows.push(
      ...batch.rows.map((row) => ({
        channel: row.channel,
        companyName: row.company_name,
        customerUid: row.customer_uid,
        dueOn: row.due_on,
        enquiryId: row.enquiry_id,
        enquiryNumber: row.enquiry_number,
        id: row.id,
        note: row.note,
        quoteItemId: row.quote_item_id,
        quoteNumber: row.quote_number,
        status: row.status,
      }))
    )
    if (batch.rows.length < batchSize) break
    const cursor: SalesFollowupHistoryDatabaseRow = batch.rows.at(-1)!
    cursorDueOn = cursor.due_on
    cursorCreatedAt = cursor.created_at
    cursorId = cursor.id
  }

  return rows
}

async function sentQuotesForExport(
  client: PoolClient,
  organizationCode: string,
  requestedBatchSize: number,
  scope?: SalesWorkScope
) {
  const batchSize = boundedListLimit(requestedBatchSize)
  const rows: SalesSentQuoteHistoryRow[] = []
  let cursorLatestSentAt: string | null = null
  let cursorCreatedAt: string | null = null
  let cursorId: string | null = null

  while (true) {
    const batch: QueryResult<SalesSentQuoteHistoryDatabaseRow> =
      await client.query<SalesSentQuoteHistoryDatabaseRow>(
        `
        WITH sent_enquiries AS (
          SELECT enquiry.id AS enquiry_id, enquiry.enquiry_number,
            enquiry.created_at,
            enquiry.created_at::text AS cursor_created_at,
            customer.company_name, enquiry.currency,
            count(DISTINCT item.id)::text AS total_lines,
            count(DISTINCT quote.id)::text AS sent_quote_items,
            max(quote.sent_at) AS latest_sent_at,
            max(quote.sent_at)::text AS cursor_latest_sent_at,
            min(followup.due_on) FILTER (
              WHERE followup.status = 'Pending'
            )::text AS next_followup_due,
            count(DISTINCT followup.id) FILTER (
              WHERE followup.status = 'Pending'
            )::text AS pending_followups
          FROM sales.enquiries enquiry
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          LEFT JOIN sales.enquiry_items item ON item.enquiry_id = enquiry.id
          JOIN sales.quote_items quote ON quote.enquiry_id = enquiry.id
            AND quote.status <> 'Superseded'
            AND quote.sent_at IS NOT NULL
          LEFT JOIN sales.followups followup
            ON followup.enquiry_id = enquiry.id
          WHERE lower(organization.code) = lower($1)
            AND ($6::uuid IS NULL OR enquiry.created_by_user_id = $6)
          GROUP BY enquiry.id, customer.customer_uid, customer.company_name
        )
        SELECT *
        FROM sent_enquiries
        WHERE (
          $2::timestamptz IS NULL
          OR (latest_sent_at, created_at, enquiry_id)
            < ($2::timestamptz, $3::timestamptz, $4::uuid)
        )
        ORDER BY latest_sent_at DESC, created_at DESC, enquiry_id DESC
        LIMIT $5
      `,
        [
          organizationCode.trim(),
          cursorLatestSentAt,
          cursorCreatedAt,
          cursorId,
          batchSize,
          scope?.originatingSalespersonUserId ?? null,
        ]
      )
    rows.push(
      ...batch.rows.map((row) => ({
        companyName: row.company_name,
        currency: row.currency,
        customerUid: row.customer_uid,
        enquiryId: row.enquiry_id,
        enquiryNumber: row.enquiry_number,
        latestSentAt: row.latest_sent_at,
        nextFollowupDue: row.next_followup_due,
        pendingFollowups: Number(row.pending_followups),
        sentQuoteItems: Number(row.sent_quote_items),
        totalLines: Number(row.total_lines),
      }))
    )
    if (batch.rows.length < batchSize) break
    const cursor: SalesSentQuoteHistoryDatabaseRow = batch.rows.at(-1)!
    cursorLatestSentAt = cursor.cursor_latest_sent_at
    cursorCreatedAt = cursor.cursor_created_at
    cursorId = cursor.enquiry_id
  }

  return rows
}

async function writeAuditEvent(
  client: PoolClient,
  input: {
    actorUserId?: string | null
    eventType: string
    metadata?: Record<string, unknown>
    organizationId: string
    targetId: string
    targetTable: string
  }
) {
  await client.query(
    `
      INSERT INTO audit.events (
        organization_id, event_type, target_schema, target_table, target_id,
        actor_user_id, metadata, source_system, source_table, source_id
      )
      VALUES (
        $1, $2, 'sales', $3, $4, $5, $6, 'mrm-dashboard',
        'workflow_events', $7
      )
    `,
    [
      input.organizationId,
      input.eventType,
      input.targetTable,
      input.targetId,
      input.actorUserId ?? null,
      input.metadata ?? {},
      randomUUID(),
    ]
  )
}

async function nextEnquiryNumber(client: PoolClient, organizationId: string) {
  const now = new Date()
  const year = now.getFullYear().toString().slice(-2)
  const month = (now.getMonth() + 1).toString().padStart(2, "0")
  const key = `ENQ_${year}${month}`
  const sequence = await client.query<{ current_value: string }>(
    `
      INSERT INTO core.number_sequences (
        organization_id, key, current_value, source_system, source_table,
        source_id
      )
      VALUES ($1, $2, 1, 'mrm-dashboard', 'enquiries', $2)
      ON CONFLICT (organization_id, key) DO UPDATE SET
        current_value = core.number_sequences.current_value + 1,
        updated_at = now()
      RETURNING current_value::text
    `,
    [organizationId, key]
  )
  const value = Number(sequence.rows[0]!.current_value)
  return `ENQ-${year}${month}-${value.toString().padStart(3, "0")}`
}

async function nextDesignUid(
  client: PoolClient,
  organizationId: string,
  kind: "ASSEMBLY" | "PACKAGE" | "QUOTE"
) {
  const prefix = kind === "ASSEMBLY" ? "A" : kind === "PACKAGE" ? "C" : "Q"
  const key = `DESIGN_${kind}_UID`
  const sequence = await client.query<{ current_value: string }>(
    `
      INSERT INTO core.number_sequences (
        organization_id, key, current_value, source_system, source_table,
        source_id
      )
      SELECT $1, $2,
        COALESCE(max(value), 0) + 1,
        'mrm-dashboard', 'design_tasks', $2
      FROM (
        SELECT substring(uid FROM 2)::bigint AS value
        FROM catalog.items
        WHERE organization_id = $1 AND uid ~ $3
        UNION ALL
        SELECT substring(quoted_part_uid FROM 2)::bigint AS value
        FROM sales.design_tasks
        WHERE organization_id = $1 AND quoted_part_uid ~ $3
        UNION ALL
        SELECT substring(package_part_uid FROM 2)::bigint AS value
        FROM sales.design_bom_lines
        WHERE organization_id = $1 AND package_part_uid ~ $3
      ) existing
      ON CONFLICT (organization_id, key) DO UPDATE SET
        current_value = core.number_sequences.current_value + 1,
        updated_at = now()
      RETURNING current_value::text
    `,
    [organizationId, key, `^${prefix}[0-9]+$`]
  )
  return `${prefix}${sequence.rows[0]!.current_value}`
}

async function addEnquiryItemWithClient(
  client: PoolClient,
  input: AddEnquiryItem
) {
  const customerPartCode = input.customerPartCode.trim()
  const description = input.description.trim()
  if (!customerPartCode) {
    throw new Error("Part is required.")
  }
  if (!description) {
    throw new Error("Description is required.")
  }
  if ((input.quantity ?? 0) < 0) {
    throw new Error("Quantity cannot be negative.")
  }

  const enquiry = await client.query<{ organization_id: string }>(
    `
      SELECT organization_id
      FROM sales.enquiries
      WHERE id = $1
        AND ($2::uuid IS NULL OR created_by_user_id = $2)
      FOR UPDATE
    `,
    [input.enquiryId, input.actorUserId ?? null]
  )
  if (!enquiry.rows[0]) {
    throw new Error("ENQ was not found.")
  }
  if (enquiry.rows[0].organization_id !== input.organizationId) {
    throw new Error("ENQ does not belong to this organization.")
  }
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    input.enquiryId,
  ])
  const nextLine = await client.query<{ line_number: number }>(
    `
      SELECT COALESCE(max(line_number), 0)::integer + 1 AS line_number
      FROM sales.enquiry_items
      WHERE enquiry_id = $1
    `,
    [input.enquiryId]
  )
  const lineNumber = nextLine.rows[0]!.line_number
  const sourceId = input.sourceId ?? randomUUID()
  const created = await client.query<{
    customer_part_code: string
    description: string
    id: string
    line_number: number
    technical_review_status: string
  }>(
    `
      INSERT INTO sales.enquiry_items (
        organization_id, enquiry_id, line_number, customer_part_code,
        description, quantity, target_price, grade, drawing_reference,
        remarks, status, technical_review_status, source_system,
        source_table, source_id, source_payload
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Open',
        'Pending Review', 'mrm-dashboard', 'enquiry_items', $11, $12
      )
      RETURNING id, line_number, customer_part_code, description,
        technical_review_status
    `,
    [
      input.organizationId,
      input.enquiryId,
      lineNumber,
      customerPartCode,
      description,
      input.quantity ?? 0,
      input.targetPrice ?? 0,
      input.grade ?? null,
      input.drawingReference ?? null,
      input.remarks ?? null,
      sourceId,
      input,
    ]
  )
  const row = created.rows[0]!
  await writeAuditEvent(client, {
    actorUserId: input.actorUserId,
    eventType: "enquiry_item.created",
    metadata: { lineNumber },
    organizationId: input.organizationId,
    targetId: row.id,
    targetTable: "enquiry_items",
  })
  return {
    customerPartCode: row.customer_part_code,
    description: row.description,
    id: row.id,
    lineNumber: row.line_number,
    technicalReviewStatus: row.technical_review_status,
  }
}

async function createOrUpdateClarification(
  client: PoolClient,
  input: {
    enquiryId: string
    enquiryItemId: string
    message: string
    organizationId: string
    sourceStage: string
    targetStage: string
  }
) {
  const message = input.message.trim()
  if (!message) {
    throw new Error("Clarification message is required.")
  }
  const existing = await client.query<{ id: string }>(
    `
      SELECT id
      FROM sales.clarification_tasks
      WHERE enquiry_item_id = $1
        AND target_stage = $2
        AND status = 'Open'
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `,
    [input.enquiryItemId, input.targetStage]
  )
  if (existing.rows[0]) {
    await client.query(
      `
        UPDATE sales.clarification_tasks
        SET source_stage = $1, question = $2, updated_at = now(),
          row_version = row_version + 1
        WHERE id = $3
      `,
      [input.sourceStage, message, existing.rows[0].id]
    )
    return existing.rows[0].id
  }
  const created = await client.query<{ id: string }>(
    `
      INSERT INTO sales.clarification_tasks (
        organization_id, enquiry_id, enquiry_item_id, question, status,
        source_stage, target_stage, source_system, source_table, source_id,
        source_payload
      )
      VALUES (
        $1, $2, $3, $4, 'Open', $5, $6, 'mrm-dashboard',
        'clarification_tasks', $7, $8
      )
      RETURNING id
    `,
    [
      input.organizationId,
      input.enquiryId,
      input.enquiryItemId,
      message,
      input.sourceStage,
      input.targetStage,
      randomUUID(),
      input,
    ]
  )
  return created.rows[0]!.id
}

async function getImportReviewWithClient(
  client: PoolClient,
  reviewId: string,
  scope?: SalesWorkScope
) {
  const review = await client.query<{
    enquiry_id: string
    id: string
    organization_id: string
    status: string
  }>(
    `
      SELECT review.id, review.enquiry_id, review.organization_id,
        review.status
      FROM sales.enquiry_import_reviews review
      JOIN sales.enquiries enquiry ON enquiry.id = review.enquiry_id
      WHERE review.id = $1
        AND ($2::uuid IS NULL OR enquiry.created_by_user_id = $2)
    `,
    [reviewId, scope?.originatingSalespersonUserId ?? null]
  )
  if (!review.rows[0]) {
    throw new Error("Import review was not found.")
  }
  const source = await client.query<{
    file_name: string
    public_url: string
  }>(
    `
      SELECT file.file_name, object.public_url
      FROM core.file_links link
      JOIN core.files file ON file.id = link.file_id
      JOIN core.file_objects object ON object.id = file.physical_object_id
      WHERE link.organization_id = $1
        AND link.target_schema = 'sales'
        AND link.target_table = 'enquiry_import_reviews'
        AND link.target_id = $2
        AND link.purpose = 'import_source' AND link.is_current
        AND file.lifecycle_state = 'current'
        AND object.lifecycle_state <> 'deleted'
      LIMIT 1
    `,
    [review.rows[0].organization_id, reviewId]
  )
  const rows = await client.query<{
    applied_action: string | null
    created_enquiry_item_id: string | null
    match_note: string | null
    matched_enquiry_item_id: string | null
    matched_product_id: string | null
    matched_quote_item_id: string | null
    raw_values: Record<string, unknown>
    row_number: number
    status: string
    suggested_action: string | null
  }>(
    `
      SELECT row_number, status, raw_values, applied_action,
        created_enquiry_item_id, suggested_action, match_note,
        matched_enquiry_item_id, matched_product_id, matched_quote_item_id
      FROM sales.enquiry_import_review_rows
      WHERE review_id = $1
      ORDER BY row_number
    `,
    [reviewId]
  )
  return {
    enquiryId: review.rows[0].enquiry_id,
    id: review.rows[0].id,
    rows: rows.rows.map((row) => ({
      appliedAction: row.applied_action,
      createdEnquiryItemId: row.created_enquiry_item_id,
      matchNote: row.match_note,
      matchedEnquiryItemId: row.matched_enquiry_item_id,
      matchedProductId: row.matched_product_id,
      matchedQuoteItemId: row.matched_quote_item_id,
      rawValues: row.raw_values,
      rowNumber: row.row_number,
      status: row.status,
      suggestedAction: row.suggested_action,
    })),
    sourceFile: source.rows[0]
      ? {
          fileName: source.rows[0].file_name,
          publicUrl: source.rows[0].public_url,
        }
      : null,
    status: review.rows[0].status,
  }
}

export async function authorizeImportReviewArtifactTarget(
  client: PoolClient,
  input: {
    actorUserId?: string | null
    enquiryId: string
    organizationId: string
    reviewId: string
  },
  options: { requireOpenState: boolean }
) {
  const target = await client.query<{ id: string }>(
    `
      SELECT review.id
      FROM sales.enquiry_import_reviews review
      JOIN sales.enquiries enquiry ON enquiry.id = review.enquiry_id
      WHERE review.id = $1 AND review.enquiry_id = $2
        AND review.organization_id = $3 AND enquiry.organization_id = $3
        AND ($4::boolean = false OR review.status = 'Pending')
        AND ($5::uuid IS NULL OR enquiry.created_by_user_id = $5)
      FOR UPDATE OF review, enquiry
    `,
    [
      input.reviewId,
      input.enquiryId,
      input.organizationId,
      options.requireOpenState,
      input.actorUserId ?? null,
    ]
  )
  if (!target.rows[0]) {
    throw new Error("Import Review source target was not found or is closed.")
  }
}

type CreateImportReviewInput = {
  actorUserId?: string | null
  enquiryId: string
  importKey: string
  organizationId: string
  reviewId?: string
  rows: ImportRow[]
}

async function createImportReviewWithClient(
  client: PoolClient,
  input: CreateImportReviewInput
) {
  const enquiry = await client.query<{ customer_id: string; id: string }>(
    `
      SELECT id, customer_id FROM sales.enquiries
      WHERE id = $1 AND organization_id = $2
        AND ($3::uuid IS NULL OR created_by_user_id = $3)
    `,
    [input.enquiryId, input.organizationId, input.actorUserId ?? null]
  )
  if (!enquiry.rows[0]) {
    throw new Error("ENQ was not found in this organization.")
  }
  const review = await client.query<{ id: string }>(
    `
      INSERT INTO sales.enquiry_import_reviews (
        id, organization_id, enquiry_id, status, summary, source_system,
        source_table, source_id, source_payload
      )
      VALUES (
        coalesce($6::uuid, gen_random_uuid()), $1, $2, 'Pending', $3,
        'mrm-dashboard', 'enquiry_import_reviews', $4, $5
      )
      ON CONFLICT (source_system, source_table, source_id)
      DO UPDATE SET source_id = EXCLUDED.source_id
      RETURNING id
    `,
    [
      input.organizationId,
      input.enquiryId,
      `${input.rows.length} rows`,
      input.importKey,
      input,
      input.reviewId ?? null,
    ]
  )
  for (const row of input.rows) {
    if (row.rowNumber <= 0) {
      throw new Error("Import row number must be positive.")
    }
    if (
      !asTrimmed(row.rawValues.part) &&
      !asTrimmed(row.rawValues.description)
    ) {
      continue
    }
    const classification = await classifyImportRow(client, {
      customerId: enquiry.rows[0]!.customer_id,
      enquiryId: input.enquiryId,
      organizationId: input.organizationId,
      rawValues: row.rawValues,
    })
    await client.query(
      `
        INSERT INTO sales.enquiry_import_review_rows (
          organization_id, review_id, row_number, status, raw_values,
          matched_item_id, matched_enquiry_item_id,
          matched_product_id, matched_quote_item_id, suggested_action,
          match_note, source_system, source_table, source_id,
          source_payload
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          'mrm-dashboard', 'enquiry_import_review_rows', $12, $13
        )
        ON CONFLICT (review_id, row_number) DO NOTHING
      `,
      [
        input.organizationId,
        review.rows[0]!.id,
        row.rowNumber,
        classification.status,
        row.rawValues,
        classification.matchedProductId,
        classification.matchedEnquiryItemId,
        classification.matchedProductId,
        classification.matchedQuoteItemId,
        classification.suggestedAction,
        classification.matchNote,
        `${input.importKey}:${row.rowNumber}`,
        { classification, row },
      ]
    )
  }
  return getImportReviewWithClient(
    client,
    review.rows[0]!.id,
    input.actorUserId
      ? { originatingSalespersonUserId: input.actorUserId }
      : undefined
  )
}

export async function prepareImportReviewArtifactTarget(
  client: PoolClient,
  input: CreateImportReviewInput & { reviewId: string },
  options: { isRetry: boolean }
) {
  if (options.isRetry) {
    await authorizeImportReviewArtifactTarget(client, input, {
      requireOpenState: false,
    })
    return
  }
  const review = await createImportReviewWithClient(client, input)
  if (review.id !== input.reviewId) {
    throw new Error("Import Review source target did not match its import key.")
  }
}

export type CommercialAttachmentAuthorization =
  | {
      enquiryId: string
      enquiryItemId: string
      kind: "enquiry_item"
      organizationId: string
    }
  | {
      clarificationTaskId: string
      enquiryId: string
      enquiryItemId: string
      kind: "sales_clarification"
      organizationId: string
    }
  | {
      designId: string
      enquiryId: string
      enquiryItemId: string
      kind: "design"
      organizationId: string
    }

export async function authorizeCommercialAttachmentTarget(
  client: PoolClient,
  input: CommercialAttachmentAuthorization,
  options: { actorUserId?: string | null; requireOpenState: boolean }
) {
  if (input.kind === "sales_clarification") {
    const target = await client.query<{ id: string }>(
      `
        SELECT clarification.id
        FROM sales.clarification_tasks clarification
        JOIN sales.enquiry_items enquiry_item
          ON enquiry_item.id = clarification.enquiry_item_id
        JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
        WHERE clarification.id = $1
          AND clarification.enquiry_item_id = $2
          AND clarification.enquiry_id = $3
          AND clarification.organization_id = $4
          AND enquiry_item.organization_id = $4
          AND ($5::boolean = false OR (
            clarification.target_stage = 'Sales'
            AND clarification.status = 'Open'
          ))
          AND ($6::uuid IS NULL OR enquiry.created_by_user_id = $6)
        FOR UPDATE OF clarification, enquiry_item, enquiry
      `,
      [
        input.clarificationTaskId,
        input.enquiryItemId,
        input.enquiryId,
        input.organizationId,
        options.requireOpenState,
        options.actorUserId ?? null,
      ]
    )
    if (!target.rows[0]) {
      throw new Error("Sales clarification attachment target was not found.")
    }
    return
  }

  if (input.kind === "design") {
    const target = await client.query<{
      design_status: string
      next_stage_status: string
    }>(
      `
        SELECT design.design_status, design.next_stage_status
        FROM sales.design_tasks design
        JOIN sales.enquiry_items enquiry_item
          ON enquiry_item.id = design.enquiry_item_id
        WHERE design.id = $1
          AND design.enquiry_item_id = $2
          AND enquiry_item.enquiry_id = $3
          AND design.organization_id = $4
          AND enquiry_item.organization_id = $4
        FOR UPDATE OF design, enquiry_item
      `,
      [
        input.designId,
        input.enquiryItemId,
        input.enquiryId,
        input.organizationId,
      ]
    )
    const row = target.rows[0]
    if (!row) {
      throw new Error("Design attachment target was not found.")
    }
    if (
      options.requireOpenState &&
      !designTaskIsEditable({
        designStatus: row.design_status,
        nextStageStatus: row.next_stage_status,
      })
    ) {
      throw new Error(
        "Design attachments cannot be changed because the next step has already started."
      )
    }
    return
  }

  const target = await client.query<{ id: string }>(
    `
      SELECT enquiry_item.id
      FROM sales.enquiry_items enquiry_item
      JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
      WHERE enquiry_item.id = $1
        AND enquiry_item.enquiry_id = $2
        AND enquiry_item.organization_id = $3
        AND ($4::uuid IS NULL OR enquiry.created_by_user_id = $4)
      FOR UPDATE OF enquiry_item, enquiry
    `,
    [
      input.enquiryItemId,
      input.enquiryId,
      input.organizationId,
      options.actorUserId ?? null,
    ]
  )
  if (!target.rows[0]) {
    throw new Error("Enquiry attachment target was not found.")
  }
}

export function createCommercialWorkflowRepository(
  options: RepositoryPoolOptions
) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    async createEnquiry(input: {
      actorUserId?: string | null
      buyerName?: string | null
      commercialTerms?: CommercialTerms
      customerId: string
      organizationId: string
      priority?: string
      receivedOn: string
      remarks?: string | null
      source?: string
    }) {
      return transaction(pool, async (client) => {
        const customer = await client.query<{
          default_buyer_name: string | null
          default_currency: string | null
          default_incoterms: string | null
          default_packaging_terms: string | null
          default_payment_terms: string | null
          default_shipment_mode: string | null
          id: string
        }>(
          `
            SELECT id, default_buyer_name, default_incoterms,
              default_payment_terms, default_shipment_mode,
              default_packaging_terms, default_currency
            FROM sales.customers
            WHERE id = $1 AND organization_id = $2
            FOR SHARE
          `,
          [input.customerId, input.organizationId]
        )
        if (!customer.rows[0]) {
          throw new Error("Customer was not found in this organization.")
        }
        const customerDefaults = customer.rows[0]
        const enquiryNumber = await nextEnquiryNumber(
          client,
          input.organizationId
        )
        const sourceId = randomUUID()
        const terms = input.commercialTerms ?? {}
        const created = await client.query<{
          enquiry_number: string
          id: string
          technical_handover_status: string
        }>(
          `
            INSERT INTO sales.enquiries (
              organization_id, enquiry_number, customer_id, received_on,
              status, source, priority, buyer_name, delivery_terms,
              payment_terms, currency, conversion_rate, incoterms,
              shipment_mode, packaging_terms, remarks,
              technical_handover_status, source_system, source_table,
              source_id, source_payload, created_by_user_id,
              updated_by_user_id
            )
            VALUES (
              $1, $2, $3, $4, 'Logged', $5, $6, $7, $8, $9, $10,
              $11, $8, $12, $13, $14, 'Draft', 'mrm-dashboard',
              'enquiries', $15, $16, $17, $17
            )
            RETURNING id, enquiry_number, technical_handover_status
          `,
          [
            input.organizationId,
            enquiryNumber,
            input.customerId,
            input.receivedOn,
            input.source ?? "Email",
            input.priority ?? "Normal",
            input.buyerName === undefined
              ? customerDefaults.default_buyer_name
              : input.buyerName,
            terms.incoterms === undefined
              ? customerDefaults.default_incoterms
              : terms.incoterms,
            terms.paymentTerms === undefined
              ? customerDefaults.default_payment_terms
              : terms.paymentTerms,
            terms.currency ?? customerDefaults.default_currency ?? "USD",
            terms.conversionRate ?? 1,
            terms.shipmentMode === undefined
              ? customerDefaults.default_shipment_mode
              : terms.shipmentMode,
            terms.packagingTerms === undefined
              ? customerDefaults.default_packaging_terms
              : terms.packagingTerms,
            input.remarks ?? null,
            sourceId,
            input,
            input.actorUserId ?? null,
          ]
        )
        const row = created.rows[0]!
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "enquiry.created",
          organizationId: input.organizationId,
          targetId: row.id,
          targetTable: "enquiries",
        })
        return {
          enquiryNumber: row.enquiry_number,
          id: row.id,
          technicalHandoverStatus: row.technical_handover_status,
        }
      })
    },

    async importEnquiryRegister(input: {
      actorUserId?: string | null
      organizationId: string
      receivedOn: string
      rows: Array<{
        buyerName?: string | null
        customerName?: string | null
        customerUid?: string | null
        enquiryNumber?: string | null
        priority?: string | null
        remarks?: string | null
        rowNumber: number
        source?: string | null
      }>
    }) {
      if (!input.rows.length) {
        throw new Error("Import file does not contain enquiry register rows.")
      }
      return transaction(pool, async (client) => {
        let createdCount = 0
        let updatedCount = 0
        for (const row of input.rows) {
          let customerId: string | null = null
          if (row.customerUid?.trim()) {
            const customer = await client.query<{ id: string }>(
              `
                SELECT id FROM sales.customers
                WHERE organization_id = $1
                  AND lower(btrim(customer_uid)) = lower(btrim($2))
              `,
              [input.organizationId, row.customerUid]
            )
            customerId = customer.rows[0]?.id ?? null
          }
          if (!customerId && row.customerName?.trim()) {
            const customers = await client.query<{ id: string }>(
              `
                SELECT id FROM sales.customers
                WHERE organization_id = $1
                  AND lower(btrim(company_name)) = lower(btrim($2))
              `,
              [input.organizationId, row.customerName]
            )
            if (customers.rowCount === 1) customerId = customers.rows[0]!.id
            if ((customers.rowCount ?? 0) > 1) {
              throw new Error(
                `Enquiry import row ${row.rowNumber} matches multiple customers named ${row.customerName}. Use Customer UID.`
              )
            }
          }
          if (!customerId) {
            throw new Error(
              `Enquiry import row ${row.rowNumber} needs a valid Customer UID or Customer name.`
            )
          }

          if (row.enquiryNumber?.trim()) {
            const enquiry = await client.query<{ id: string }>(
              `
                SELECT id FROM sales.enquiries
                WHERE organization_id = $1
                  AND lower(btrim(enquiry_number)) = lower(btrim($2))
                  AND ($3::uuid IS NULL OR created_by_user_id = $3)
                FOR UPDATE
              `,
              [
                input.organizationId,
                row.enquiryNumber,
                input.actorUserId ?? null,
              ]
            )
            const enquiryId = enquiry.rows[0]?.id
            if (!enquiryId) {
              throw new Error(
                `Enquiry import row ${row.rowNumber} references unknown ENQ ${row.enquiryNumber}. Leave ENQ No. blank to create a new enquiry.`
              )
            }
            const gate = await client.query<{ can_edit: boolean }>(
              `
                SELECT (
                  NOT EXISTS (
                    SELECT 1 FROM sales.quote_items quote
                    WHERE quote.enquiry_id = enquiry.id
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM sales.purchase_order_lines po_line
                    JOIN sales.quote_items quote
                      ON quote.id = po_line.quote_item_id
                    WHERE quote.enquiry_id = enquiry.id
                  )
                  AND (
                    enquiry.technical_handover_status <> 'Handed Over'
                    OR EXISTS (
                      SELECT 1 FROM sales.clarification_tasks clarification
                      WHERE clarification.enquiry_id = enquiry.id
                        AND clarification.target_stage = 'Sales'
                        AND clarification.status = 'Open'
                    )
                    OR (
                      NOT EXISTS (
                        SELECT 1 FROM sales.enquiry_items item
                        WHERE item.enquiry_id = enquiry.id
                          AND item.reviewed_at IS NOT NULL
                      )
                      AND NOT EXISTS (
                        SELECT 1 FROM sales.design_tasks design
                        JOIN sales.enquiry_items item
                          ON item.id = design.enquiry_item_id
                        WHERE item.enquiry_id = enquiry.id
                      )
                    )
                  )
                ) AS can_edit
                FROM sales.enquiries enquiry WHERE enquiry.id = $1
              `,
              [enquiryId]
            )
            if (!gate.rows[0]?.can_edit) {
              throw new Error(
                `Enquiry import row ${row.rowNumber} cannot update ${row.enquiryNumber} because the next stage has already started.`
              )
            }
            await client.query(
              `
                UPDATE sales.enquiries
                SET customer_id = $1, source = $2, priority = $3,
                  buyer_name = $4, remarks = $5,
                  updated_by_user_id = $6, updated_at = now(),
                  row_version = row_version + 1
                WHERE id = $7
              `,
              [
                customerId,
                row.source?.trim() || "Email",
                row.priority?.trim() || "Normal",
                row.buyerName?.trim() || null,
                row.remarks?.trim() || null,
                input.actorUserId ?? null,
                enquiryId,
              ]
            )
            await writeAuditEvent(client, {
              actorUserId: input.actorUserId,
              eventType: "enquiry.updated",
              metadata: { importRow: row.rowNumber },
              organizationId: input.organizationId,
              targetId: enquiryId,
              targetTable: "enquiries",
            })
            updatedCount += 1
            continue
          }

          const sourceId = enquiryRegisterSourceId({
            actorUserId: input.actorUserId,
            buyerName: row.buyerName,
            customerId,
            organizationId: input.organizationId,
            priority: row.priority,
            receivedOn: input.receivedOn,
            remarks: row.remarks,
            source: row.source,
          })
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtext('sales.enquiry-register'), hashtext($1))",
            [sourceId]
          )
          const repeatedImport = await client.query<{ id: string }>(
            `
              SELECT id FROM sales.enquiries
              WHERE source_system = 'mrm-dashboard'
                AND source_table = 'enquiries' AND source_id = $1
            `,
            [sourceId]
          )
          if (repeatedImport.rows[0]) {
            updatedCount += 1
            continue
          }
          const enquiryNumber = await nextEnquiryNumber(
            client,
            input.organizationId
          )
          const created = await client.query<{ id: string }>(
            `
              INSERT INTO sales.enquiries (
                organization_id, enquiry_number, customer_id, received_on,
                status, source, priority, buyer_name, payment_terms,
                currency, conversion_rate, remarks,
                technical_handover_status, source_system, source_table,
                source_id, source_payload, created_by_user_id,
                updated_by_user_id
              ) VALUES (
                $1, $2, $3, $4, 'Logged', $5, $6, $7, NULL,
                'USD', 1, $8, 'Draft', 'mrm-dashboard', 'enquiries',
                $9, $10, $11, $11
              ) RETURNING id
            `,
            [
              input.organizationId,
              enquiryNumber,
              customerId,
              input.receivedOn,
              row.source?.trim() || "Email",
              row.priority?.trim() || "Normal",
              row.buyerName?.trim() || null,
              row.remarks?.trim() || null,
              sourceId,
              row,
              input.actorUserId ?? null,
            ]
          )
          await writeAuditEvent(client, {
            actorUserId: input.actorUserId,
            eventType: "enquiry.created",
            metadata: { importRow: row.rowNumber },
            organizationId: input.organizationId,
            targetId: created.rows[0]!.id,
            targetTable: "enquiries",
          })
          createdCount += 1
        }
        return { createdCount, updatedCount }
      })
    },

    async addEnquiryItem(input: AddEnquiryItem) {
      return transaction(pool, (client) =>
        addEnquiryItemWithClient(client, input)
      )
    },

    async updateEnquiry(input: {
      actorUserId?: string | null
      buyerName?: string | null
      commercialTerms?: CommercialTerms
      customerId: string
      enquiryId: string
      organizationId: string
      priority?: string
      receivedOn?: string
      remarks?: string | null
      source?: string
      status?: string
    }) {
      return transaction(pool, async (client) => {
        const customer = await client.query<{ id: string }>(
          `
            SELECT id FROM sales.customers
            WHERE id = $1 AND organization_id = $2
          `,
          [input.customerId, input.organizationId]
        )
        if (!customer.rows[0]) {
          throw new Error("Customer was not found in this organization.")
        }
        const current = await client.query<{
          buyer_name: string | null
          conversion_rate: string
          currency: string
          incoterms: string | null
          packaging_terms: string | null
          payment_terms: string | null
          priority: string
          received_on: string
          remarks: string | null
          shipment_mode: string | null
          source: string
          status: string
          technical_handover_status: string
          open_sales_clarification_count: string
          po_line_count: string
          quote_item_count: string
          technical_started_count: string
          design_task_count: string
        }>(
          `
            SELECT enquiry.buyer_name, enquiry.conversion_rate::text,
              enquiry.currency, enquiry.incoterms, enquiry.packaging_terms,
              enquiry.payment_terms, enquiry.priority,
              enquiry.received_on::text, enquiry.remarks,
              enquiry.shipment_mode, enquiry.source, enquiry.status,
              enquiry.technical_handover_status,
              (
                SELECT count(*)::text
                FROM sales.quote_items quote
                WHERE quote.enquiry_id = enquiry.id
              ) AS quote_item_count,
              (
                SELECT count(*)::text
                FROM sales.purchase_order_lines po_line
                JOIN sales.quote_items quote
                  ON quote.id = po_line.quote_item_id
                WHERE quote.enquiry_id = enquiry.id
              ) AS po_line_count,
              (
                SELECT count(*)::text
                FROM sales.enquiry_items enquiry_item
                WHERE enquiry_item.enquiry_id = enquiry.id
                  AND enquiry_item.reviewed_at IS NOT NULL
              ) AS technical_started_count,
              (
                SELECT count(*)::text
                FROM sales.design_tasks design
                JOIN sales.enquiry_items enquiry_item
                  ON enquiry_item.id = design.enquiry_item_id
                WHERE enquiry_item.enquiry_id = enquiry.id
              ) AS design_task_count,
              (
                SELECT count(*)::text
                FROM sales.clarification_tasks clarification
                WHERE clarification.enquiry_id = enquiry.id
                  AND clarification.target_stage = 'Sales'
                  AND clarification.status = 'Open'
              ) AS open_sales_clarification_count
            FROM sales.enquiries enquiry
            WHERE enquiry.id = $1 AND enquiry.organization_id = $2
              AND ($3::uuid IS NULL OR enquiry.created_by_user_id = $3)
            FOR UPDATE
          `,
          [input.enquiryId, input.organizationId, input.actorUserId ?? null]
        )
        const row = current.rows[0]
        if (!row) {
          throw new Error("ENQ was not found.")
        }
        const hasLockedCommercialWork =
          Number(row.quote_item_count) > 0 || Number(row.po_line_count) > 0
        const canEditAfterHandover =
          Number(row.open_sales_clarification_count) > 0 ||
          (Number(row.technical_started_count) === 0 &&
            Number(row.design_task_count) === 0)
        if (
          hasLockedCommercialWork ||
          (row.technical_handover_status === "Handed Over" &&
            !canEditAfterHandover)
        ) {
          throw new Error(
            "This enquiry cannot be edited after downstream work has started."
          )
        }
        const terms = input.commercialTerms
        const updated = await client.query<{
          buyer_name: string | null
          id: string
          priority: string
          source: string
        }>(
          `
            UPDATE sales.enquiries
            SET customer_id = $1, received_on = $2, status = $3,
              source = $4, priority = $5, buyer_name = $6,
              remarks = $7, incoterms = $8, delivery_terms = $8,
              payment_terms = $9, currency = $10, conversion_rate = $11,
              shipment_mode = $12, packaging_terms = $13,
              updated_by_user_id = $14, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $15
            RETURNING id, source, priority, buyer_name
          `,
          [
            input.customerId,
            input.receivedOn ?? row.received_on,
            input.status ?? row.status,
            input.source ?? row.source,
            input.priority ?? row.priority,
            input.buyerName === undefined ? row.buyer_name : input.buyerName,
            input.remarks === undefined ? row.remarks : input.remarks,
            terms?.incoterms === undefined ? row.incoterms : terms.incoterms,
            terms?.paymentTerms === undefined
              ? row.payment_terms
              : terms.paymentTerms,
            terms?.currency ?? row.currency,
            terms?.conversionRate ?? Number(row.conversion_rate),
            terms?.shipmentMode === undefined
              ? row.shipment_mode
              : terms.shipmentMode,
            terms?.packagingTerms === undefined
              ? row.packaging_terms
              : terms.packagingTerms,
            input.actorUserId ?? null,
            input.enquiryId,
          ]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "enquiry.updated",
          organizationId: input.organizationId,
          targetId: input.enquiryId,
          targetTable: "enquiries",
        })
        return {
          buyerName: updated.rows[0]!.buyer_name,
          id: updated.rows[0]!.id,
          priority: updated.rows[0]!.priority,
          source: updated.rows[0]!.source,
        }
      })
    },

    async deleteEnquiry(enquiryId: string, actorUserId?: string | null) {
      return transaction(pool, async (client) => {
        const current = await client.query<{
          design_task_count: string
          organization_id: string
          po_line_count: string
          quote_item_count: string
          technical_handover_status: string
          technical_started_count: string
        }>(
          `
            SELECT enquiry.organization_id,
              enquiry.technical_handover_status,
              (
                SELECT count(*)::text FROM sales.quote_items quote
                WHERE quote.enquiry_id = enquiry.id
              ) AS quote_item_count,
              (
                SELECT count(*)::text
                FROM sales.purchase_order_lines po_line
                JOIN sales.quote_items quote
                  ON quote.id = po_line.quote_item_id
                WHERE quote.enquiry_id = enquiry.id
              ) AS po_line_count,
              (
                SELECT count(*)::text
                FROM sales.enquiry_items enquiry_item
                WHERE enquiry_item.enquiry_id = enquiry.id
                  AND enquiry_item.reviewed_at IS NOT NULL
              ) AS technical_started_count,
              (
                SELECT count(*)::text
                FROM sales.design_tasks design
                JOIN sales.enquiry_items enquiry_item
                  ON enquiry_item.id = design.enquiry_item_id
                WHERE enquiry_item.enquiry_id = enquiry.id
              ) AS design_task_count
            FROM sales.enquiries enquiry
            WHERE enquiry.id = $1
              AND ($2::uuid IS NULL OR enquiry.created_by_user_id = $2)
            FOR UPDATE
          `,
          [enquiryId, actorUserId ?? null]
        )
        const row = current.rows[0]
        if (!row) {
          throw new Error("ENQ was not found.")
        }
        if (
          Number(row.quote_item_count) > 0 ||
          Number(row.po_line_count) > 0 ||
          row.technical_handover_status === "Handed Over" ||
          Number(row.technical_started_count) > 0 ||
          Number(row.design_task_count) > 0
        ) {
          throw new Error(
            "This enquiry cannot be deleted after downstream work has started."
          )
        }
        await client.query("DELETE FROM sales.enquiries WHERE id = $1", [
          enquiryId,
        ])
        await writeAuditEvent(client, {
          actorUserId,
          eventType: "enquiry.deleted",
          organizationId: row.organization_id,
          targetId: enquiryId,
          targetTable: "enquiries",
        })
        return { id: enquiryId }
      })
    },

    async updateEnquiryItem(input: {
      actorUserId?: string | null
      customerPartCode: string
      description: string
      drawingReference?: string | null
      enquiryItemId: string
      grade?: string | null
      quantity?: number
      remarks?: string | null
      targetPrice?: number
    }) {
      const customerPartCode = input.customerPartCode.trim()
      const description = input.description.trim()
      if (!customerPartCode || !description) {
        throw new Error("Part and description are required.")
      }
      return transaction(pool, async (client) => {
        const current = await client.query<{
          customer_part_code: string
          description: string
          design_blocked: boolean
          enquiry_id: string
          open_sales_clarification_count: string
          organization_id: string
          po_line_count: string
          quote_item_count: string
          technical_handover_status: string
          technical_review_status: string
        }>(
          `
            SELECT enquiry_item.organization_id, enquiry_item.enquiry_id,
              enquiry_item.customer_part_code, enquiry_item.description,
              enquiry_item.technical_review_status,
              enquiry.technical_handover_status,
              (
                SELECT count(*)::text FROM sales.quote_items quote
                WHERE quote.enquiry_item_id = enquiry_item.id
              ) AS quote_item_count,
              (
                SELECT count(*)::text
                FROM sales.purchase_order_lines po_line
                JOIN sales.quote_items quote
                  ON quote.id = po_line.quote_item_id
                WHERE quote.enquiry_item_id = enquiry_item.id
              ) AS po_line_count,
              EXISTS (
                SELECT 1 FROM sales.design_tasks design
                WHERE design.enquiry_item_id = enquiry_item.id
                  AND (
                    design.next_stage_status IN (
                      'Product Costing', 'Product Costing Complete',
                      'Started', 'Quoted'
                    )
                    OR design.design_status IN ('Started', 'Quoted')
                  )
              ) AS design_blocked,
              (
                SELECT count(*)::text
                FROM sales.clarification_tasks clarification
                WHERE clarification.enquiry_item_id = enquiry_item.id
                  AND clarification.target_stage = 'Sales'
                  AND clarification.status = 'Open'
              ) AS open_sales_clarification_count
            FROM sales.enquiry_items enquiry_item
            JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
            WHERE enquiry_item.id = $1
              AND ($2::uuid IS NULL OR enquiry.created_by_user_id = $2)
            FOR UPDATE OF enquiry_item
          `,
          [input.enquiryItemId, input.actorUserId ?? null]
        )
        const row = current.rows[0]
        if (!row) {
          throw new Error("Line item was not found.")
        }
        const editableTechnicalStatuses = new Set([
          "Pending Review",
          "Need Clarification",
          "Need Sales Confirmation",
          "Not Feasible",
        ])
        const canEdit =
          Number(row.quote_item_count) === 0 &&
          Number(row.po_line_count) === 0 &&
          (row.technical_handover_status !== "Handed Over" ||
            (!row.design_blocked &&
              (Number(row.open_sales_clarification_count) > 0 ||
                editableTechnicalStatuses.has(row.technical_review_status))))
        if (!canEdit) {
          throw new Error(
            "This line cannot be edited after downstream work has started."
          )
        }
        const handedOver = row.technical_handover_status === "Handed Over"
        const updated = await client.query<{
          customer_part_code: string
          id: string
          technical_review_status: string
        }>(
          `
            UPDATE sales.enquiry_items
            SET customer_part_code = $1, description = $2, grade = $3,
              quantity = $4, target_price = $5, drawing_reference = $6,
              remarks = $7, status = 'Open',
              technical_review_status = CASE WHEN $8
                THEN 'Pending Review' ELSE technical_review_status END,
              technical_checklist = CASE WHEN $8
                THEN '{}'::jsonb ELSE technical_checklist END,
              missing_information = CASE WHEN $8
                THEN NULL ELSE missing_information END,
              feasibility_reason = CASE WHEN $8
                THEN NULL ELSE feasibility_reason END,
              technical_remarks = CASE WHEN $8
                THEN NULL ELSE technical_remarks END,
              reviewed_at = CASE WHEN $8 THEN NULL ELSE reviewed_at END,
              updated_by_user_id = $9, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $10
            RETURNING id, customer_part_code, technical_review_status
          `,
          [
            customerPartCode,
            description,
            input.grade ?? null,
            input.quantity ?? 0,
            input.targetPrice ?? 0,
            input.drawingReference ?? null,
            input.remarks ?? null,
            handedOver,
            input.actorUserId ?? null,
            input.enquiryItemId,
          ]
        )
        if (handedOver) {
          await client.query(
            `
              UPDATE sales.clarification_tasks
              SET status = 'Resolved',
                response = COALESCE(response, 'Line corrected by Sales'),
                resolved_at = now(), updated_at = now(),
                row_version = row_version + 1
              WHERE enquiry_item_id = $1
                AND target_stage = 'Sales'
                AND status = 'Open'
            `,
            [input.enquiryItemId]
          )
          await client.query(
            `
              DELETE FROM sales.design_bom_lines
              WHERE design_task_id IN (
                SELECT id FROM sales.design_tasks
                WHERE enquiry_item_id = $1
              )
            `,
            [input.enquiryItemId]
          )
          await client.query(
            `
              UPDATE sales.design_tasks
              SET status = 'Pending', portfolio_match_status = NULL,
                matched_product_id = NULL,
                design_status = 'Pending Design',
                quoted_part_uid = NULL, item_type = NULL,
                design_bom_completed = 'No',
                next_stage_status = 'Not Started',
                actual_completion_date = NULL, updated_at = now(),
                updated_by_user_id = $2, row_version = row_version + 1
              WHERE enquiry_item_id = $1
            `,
            [input.enquiryItemId, input.actorUserId ?? null]
          )
        }
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "enquiry_item.corrected",
          metadata: {
            previousDescription: row.description,
            previousPart: row.customer_part_code,
          },
          organizationId: row.organization_id,
          targetId: input.enquiryItemId,
          targetTable: "enquiry_items",
        })
        return {
          customerPartCode: updated.rows[0]!.customer_part_code,
          id: updated.rows[0]!.id,
          technicalReviewStatus: updated.rows[0]!.technical_review_status,
        }
      })
    },

    async handOverToTechnicalReview(
      enquiryId: string,
      actorUserId?: string | null
    ) {
      return transaction(pool, async (client) => {
        const enquiry = await client.query<{
          conversion_rate: string
          currency: string
          id: string
          incoterms: string | null
          packaging_terms: string | null
          payment_terms: string | null
          shipment_mode: string | null
        }>(
          `
            SELECT id, incoterms, payment_terms, shipment_mode,
              packaging_terms, currency, conversion_rate::text
            FROM sales.enquiries
            WHERE id = $1
              AND ($2::uuid IS NULL OR created_by_user_id = $2)
            FOR UPDATE
          `,
          [enquiryId, actorUserId ?? null]
        )
        const row = enquiry.rows[0]
        if (!row) {
          throw new Error("ENQ was not found.")
        }
        const counts = await client.query<{
          line_count: string
          sales_hold_count: string
        }>(
          `
            SELECT count(*)::text AS line_count,
              count(*) FILTER (
                WHERE technical_review_status = 'Need Sales Confirmation'
              )::text AS sales_hold_count
            FROM sales.enquiry_items
            WHERE enquiry_id = $1
          `,
          [enquiryId]
        )
        if (Number(counts.rows[0]!.line_count) === 0) {
          throw new Error(
            "Add at least one line item before handing over to Technical Review."
          )
        }
        if (Number(counts.rows[0]!.sales_hold_count) > 0) {
          throw new Error(
            "Resolve pending Sales confirmation before handing over to Technical Review."
          )
        }
        const missingTerms = [
          !row.incoterms?.trim() ? "Incoterms" : null,
          !row.payment_terms?.trim() ? "Payment Terms" : null,
          !row.shipment_mode?.trim() ? "Shipment Mode" : null,
          !row.packaging_terms?.trim() ? "Packaging" : null,
          !row.currency?.trim() ? "Currency" : null,
          Number(row.conversion_rate) <= 0 ? "FX / Exchange Rate" : null,
        ].filter(Boolean)
        if (missingTerms.length) {
          throw new Error(
            `Complete commercial terms before handover: ${missingTerms.join(", ")}.`
          )
        }
        const updated = await client.query<{
          id: string
          technical_handover_status: string
        }>(
          `
            UPDATE sales.enquiries
            SET technical_handover_status = 'Handed Over',
              technical_handover_at = now(), updated_at = now(),
              row_version = row_version + 1
            WHERE id = $1
            RETURNING id, technical_handover_status
          `,
          [enquiryId]
        )
        await writeAuditEvent(client, {
          actorUserId,
          eventType: "enquiry.handed_over",
          organizationId: (
            await client.query<{ organization_id: string }>(
              "SELECT organization_id FROM sales.enquiries WHERE id = $1",
              [enquiryId]
            )
          ).rows[0]!.organization_id,
          targetId: enquiryId,
          targetTable: "enquiries",
        })
        return {
          id: updated.rows[0]!.id,
          technicalHandoverStatus: updated.rows[0]!.technical_handover_status,
        }
      })
    },

    async updateTechnicalReview(input: {
      actorUserId?: string | null
      checklist: TechnicalChecklist
      enquiryItemId: string
      feasibilityReason?: string | null
      grade?: string | null
      missingInformation?: string | null
      status: string
      technicalRemarks?: string | null
    }) {
      return transaction(pool, async (client) => {
        const line = await client.query<{
          enquiry_id: string
          organization_id: string
        }>(
          `
            SELECT enquiry_id, organization_id
            FROM sales.enquiry_items
            WHERE id = $1
            FOR UPDATE
          `,
          [input.enquiryItemId]
        )
        if (!line.rows[0]) {
          throw new Error("Line item was not found.")
        }
        const updated = await client.query<{
          id: string
          technical_review_status: string
        }>(
          `
            UPDATE sales.enquiry_items
            SET grade = COALESCE($1, grade), technical_review_status = $2,
              technical_checklist = $3, missing_information = $4,
              feasibility_reason = $5, technical_remarks = $6,
              reviewed_at = now(), updated_at = now(),
              row_version = row_version + 1
            WHERE id = $7
            RETURNING id, technical_review_status
          `,
          [
            input.grade ?? null,
            input.status,
            input.checklist,
            input.missingInformation ?? null,
            input.feasibilityReason ?? null,
            input.technicalRemarks ?? null,
            input.enquiryItemId,
          ]
        )
        if (input.status === "Need Clarification") {
          await createOrUpdateClarification(client, {
            enquiryId: line.rows[0].enquiry_id,
            enquiryItemId: input.enquiryItemId,
            message:
              input.missingInformation?.trim() ||
              input.technicalRemarks?.trim() ||
              "Technical Review needs clarification from Sales before this line can proceed.",
            organizationId: line.rows[0].organization_id,
            sourceStage: "Technical Review",
            targetStage: "Sales",
          })
        }
        if (
          input.status === "Feasible" ||
          input.status === "Duplicate / Existing Product"
        ) {
          await client.query(
            `
              UPDATE sales.clarification_tasks
              SET status = 'Resolved',
                response = COALESCE($1, response),
                resolved_at = now(), updated_at = now(),
                row_version = row_version + 1
              WHERE enquiry_item_id = $2
                AND target_stage = 'Technical'
                AND status = 'Open'
            `,
            [input.technicalRemarks ?? null, input.enquiryItemId]
          )
          await client.query(
            `
              UPDATE sales.design_tasks
              SET design_status = CASE
                    WHEN design_status = 'Need Clarification'
                      THEN 'Pending Design'
                    ELSE design_status
                  END,
                updated_at = now(), row_version = row_version + 1
              WHERE enquiry_item_id = $1
                AND design_status = 'Need Clarification'
            `,
            [input.enquiryItemId]
          )
        }
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "enquiry_item.technical_reviewed",
          metadata: { status: input.status },
          organizationId: line.rows[0].organization_id,
          targetId: input.enquiryItemId,
          targetTable: "enquiry_items",
        })
        return {
          id: updated.rows[0]!.id,
          technicalReviewStatus: updated.rows[0]!.technical_review_status,
        }
      })
    },

    async listSalesHandoverQueue(
      organizationCode: string,
      requestedLimit?: number,
      scope?: SalesWorkScope
    ) {
      const result = await pool.query<{
        company_name: string
        conversion_rate: string
        currency: string
        customer_uid: string
        enquiry_id: string
        enquiry_number: string
        incoterms: string | null
        packaging_terms: string | null
        payment_terms: string | null
        received_on: string
        sales_hold_lines: string
        shipment_mode: string | null
        technical_handover_status: string
        total_lines: string
      }>(
        `
          SELECT enquiry.id AS enquiry_id, enquiry.enquiry_number,
            customer.customer_uid, customer.company_name,
            enquiry.received_on::text,
            count(enquiry_item.id)::text AS total_lines,
            count(enquiry_item.id) FILTER (
              WHERE enquiry_item.technical_review_status
                = 'Need Sales Confirmation'
            )::text AS sales_hold_lines,
            enquiry.technical_handover_status, enquiry.incoterms,
            enquiry.payment_terms, enquiry.shipment_mode,
            enquiry.packaging_terms, enquiry.currency,
            enquiry.conversion_rate::text
          FROM sales.enquiries enquiry
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          JOIN sales.enquiry_items enquiry_item
            ON enquiry_item.enquiry_id = enquiry.id
          WHERE organization.code = $1
            AND enquiry.technical_handover_status <> 'Handed Over'
            AND ($3::uuid IS NULL OR enquiry.created_by_user_id = $3)
          GROUP BY enquiry.id, customer.customer_uid, customer.company_name
          ORDER BY enquiry.created_at DESC, enquiry.id DESC
          LIMIT $2
        `,
        [
          organizationCode.trim(),
          requestedLimit === undefined
            ? null
            : boundedListLimit(requestedLimit),
          scope?.originatingSalespersonUserId ?? null,
        ]
      )
      return result.rows.map((row) => ({
        companyName: row.company_name,
        conversionRate: Number(row.conversion_rate),
        currency: row.currency,
        customerUid: row.customer_uid,
        enquiryId: row.enquiry_id,
        enquiryNumber: row.enquiry_number,
        incoterms: row.incoterms,
        packagingTerms: row.packaging_terms,
        paymentTerms: row.payment_terms,
        receivedOn: row.received_on,
        salesHoldLines: Number(row.sales_hold_lines),
        shipmentMode: row.shipment_mode,
        technicalHandoverStatus: row.technical_handover_status,
        totalLines: Number(row.total_lines),
      }))
    },

    async listSalesQuoteReadyQueue(
      organizationCode: string,
      requestedLimit?: number,
      scope?: SalesWorkScope
    ) {
      const result = await pool.query<{
        company_name: string
        currency: string
        customer_uid: string
        enquiry_id: string
        enquiry_number: string
        latest_quote_at: Date | null
        not_quoted_lines: string
        quoted_lines: string
        total_lines: string
      }>(
        `
          SELECT enquiry.id AS enquiry_id, enquiry.enquiry_number,
            customer.customer_uid, customer.company_name,
            enquiry.currency, count(DISTINCT item.id)::text AS total_lines,
            count(DISTINCT quote.enquiry_item_id)::text AS quoted_lines,
            count(DISTINCT item.id) FILTER (
              WHERE item.technical_review_status = 'Not Feasible'
            )::text AS not_quoted_lines,
            max(quote.updated_at) AS latest_quote_at
          FROM sales.enquiries enquiry
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          JOIN sales.enquiry_items item ON item.enquiry_id = enquiry.id
          LEFT JOIN sales.quote_items quote
            ON quote.enquiry_item_id = item.id
            AND quote.status IN ('Ready', 'Sent', 'Accepted', 'Ordered')
          WHERE organization.code = $1
            AND ($3::uuid IS NULL OR enquiry.created_by_user_id = $3)
            AND EXISTS (
              SELECT 1 FROM sales.quote_items ready_quote
              WHERE ready_quote.enquiry_id = enquiry.id
                AND ready_quote.status = 'Ready'
                AND ready_quote.sent_at IS NULL
            )
            AND NOT EXISTS (
              SELECT 1 FROM sales.enquiry_items pending_item
              WHERE pending_item.enquiry_id = enquiry.id
                AND pending_item.technical_review_status <> 'Not Feasible'
                AND NOT EXISTS (
                  SELECT 1 FROM sales.quote_items resolved_quote
                  WHERE resolved_quote.enquiry_item_id = pending_item.id
                    AND resolved_quote.status IN (
                      'Ready', 'Sent', 'Accepted', 'Ordered'
                    )
                )
            )
          GROUP BY enquiry.id, customer.customer_uid, customer.company_name
          ORDER BY latest_quote_at DESC NULLS LAST,
            enquiry.created_at DESC, enquiry.id DESC
          LIMIT $2
        `,
        [
          organizationCode.trim(),
          requestedLimit === undefined
            ? null
            : boundedListLimit(requestedLimit),
          scope?.originatingSalespersonUserId ?? null,
        ]
      )
      return result.rows.map((row) => ({
        companyName: row.company_name,
        currency: row.currency,
        customerUid: row.customer_uid,
        enquiryId: row.enquiry_id,
        enquiryNumber: row.enquiry_number,
        latestQuoteAt: row.latest_quote_at,
        notQuotedLines: Number(row.not_quoted_lines),
        quotedLines: Number(row.quoted_lines),
        totalLines: Number(row.total_lines),
      }))
    },

    async listSalesSentQuoteQueue(
      organizationCode: string,
      requestedLimit = commercialSelectorLimit,
      scope?: SalesWorkScope
    ) {
      const result = await pool.query<{
        company_name: string
        currency: string
        customer_uid: string
        enquiry_id: string
        enquiry_number: string
        latest_sent_at: Date
        next_followup_due: string | null
        pending_followups: string
        sent_quote_items: string
        total_lines: string
      }>(
        `
          SELECT enquiry.id AS enquiry_id, enquiry.enquiry_number,
            customer.customer_uid, customer.company_name,
            enquiry.currency,
            count(DISTINCT item.id)::text AS total_lines,
            count(DISTINCT quote.id)::text AS sent_quote_items,
            max(quote.sent_at) AS latest_sent_at,
            min(followup.due_on) FILTER (
              WHERE followup.status = 'Pending'
            )::text AS next_followup_due,
            count(DISTINCT followup.id) FILTER (
              WHERE followup.status = 'Pending'
            )::text AS pending_followups
          FROM sales.enquiries enquiry
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          LEFT JOIN sales.enquiry_items item ON item.enquiry_id = enquiry.id
          JOIN sales.quote_items quote ON quote.enquiry_id = enquiry.id
            AND quote.status <> 'Superseded'
            AND quote.sent_at IS NOT NULL
          LEFT JOIN sales.followups followup
            ON followup.enquiry_id = enquiry.id
          WHERE organization.code = $1
            AND ($3::uuid IS NULL OR enquiry.created_by_user_id = $3)
          GROUP BY enquiry.id, customer.customer_uid, customer.company_name
          ORDER BY latest_sent_at DESC, enquiry.created_at DESC,
            enquiry.id DESC
          LIMIT $2
        `,
        [
          organizationCode.trim(),
          Math.min(
            boundedListLimit(requestedLimit),
            commercialSelectorLimit + 1
          ),
          scope?.originatingSalespersonUserId ?? null,
        ]
      )
      return result.rows.map((row) => ({
        companyName: row.company_name,
        currency: row.currency,
        customerUid: row.customer_uid,
        enquiryId: row.enquiry_id,
        enquiryNumber: row.enquiry_number,
        latestSentAt: row.latest_sent_at,
        nextFollowupDue: row.next_followup_due,
        pendingFollowups: Number(row.pending_followups),
        sentQuoteItems: Number(row.sent_quote_items),
        totalLines: Number(row.total_lines),
      }))
    },

    async listSalesClarificationQueue(
      organizationCode: string,
      requestedLimit?: number,
      scope?: SalesWorkScope
    ) {
      const result = await pool.query<{
        clarification_task_id: string
        company_name: string
        customer_id: string
        customer_part_code: string
        customer_uid: string
        description: string
        drawing_reference: string | null
        enquiry_id: string
        enquiry_item_id: string
        enquiry_number: string
        grade: string | null
        line_number: number
        organization_id: string
        quantity: string
        question: string
        target_price: string | null
      }>(
        `
          SELECT clarification.id AS clarification_task_id,
            enquiry.id AS enquiry_id, enquiry.enquiry_number,
            enquiry_item.id AS enquiry_item_id, enquiry_item.line_number,
            enquiry_item.customer_part_code, enquiry_item.description,
            enquiry_item.grade, enquiry_item.quantity::text,
            enquiry_item.target_price::text, enquiry_item.drawing_reference,
            clarification.question, customer.id AS customer_id,
            customer.customer_uid, customer.company_name,
            enquiry.organization_id
          FROM sales.clarification_tasks clarification
          JOIN sales.enquiry_items enquiry_item
            ON enquiry_item.id = clarification.enquiry_item_id
          JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          WHERE organization.code = $1
            AND ($3::uuid IS NULL OR enquiry.created_by_user_id = $3)
            AND clarification.target_stage = 'Sales'
            AND clarification.status = 'Open'
          ORDER BY clarification.created_at, clarification.id
          LIMIT $2
        `,
        [
          organizationCode.trim(),
          requestedLimit === undefined
            ? null
            : boundedListLimit(requestedLimit),
          scope?.originatingSalespersonUserId ?? null,
        ]
      )
      return result.rows.map((row) => ({
        clarificationTaskId: row.clarification_task_id,
        companyName: row.company_name,
        customerId: row.customer_id,
        customerPartCode: row.customer_part_code,
        customerUid: row.customer_uid,
        description: row.description,
        drawingReference: row.drawing_reference,
        enquiryId: row.enquiry_id,
        enquiryItemId: row.enquiry_item_id,
        enquiryNumber: row.enquiry_number,
        grade: row.grade,
        lineNumber: row.line_number,
        organizationId: row.organization_id,
        quantity: Number(row.quantity),
        question: row.question,
        targetPrice:
          row.target_price === null ? null : Number(row.target_price),
      }))
    },

    async listSalesMatchCandidates(enquiryItemId: string) {
      const results = await loadSalesMatchCandidatesForItems(pool, [
        enquiryItemId,
      ])
      const result = results.get(enquiryItemId)
      if (!result) throw new Error("Line item was not found.")
      return result.rows
    },

    async listSalesMatchCandidatesForItems(enquiryItemIds: readonly string[]) {
      const results = await loadSalesMatchCandidatesForItems(
        pool,
        enquiryItemIds
      )
      return new Map(
        [...results].map(([enquiryItemId, result]) => [
          enquiryItemId,
          result.rows,
        ])
      )
    },

    async listSalesMatchCandidatesForItemsBounded(
      enquiryItemIds: readonly string[]
    ) {
      return loadSalesMatchCandidatesForItems(pool, enquiryItemIds)
    },

    async searchSalesMatchCandidates(enquiryItemId: string, value: string) {
      const { containsPattern, query } = selectorSearchTerm(value)
      const candidates = await pool.query<SalesMatchCandidateDatabaseRow>(
        `
          WITH requested AS (
            SELECT enquiry_item.id, enquiry.customer_id,
              enquiry.organization_id, enquiry_item.customer_part_code
            FROM sales.enquiry_items enquiry_item
            JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
            WHERE enquiry_item.id = $1
          )
          SELECT requested.id::text AS enquiry_item_id,
            quote.id AS quote_item_id, quote.quote_number,
            quote.revision, quote.customer_part_code,
            quote.unit_price::text, quote.status,
            item.id AS product_id, item.uid AS product_uid,
            item.description, item.item_type
          FROM requested
          JOIN sales.quote_items quote
            ON quote.organization_id = requested.organization_id
            AND quote.customer_id = requested.customer_id
          JOIN catalog.items item ON item.id = quote.item_id
          WHERE quote.status IN (
            'Draft', 'Ready', 'Sent', 'Accepted', 'Ordered'
          )
            AND (
              $2::text = ''
              OR lower(btrim(coalesce(quote.customer_part_code, ''))) = $2
              OR lower(btrim(quote.quote_number)) = $2
              OR lower(item.uid) = $2
              OR (
                $3::text IS NOT NULL
                AND (
                  lower(
                    btrim(coalesce(quote.customer_part_code, '')) || ' ' ||
                    btrim(quote.quote_number)
                  ) LIKE $3
                  OR lower(
                    coalesce(item.uid, '') || ' ' ||
                    coalesce(item.description, '')
                  ) LIKE $3
                )
              )
            )
          ORDER BY CASE WHEN
              lower(btrim(coalesce(quote.customer_part_code, ''))) = $2
              OR lower(btrim(quote.quote_number)) = $2
              OR lower(item.uid) = $2
            THEN 0 ELSE 1 END,
            CASE WHEN lower(btrim(coalesce(quote.customer_part_code, '')))
              = lower(btrim(requested.customer_part_code))
              THEN 0 ELSE 1 END,
            quote.sent_at DESC NULLS LAST, quote.updated_at DESC,
            quote.id DESC
          LIMIT $4
        `,
        [enquiryItemId, query, containsPattern, commercialSelectorLimit + 1]
      )
      return selectorResult(candidates.rows.map(salesMatchCandidateFromRow))
    },

    async getTechnicalReviewQueueSummary(organizationCode: string) {
      const result = await pool.query<{
        need_clarification: string
        open_review_tasks: string
        pending_review: string
      }>(
        `
          SELECT count(*) FILTER (
              WHERE enquiry_item.technical_review_status = 'Need Clarification'
            )::text AS need_clarification,
            count(*)::text AS open_review_tasks,
            count(*) FILTER (
              WHERE enquiry_item.technical_review_status = 'Pending Review'
            )::text AS pending_review
          FROM sales.enquiry_items enquiry_item
          JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          WHERE lower(organization.code) = lower($1)
            AND enquiry_item.linked_enquiry_item_id IS NULL
            AND enquiry.technical_handover_status = 'Handed Over'
            AND enquiry_item.technical_review_status IN (
              'Pending Review', 'Need Clarification'
            )
            AND NOT EXISTS (
              SELECT 1 FROM sales.clarification_tasks sales_clarification
              WHERE sales_clarification.enquiry_item_id = enquiry_item.id
                AND sales_clarification.status = 'Open'
                AND sales_clarification.target_stage = 'Sales'
            )
        `,
        [organizationCode.trim()]
      )
      const summary = result.rows[0]!
      return {
        needClarification: Number(summary.need_clarification),
        openReviewTasks: Number(summary.open_review_tasks),
        pendingReview: Number(summary.pending_review),
      }
    },

    async getTechnicalReviewItem(
      organizationCode: string,
      enquiryItemId: string
    ) {
      const result = await pool.query<TechnicalReviewDatabaseRow>(
        `
          SELECT enquiry_item.id AS enquiry_item_id,
            enquiry.id AS enquiry_id, enquiry.enquiry_number,
            customer.customer_uid, customer.company_name,
            enquiry_item.line_number, enquiry_item.customer_part_code,
            enquiry_item.description, enquiry_item.grade,
            enquiry_item.quantity::text, enquiry_item.target_price::text,
            enquiry_item.drawing_reference,
            drawing.file_name AS drawing_file_name,
            enquiry_item.technical_review_status,
            enquiry_item.technical_checklist,
            enquiry_item.missing_information,
            enquiry_item.feasibility_reason,
            enquiry_item.technical_remarks, enquiry_item.reviewed_at,
            clarification.question AS latest_clarification_message,
            clarification.source_stage AS latest_clarification_source
          FROM sales.enquiry_items enquiry_item
          JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          LEFT JOIN LATERAL (
            SELECT file.file_name
            FROM core.file_links file_link
            JOIN core.files file ON file.id = file_link.file_id
            WHERE file_link.target_schema = 'sales'
              AND file_link.target_table = 'enquiry_items'
              AND file_link.target_id = enquiry_item.id
              AND file_link.purpose IN ('drawing', 'sales_clarification')
              AND file_link.is_current
            ORDER BY file.created_at DESC, file.id DESC
            LIMIT 1
          ) drawing ON true
          LEFT JOIN LATERAL (
            SELECT task.question, task.source_stage
            FROM sales.clarification_tasks task
            WHERE task.enquiry_item_id = enquiry_item.id
              AND task.status = 'Open'
              AND task.target_stage = 'Technical'
            ORDER BY task.created_at DESC, task.id DESC
            LIMIT 1
          ) clarification ON true
          WHERE lower(organization.code) = lower($1)
            AND enquiry_item.id = $2
            AND enquiry_item.linked_enquiry_item_id IS NULL
            AND enquiry.technical_handover_status = 'Handed Over'
            AND enquiry_item.technical_review_status IN (
              'Pending Review', 'Need Clarification'
            )
            AND NOT EXISTS (
              SELECT 1 FROM sales.clarification_tasks sales_clarification
              WHERE sales_clarification.enquiry_item_id = enquiry_item.id
                AND sales_clarification.status = 'Open'
                AND sales_clarification.target_stage = 'Sales'
            )
        `,
        [organizationCode.trim(), enquiryItemId]
      )
      return result.rows[0] ? technicalReviewItemFromRow(result.rows[0]) : null
    },

    async listTechnicalReviewQueue(organizationCode: string) {
      const result = await pool.query<{
        company_name: string
        customer_part_code: string
        customer_uid: string
        description: string
        drawing_reference: string | null
        enquiry_id: string
        enquiry_item_id: string
        enquiry_number: string
        feasibility_reason: string | null
        grade: string | null
        latest_clarification_message: string | null
        latest_clarification_source: string | null
        line_number: number
        missing_information: string | null
        quantity: string
        reviewed_at: Date | null
        target_price: string | null
        technical_checklist: TechnicalChecklist
        technical_remarks: string | null
        technical_review_status: string
      }>(
        `
          SELECT enquiry_item.id AS enquiry_item_id,
            enquiry.id AS enquiry_id, enquiry.enquiry_number,
            customer.customer_uid, customer.company_name,
            enquiry_item.line_number, enquiry_item.customer_part_code,
            enquiry_item.description, enquiry_item.grade,
            enquiry_item.quantity::text, enquiry_item.target_price::text,
            enquiry_item.drawing_reference,
            enquiry_item.technical_review_status,
            enquiry_item.technical_checklist,
            enquiry_item.missing_information,
            enquiry_item.feasibility_reason,
            enquiry_item.technical_remarks, enquiry_item.reviewed_at,
            (
              SELECT clarification.question
              FROM sales.clarification_tasks clarification
              WHERE clarification.enquiry_item_id = enquiry_item.id
                AND clarification.status = 'Open'
                AND clarification.target_stage = 'Technical'
              ORDER BY clarification.created_at DESC, clarification.id DESC
              LIMIT 1
            ) AS latest_clarification_message,
            (
              SELECT clarification.source_stage
              FROM sales.clarification_tasks clarification
              WHERE clarification.enquiry_item_id = enquiry_item.id
                AND clarification.status = 'Open'
                AND clarification.target_stage = 'Technical'
              ORDER BY clarification.created_at DESC, clarification.id DESC
              LIMIT 1
            ) AS latest_clarification_source
          FROM sales.enquiry_items enquiry_item
          JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          WHERE organization.code = $1
            AND enquiry_item.linked_enquiry_item_id IS NULL
            AND enquiry.technical_handover_status = 'Handed Over'
            AND enquiry_item.technical_review_status IN (
              'Pending Review', 'Need Clarification'
            )
            AND NOT EXISTS (
              SELECT 1 FROM sales.clarification_tasks sales_clarification
              WHERE sales_clarification.enquiry_item_id = enquiry_item.id
                AND sales_clarification.status = 'Open'
                AND sales_clarification.target_stage = 'Sales'
            )
          ORDER BY CASE enquiry_item.technical_review_status
              WHEN 'Pending Review' THEN 0
              WHEN 'Need Clarification' THEN 1
              WHEN 'Feasible' THEN 2
              WHEN 'Not Feasible' THEN 3
              ELSE 5
            END,
            enquiry.created_at DESC, enquiry_item.line_number
        `,
        [organizationCode.trim()]
      )
      return result.rows.map((row) => ({
        companyName: row.company_name,
        customerPartCode: row.customer_part_code,
        customerUid: row.customer_uid,
        description: row.description,
        drawingReference: row.drawing_reference,
        enquiryId: row.enquiry_id,
        enquiryItemId: row.enquiry_item_id,
        enquiryNumber: row.enquiry_number,
        feasibilityReason: row.feasibility_reason,
        grade: row.grade,
        latestClarificationMessage: row.latest_clarification_message,
        latestClarificationSource: row.latest_clarification_source,
        lineNumber: row.line_number,
        missingInformation: row.missing_information,
        quantity: Number(row.quantity),
        reviewedAt: row.reviewed_at,
        targetPrice:
          row.target_price === null ? null : Number(row.target_price),
        technicalChecklist: row.technical_checklist ?? {},
        technicalRemarks: row.technical_remarks,
        technicalReviewStatus: row.technical_review_status,
      }))
    },

    async listDesignPortfolioProducts(organizationCode: string) {
      const products = await pool.query<{
        description: string
        id: string
        item_type: string
        uid: string
      }>(
        `
          SELECT item.id, item.uid, item.description, item.item_type
          FROM catalog.items item
          JOIN core.organizations organization
            ON organization.id = item.organization_id
          WHERE organization.code = $1
            AND item.uid_kind = 'INTERNAL'
            AND item.lifecycle_status = 'P'
          ORDER BY item.uid
        `,
        [organizationCode.trim()]
      )
      return products.rows.map((row) => ({
        description: row.description,
        id: row.id,
        itemType: row.item_type,
        uid: row.uid,
      }))
    },

    async getDesignWorkspaceOptions(organizationCode: string) {
      const [
        designers,
        categories,
        subcategories,
        processes,
        machineTypes,
        materialGrades,
        rodTypes,
        rodSizes,
      ] = await Promise.all([
        pool.query<{ name: string }>(
          `
              SELECT DISTINCT btrim(post.employee_name) AS name
              FROM recruitment.posts post
              JOIN core.organizations organization
                ON organization.id = post.organization_id
              WHERE lower(organization.code) = lower($1)
                AND nullif(btrim(post.employee_name), '') IS NOT NULL
                AND (
                  post.status = 'Occupied'
                  OR (
                    post.status = 'Appointed'
                    AND post.joining_date <= current_date
                  )
                  OR (
                    post.status = 'Resigned'
                    AND post.last_working_date >= current_date
                  )
                )
                AND (
                  EXISTS (
                    SELECT 1
                    FROM identity.post_role_assignments assignment
                    JOIN identity.roles role ON role.id = assignment.role_id
                    WHERE assignment.post_id = post.id
                      AND role.key = 'design-team'
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM identity.employee_links employee_link
                    JOIN identity.user_roles user_role
                      ON user_role.user_id = employee_link.user_id
                    JOIN identity.roles role ON role.id = user_role.role_id
                    WHERE employee_link.organization_id = post.organization_id
                      AND lower(btrim(employee_link.employee_code)) =
                        lower(btrim(post.employee_code))
                      AND role.key = 'design-team'
                  )
                )
              ORDER BY name
            `,
          [organizationCode.trim()]
        ),
        pool.query<{ name: string }>(
          `
              SELECT category.name
              FROM catalog.item_categories category
              JOIN core.organizations organization
                ON organization.id = category.organization_id
              WHERE lower(organization.code) = lower($1)
              ORDER BY lower(category.name)
            `,
          [organizationCode.trim()]
        ),
        pool.query<{ category: string; name: string }>(
          `
              SELECT category.name AS category, subcategory.name
              FROM catalog.item_subcategories subcategory
              JOIN catalog.item_categories category
                ON category.id = subcategory.category_id
              JOIN core.organizations organization
                ON organization.id = subcategory.organization_id
              WHERE lower(organization.code) = lower($1)
              ORDER BY lower(category.name), lower(subcategory.name)
            `,
          [organizationCode.trim()]
        ),
        pool.query<{ name: string }>(
          `
              SELECT process.name
              FROM catalog.design_processes process
              JOIN core.organizations organization
                ON organization.id = process.organization_id
              WHERE lower(organization.code) = lower($1)
              ORDER BY lower(process.name)
            `,
          [organizationCode.trim()]
        ),
        pool.query<{ name: string }>(
          `
              SELECT machine_type.name
              FROM catalog.machine_types machine_type
              JOIN core.organizations organization
                ON organization.id = machine_type.organization_id
              WHERE lower(organization.code) = lower($1)
              ORDER BY lower(machine_type.name)
            `,
          [organizationCode.trim()]
        ),
        pool.query<{ name: string }>(
          `
              SELECT grade.name
              FROM catalog.material_grades grade
              JOIN core.organizations organization
                ON organization.id = grade.organization_id
              WHERE lower(organization.code) = lower($1)
              ORDER BY lower(grade.name)
            `,
          [organizationCode.trim()]
        ),
        pool.query<{ name: string }>(
          `
              SELECT rod_type.name
              FROM catalog.rod_types rod_type
              JOIN core.organizations organization
                ON organization.id = rod_type.organization_id
              WHERE lower(organization.code) = lower($1)
              ORDER BY lower(rod_type.name)
            `,
          [organizationCode.trim()]
        ),
        pool.query<{ name: string }>(
          `
              SELECT DISTINCT btrim(item.rod_size) AS name
              FROM catalog.items item
              JOIN core.organizations organization
                ON organization.id = item.organization_id
              WHERE lower(organization.code) = lower($1)
                AND item.lifecycle_status = 'P'
                AND nullif(btrim(item.rod_size), '') IS NOT NULL
              ORDER BY name
            `,
          [organizationCode.trim()]
        ),
      ])

      return {
        categories: categories.rows.map((row) => row.name),
        designers: designers.rows.map((row) => row.name),
        machineTypes: machineTypes.rows.map((row) => row.name),
        materialGrades: materialGrades.rows.map((row) => row.name),
        processes: processes.rows.map((row) => row.name),
        rodSizes: rodSizes.rows.map((row) => row.name),
        rodTypes: rodTypes.rows.map((row) => row.name),
        subcategories: subcategories.rows,
      }
    },

    async listDesignQueue(organizationCode: string) {
      const items = await pool.query<
        DesignQueueDatabaseRow & {
          bom_lines: DesignBomLine[]
          latest_clarification_message: string | null
          latest_clarification_source: string | null
        }
      >(
        `
          SELECT enquiry_item.id AS enquiry_item_id,
            enquiry.id AS enquiry_id, enquiry.organization_id,
            enquiry.enquiry_number, customer.customer_uid,
            customer.company_name, enquiry_item.line_number,
            enquiry_item.customer_part_code, enquiry_item.description,
            enquiry.delivery_terms, enquiry.payment_terms,
            enquiry.remarks AS enquiry_remarks,
            enquiry_item.quantity::text, enquiry_item.grade,
            enquiry_item.target_price::text,
            enquiry_item.remarks AS line_remarks,
            enquiry_item.drawing_reference,
            enquiry_item.technical_review_status,
            enquiry_item.technical_checklist,
            enquiry_item.technical_remarks,
            enquiry_item.missing_information,
            enquiry_item.feasibility_reason,
            design.id AS design_id, design.design_status,
            design.portfolio_match_status, design.matched_product_id,
            matched_product.uid AS matched_product_uid,
            matched_product.description AS matched_product_description,
            design.quoted_part_uid, design.item_type,
            design.design_bom_completed, design.next_stage_status,
            design.manufacturing_process, design.package_process_required,
            design.design_remarks, design.designer_name,
            design.target_completion_date::text,
            design.internal_part_size, design.internal_part_sub_category,
            design.internal_part_category, design.revision_no,
            design.design_bom_required, design.components_required,
            design.assembly_required, design.operation_notes,
            design.tooling_required, design.tooling_approx_cost::text,
            design.fixture_required, design.fixture_approx_cost::text,
            design.gauges_required, design.inspection_approx_cost::text,
            design.checked_by, design.approval_status,
            COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'componentCode', bom.component_code,
                  'componentItemType', bom.component_item_type,
                  'componentSource', bom.component_source,
                  'existingProductId', bom.existing_product_id,
                  'bomItem', bom.bom_item,
                  'casting', bom.casting,
                  'grade', bom.grade,
                  'lineNumber', bom.line_number,
                  'manufacturingProcess', bom.manufacturing_process,
                  'notes', bom.design_notes,
                  'packagePart', bom.package_part,
                  'packagePartUid', bom.package_part_uid,
                  'parentLineNumber', bom.parent_line_number,
                  'pieceWeight', bom.piece_weight,
                  'productionType', bom.production_type,
                  'processRequired', bom.process_required,
                  'quantity', bom.quantity,
                  'rodSize', bom.rod_size,
                  'rodType', bom.rod_type
                )
                ORDER BY bom.line_number
              )
              FROM sales.design_bom_lines bom
              WHERE bom.design_task_id = design.id
            ), '[]'::jsonb) AS bom_lines,
            (
              SELECT clarification.question
              FROM sales.clarification_tasks clarification
              WHERE clarification.enquiry_item_id = enquiry_item.id
                AND clarification.target_stage = 'Design'
                AND clarification.status = 'Open'
              ORDER BY clarification.created_at DESC
              LIMIT 1
            ) AS latest_clarification_message,
            (
              SELECT clarification.source_stage
              FROM sales.clarification_tasks clarification
              WHERE clarification.enquiry_item_id = enquiry_item.id
                AND clarification.target_stage = 'Design'
                AND clarification.status = 'Open'
              ORDER BY clarification.created_at DESC
              LIMIT 1
            ) AS latest_clarification_source
          FROM sales.enquiry_items enquiry_item
          JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          LEFT JOIN sales.design_tasks design
            ON design.enquiry_item_id = enquiry_item.id
          LEFT JOIN catalog.items matched_product
            ON matched_product.id = design.matched_product_id
          WHERE lower(organization.code) = lower($1)
            AND enquiry_item.technical_review_status IN (
              'Feasible', 'Duplicate / Existing Product'
            )
            AND COALESCE(design.design_status, 'Pending Design') NOT IN (
              'Design Complete', 'Not Required'
            )
          ORDER BY CASE COALESCE(design.design_status, 'Pending Design')
              WHEN 'Changes Required' THEN 0
              WHEN 'Pending Design' THEN 1
              WHEN 'In Progress' THEN 2
              WHEN 'Need Clarification' THEN 3
              ELSE 4
            END,
            enquiry.created_at DESC, enquiry_item.line_number,
            enquiry_item.id
          LIMIT 200
        `,
        [organizationCode.trim()]
      )
      return items.rows.map((row) =>
        designQueueItemFromRow(
          row,
          row.bom_lines,
          row.latest_clarification_message,
          row.latest_clarification_source
        )
      )
    },

    async requestDesignClarification(input: {
      actorUserId?: string | null
      direction: "Design to Technical" | "Product Costing to Design"
      enquiryItemId: string
      message: string
    }) {
      return transaction(pool, async (client) => {
        const context = await client.query<{
          design_id: string | null
          enquiry_id: string
          next_stage_status: string | null
          organization_id: string
        }>(
          `
            SELECT enquiry_item.enquiry_id, enquiry_item.organization_id,
              design.id AS design_id, design.next_stage_status
            FROM sales.enquiry_items enquiry_item
            LEFT JOIN sales.design_tasks design
              ON design.enquiry_item_id = enquiry_item.id
            WHERE enquiry_item.id = $1
            FOR UPDATE OF enquiry_item
          `,
          [input.enquiryItemId]
        )
        const row = context.rows[0]
        if (!row) {
          throw new Error("Line item was not found.")
        }
        if (input.direction === "Product Costing to Design") {
          if (!row.design_id) {
            throw new Error("Design task was not found.")
          }
          if (["Started", "Quoted"].includes(row.next_stage_status ?? "")) {
            throw new Error(
              "Design cannot be reopened after Customer Costing has started."
            )
          }
          await client.query(
            `
              UPDATE sales.design_tasks
              SET design_status = 'Changes Required',
                next_stage_status = 'Changes Required',
                updated_at = now(), row_version = row_version + 1
              WHERE id = $1
            `,
            [row.design_id]
          )
        } else {
          await client.query(
            `
              UPDATE sales.enquiry_items
              SET technical_review_status = 'Need Clarification',
                missing_information = $1, updated_at = now(),
                row_version = row_version + 1
              WHERE id = $2
            `,
            [input.message.trim(), input.enquiryItemId]
          )
          if (row.design_id) {
            await client.query(
              `
                UPDATE sales.design_tasks
                SET design_status = 'Need Clarification',
                  updated_at = now(), row_version = row_version + 1
                WHERE id = $1
              `,
              [row.design_id]
            )
          }
        }
        const sourceStage =
          input.direction === "Product Costing to Design"
            ? "Product Costing"
            : "Design"
        const targetStage =
          input.direction === "Product Costing to Design"
            ? "Design"
            : "Technical"
        const clarificationId = await createOrUpdateClarification(client, {
          enquiryId: row.enquiry_id,
          enquiryItemId: input.enquiryItemId,
          message: input.message,
          organizationId: row.organization_id,
          sourceStage,
          targetStage,
        })
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "design.clarification_requested",
          metadata: {
            clarificationId,
            direction: input.direction,
            message: input.message,
          },
          organizationId: row.organization_id,
          targetId: row.design_id ?? input.enquiryItemId,
          targetTable: row.design_id ? "design_tasks" : "enquiry_items",
        })
        return { clarificationId, targetStage }
      })
    },

    async completeSalesClarification(input: {
      actorUserId?: string | null
      clarificationTaskId: string
      customerPartCode?: string
      description?: string
      drawingReference?: string | null
      enquiryItemId: string
      grade?: string | null
      quantity?: number
      remarks?: string | null
      response?: string | null
      salesMatchDecision?: string
      targetPrice?: number
    }) {
      return transaction(pool, async (client) => {
        const task = await client.query<{
          customer_id: string
          customer_part_code: string
          description: string
          drawing_reference: string | null
          grade: string | null
          id: string
          organization_id: string
          quantity: string
          remarks: string | null
          target_price: string | null
        }>(
          `
            SELECT clarification.id, clarification.organization_id,
              enquiry.customer_id, enquiry_item.customer_part_code,
              enquiry_item.description, enquiry_item.grade,
              enquiry_item.quantity::text, enquiry_item.target_price::text,
              enquiry_item.drawing_reference, enquiry_item.remarks
            FROM sales.clarification_tasks clarification
            JOIN sales.enquiry_items enquiry_item
              ON enquiry_item.id = clarification.enquiry_item_id
            JOIN sales.enquiries enquiry
              ON enquiry.id = enquiry_item.enquiry_id
            WHERE clarification.id = $1
              AND clarification.enquiry_item_id = $2
              AND clarification.target_stage = 'Sales'
              AND clarification.status = 'Open'
              AND ($3::uuid IS NULL OR enquiry.created_by_user_id = $3)
            FOR UPDATE OF clarification, enquiry_item
          `,
          [
            input.clarificationTaskId,
            input.enquiryItemId,
            input.actorUserId ?? null,
          ]
        )
        const taskRow = task.rows[0]
        if (!taskRow) {
          throw new Error("Sales clarification task is required.")
        }
        const decision = input.salesMatchDecision ?? "new"
        const isCommercialMatch = decision.startsWith("quote:")
        const isTechnicalRevision = decision.startsWith("technical:")
        const quoteItemId =
          isCommercialMatch || isTechnicalRevision
            ? decision.slice(decision.indexOf(":") + 1)
            : null
        const matchedQuote = quoteItemId
          ? await client.query<{
              item_type: string | null
              product_id: string
            }>(
              `
                SELECT quote.item_id AS product_id, item.item_type
                FROM sales.quote_items quote
                JOIN catalog.items item ON item.id = quote.item_id
                WHERE quote.id = $1 AND quote.customer_id = $2
                  AND quote.status IN (
                    'Draft', 'Ready', 'Sent', 'Accepted', 'Ordered'
                  )
              `,
              [quoteItemId, taskRow.customer_id]
            )
          : null
        if (quoteItemId && !matchedQuote?.rows[0]) {
          throw new Error("Selected match was not found for this customer.")
        }
        const matched = matchedQuote?.rows[0]
        const technicalReviewStatus =
          matched && isCommercialMatch
            ? "Duplicate / Existing Product"
            : "Pending Review"
        await client.query(
          `
            UPDATE sales.enquiry_items
            SET customer_part_code = $1, description = $2, grade = $3,
              quantity = $4, target_price = $5, drawing_reference = $6,
              remarks = $7, technical_review_status = $8,
              item_id = CASE WHEN $9 THEN $10 ELSE item_id END,
              link_type = CASE
                WHEN $9 THEN 'Matched Quote - Commercial Requote'
                WHEN $11 THEN 'Matched Quote - Technical Revision'
                ELSE link_type
              END,
              revision_type = CASE WHEN $11
                THEN 'Technical Revision' ELSE revision_type END,
              revision_reason = CASE WHEN $11
                THEN COALESCE($12, revision_reason) ELSE revision_reason END,
              updated_by_user_id = $13, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $14
          `,
          [
            input.customerPartCode?.trim() || taskRow.customer_part_code,
            input.description?.trim() || taskRow.description,
            input.grade === undefined ? taskRow.grade : input.grade,
            input.quantity ?? Number(taskRow.quantity),
            input.targetPrice ??
              (taskRow.target_price === null
                ? null
                : Number(taskRow.target_price)),
            input.drawingReference === undefined
              ? taskRow.drawing_reference
              : input.drawingReference,
            input.remarks === undefined ? taskRow.remarks : input.remarks,
            technicalReviewStatus,
            Boolean(matched && isCommercialMatch),
            matched?.product_id ?? null,
            Boolean(matched && isTechnicalRevision),
            input.response ?? null,
            input.actorUserId ?? null,
            input.enquiryItemId,
          ]
        )
        if (matched && isCommercialMatch) {
          await client.query(
            `
              INSERT INTO sales.design_tasks (
                organization_id, enquiry_item_id, status,
                portfolio_match_status, matched_product_id, design_status,
                item_type, design_bom_completed, next_stage_status,
                assigned_date, actual_completion_date, source_system,
                source_table, source_id, source_payload
              )
              VALUES (
                $1, $2, 'Completed', 'Matches Existing Portfolio', $3,
                'Not Required', $4, 'Yes', 'Product Costing Complete',
                now(), now(), 'mrm-dashboard', 'design_tasks', $5, $6
              )
              ON CONFLICT (enquiry_item_id) DO UPDATE SET
                status = 'Completed',
                portfolio_match_status = EXCLUDED.portfolio_match_status,
                matched_product_id = EXCLUDED.matched_product_id,
                design_status = EXCLUDED.design_status,
                item_type = EXCLUDED.item_type,
                design_bom_completed = EXCLUDED.design_bom_completed,
                next_stage_status = EXCLUDED.next_stage_status,
                actual_completion_date = now(), updated_at = now(),
                row_version = sales.design_tasks.row_version + 1
            `,
            [
              taskRow.organization_id,
              input.enquiryItemId,
              matched.product_id,
              matched.item_type ?? "List",
              `sales-match:${input.enquiryItemId}`,
              { quoteItemId },
            ]
          )
        }
        const resolved = await client.query<{
          id: string
          status: string
        }>(
          `
            UPDATE sales.clarification_tasks
            SET status = 'Resolved', response = $1, resolved_at = now(),
              updated_by_user_id = $2, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $3
            RETURNING id, status
          `,
          [
            input.response ?? null,
            input.actorUserId ?? null,
            input.clarificationTaskId,
          ]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: isTechnicalRevision
            ? "enquiry_item.technical_revision_matched"
            : "clarification.resolved",
          metadata: { decision, quoteItemId },
          organizationId: taskRow.organization_id,
          targetId: input.clarificationTaskId,
          targetTable: "clarification_tasks",
        })
        return resolved.rows[0]!
      })
    },

    async createFollowup(input: {
      actorUserId?: string | null
      channel?: string
      dueOn: string
      enquiryId: string
      note?: string | null
      organizationId: string
      quoteItemId?: string | null
      status?: string
    }) {
      return transaction(pool, async (client) => {
        const enquiry = await client.query<{ id: string }>(
          `
            SELECT id FROM sales.enquiries
            WHERE id = $1 AND organization_id = $2
              AND ($3::uuid IS NULL OR created_by_user_id = $3)
          `,
          [input.enquiryId, input.organizationId, input.actorUserId ?? null]
        )
        if (!enquiry.rows[0]) {
          throw new Error("ENQ was not found.")
        }
        if (input.quoteItemId) {
          const quote = await client.query<{ id: string }>(
            `
              SELECT id FROM sales.quote_items
              WHERE id = $1 AND enquiry_id = $2
                AND organization_id = $3
            `,
            [input.quoteItemId, input.enquiryId, input.organizationId]
          )
          if (!quote.rows[0]) {
            throw new Error("Quote item was not found for this enquiry.")
          }
        }
        const sourceId = randomUUID()
        const created = await client.query<{ id: string; status: string }>(
          `
            INSERT INTO sales.followups (
              organization_id, enquiry_id, quote_item_id, due_on,
              channel, status, note, source_system, source_table,
              source_id, source_payload, created_by_user_id,
              updated_by_user_id
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, 'mrm-dashboard',
              'followups', $8, $9, $10, $10
            )
            RETURNING id, status
          `,
          [
            input.organizationId,
            input.enquiryId,
            input.quoteItemId ?? null,
            input.dueOn,
            input.channel ?? "Email",
            input.status ?? "Pending",
            input.note ?? "",
            sourceId,
            input,
            input.actorUserId ?? null,
          ]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "followup.created",
          organizationId: input.organizationId,
          targetId: created.rows[0]!.id,
          targetTable: "followups",
        })
        return created.rows[0]!
      })
    },

    async completeFollowup(input: {
      actorUserId?: string | null
      channel?: string
      followupId: string
      nextDueOn?: string | null
      nextNote?: string | null
      note?: string | null
      status?: string
    }) {
      return transaction(pool, async (client) => {
        const current = await client.query<{
          enquiry_id: string
          organization_id: string
        }>(
          `
            SELECT followup.organization_id, followup.enquiry_id
            FROM sales.followups followup
            JOIN sales.enquiries enquiry ON enquiry.id = followup.enquiry_id
            WHERE followup.id = $1
              AND ($2::uuid IS NULL OR enquiry.created_by_user_id = $2)
            FOR UPDATE OF followup
          `,
          [input.followupId, input.actorUserId ?? null]
        )
        if (!current.rows[0]) {
          throw new Error("Follow-up is required.")
        }
        const status = input.status ?? "Completed"
        const updated = await client.query<{ id: string; status: string }>(
          `
            UPDATE sales.followups
            SET status = $1, note = COALESCE($2, note),
              completed_at = CASE WHEN $1 = 'Completed'
                THEN now() ELSE completed_at END,
              updated_by_user_id = $3, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $4
            RETURNING id, status
          `,
          [
            status,
            input.note ?? null,
            input.actorUserId ?? null,
            input.followupId,
          ]
        )
        let nextFollowupId: string | null = null
        if (input.nextDueOn) {
          const sourceId = randomUUID()
          const next = await client.query<{ id: string }>(
            `
              INSERT INTO sales.followups (
                organization_id, enquiry_id, due_on, channel, status,
                note, source_system, source_table, source_id,
                source_payload, created_by_user_id, updated_by_user_id
              )
              VALUES (
                $1, $2, $3, $4, 'Pending', $5, 'mrm-dashboard',
                'followups', $6, $7, $8, $8
              )
              RETURNING id
            `,
            [
              current.rows[0].organization_id,
              current.rows[0].enquiry_id,
              input.nextDueOn,
              input.channel ?? "Email",
              input.nextNote ?? "",
              sourceId,
              input,
              input.actorUserId ?? null,
            ]
          )
          nextFollowupId = next.rows[0]!.id
        }
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "followup.completed",
          metadata: { nextFollowupId, status },
          organizationId: current.rows[0].organization_id,
          targetId: input.followupId,
          targetTable: "followups",
        })
        return {
          id: updated.rows[0]!.id,
          nextFollowupId,
          status: updated.rows[0]!.status,
        }
      })
    },

    async listFollowups(
      organizationCode: string,
      limit = 200,
      scope?: SalesWorkScope
    ) {
      const result = await pool.query<{
        channel: string
        company_name: string
        customer_uid: string
        due_on: string
        enquiry_id: string
        enquiry_number: string
        id: string
        note: string
        quote_item_id: string | null
        quote_number: string | null
        status: string
      }>(
        `
          SELECT followup.id, followup.enquiry_id,
            followup.quote_item_id, followup.due_on::text,
            followup.channel, followup.status, followup.note,
            enquiry.enquiry_number, customer.customer_uid,
            customer.company_name, quote.quote_number
          FROM sales.followups followup
          JOIN sales.enquiries enquiry ON enquiry.id = followup.enquiry_id
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          JOIN core.organizations organization
            ON organization.id = followup.organization_id
          LEFT JOIN sales.quote_items quote
            ON quote.id = followup.quote_item_id
          WHERE organization.code = $1
            AND ($3::uuid IS NULL OR enquiry.created_by_user_id = $3)
          ORDER BY followup.due_on, followup.created_at, followup.id
          LIMIT $2
        `,
        [
          organizationCode.trim(),
          boundedListLimit(limit),
          scope?.originatingSalespersonUserId ?? null,
        ]
      )
      return result.rows.map((row) => ({
        channel: row.channel,
        companyName: row.company_name,
        customerUid: row.customer_uid,
        dueOn: row.due_on,
        enquiryId: row.enquiry_id,
        enquiryNumber: row.enquiry_number,
        id: row.id,
        note: row.note,
        quoteItemId: row.quote_item_id,
        quoteNumber: row.quote_number,
        status: row.status,
      }))
    },

    async startDesignWork(input: {
      actorUserId?: string | null
      enquiryItemId: string
    }) {
      return transaction(pool, async (client) => {
        const context = await client.query<{
          design_status: string | null
          organization_id: string
          technical_review_status: string
        }>(
          `
            SELECT enquiry_item.organization_id,
              enquiry_item.technical_review_status,
              design.design_status
            FROM sales.enquiry_items enquiry_item
            LEFT JOIN sales.design_tasks design
              ON design.enquiry_item_id = enquiry_item.id
            WHERE enquiry_item.id = $1
            FOR UPDATE OF enquiry_item
          `,
          [input.enquiryItemId]
        )
        const line = context.rows[0]
        if (!line) throw new Error("Line item was not found.")
        if (
          !["Feasible", "Duplicate / Existing Product"].includes(
            line.technical_review_status
          )
        ) {
          throw new Error("Technical Review must release the line to Design.")
        }

        const designStatus = designTaskStatusAfterStart(
          line.design_status ?? "Pending Design"
        )
        const result = await client.query<{
          design_status: string
          id: string
        }>(
          `
            INSERT INTO sales.design_tasks (
              organization_id, enquiry_item_id, status, design_status,
              portfolio_match_status, assigned_date, created_by_user_id,
              updated_by_user_id,
              source_system, source_table, source_id, source_payload
            ) VALUES (
              $1, $2, $3, $3, 'New Quoted Part', now(), $4, $4,
              'mrm-dashboard', 'design_tasks', $5, $6
            )
            ON CONFLICT (enquiry_item_id) DO UPDATE SET
              status = EXCLUDED.status,
              design_status = EXCLUDED.design_status,
              portfolio_match_status = EXCLUDED.portfolio_match_status,
              assigned_date = COALESCE(
                sales.design_tasks.assigned_date,
                EXCLUDED.assigned_date
              ),
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              updated_at = now(),
              row_version = sales.design_tasks.row_version + 1
            RETURNING id, design_status
          `,
          [
            line.organization_id,
            input.enquiryItemId,
            designStatus,
            input.actorUserId ?? null,
            randomUUID(),
            { enquiryItemId: input.enquiryItemId, started: true },
          ]
        )
        const started = result.rows[0]
        if (!started) throw new Error("Design task could not be started.")
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "design.started",
          metadata: { designStatus: started.design_status },
          organizationId: line.organization_id,
          targetId: started.id,
          targetTable: "design_tasks",
        })
        return { designStatus: started.design_status, id: started.id }
      })
    },

    async saveDesign(input: {
      approvalStatus?: string
      actorUserId?: string | null
      assemblyRequired?: string
      bomLines?: DesignBomLine[]
      checkedBy?: string | null
      completionRequested?: boolean
      componentsRequired?: string | null
      designBomCompleted?: string
      designBomRequired?: string
      designRemarks?: string | null
      designStatus: string
      designerName?: string | null
      enquiryItemId: string
      fixtureApproxCost?: number
      fixtureRequired?: string
      gaugesRequired?: string
      inspectionApproxCost?: number
      internalPartCategory?: string | null
      internalPartSize?: string | null
      internalPartSubCategory?: string | null
      itemType: string
      manufacturingProcess?: string | null
      matchedProductId?: string | null
      operationNotes?: string | null
      packageProcessRequired?: string | null
      portfolioMatchStatus: string
      quotedPartUid: string | null
      revisionNo?: string | null
      targetCompletionDate?: string | null
      toolingApproxCost?: number
      toolingRequired?: string
    }) {
      return transaction(pool, async (client) => {
        const line = await client.query<{
          existing_design_status: string | null
          existing_next_stage_status: string | null
          existing_quoted_part_uid: string | null
          organization_id: string
          technical_review_status: string
        }>(
          `
            SELECT enquiry_item.organization_id,
              enquiry_item.technical_review_status,
              design.design_status AS existing_design_status,
              design.next_stage_status AS existing_next_stage_status,
              design.quoted_part_uid AS existing_quoted_part_uid
            FROM sales.enquiry_items enquiry_item
            LEFT JOIN sales.design_tasks design
              ON design.enquiry_item_id = enquiry_item.id
            WHERE enquiry_item.id = $1
            FOR UPDATE OF enquiry_item
          `,
          [input.enquiryItemId]
        )
        const enquiryLine = line.rows[0]
        if (!enquiryLine) {
          throw new Error("Line item was not found.")
        }
        if (
          !["Feasible", "Duplicate / Existing Product"].includes(
            enquiryLine.technical_review_status
          )
        ) {
          throw new Error("Technical Review must release the line to Design.")
        }
        const existingDesignStatus =
          enquiryLine.existing_design_status ?? "Pending Design"
        const existingNextStageStatus =
          enquiryLine.existing_next_stage_status ?? "Not Started"
        if (
          !designTaskIsEditable({
            designStatus: existingDesignStatus,
            nextStageStatus: existingNextStageStatus,
          })
        ) {
          throw new Error(
            "Design task cannot be edited because the next step has already started."
          )
        }
        const isPortfolioMatch =
          input.portfolioMatchStatus === "Matches Existing Portfolio"
        if (isPortfolioMatch && !input.matchedProductId) {
          throw new Error("A matched portfolio product is required.")
        }
        if (isPortfolioMatch && input.matchedProductId) {
          const product = await client.query<{ id: string }>(
            `
              SELECT id FROM catalog.items
              WHERE id = $1 AND organization_id = $2
                AND lifecycle_status = 'P' AND uid_kind = 'INTERNAL'
              FOR SHARE
            `,
            [input.matchedProductId, enquiryLine.organization_id]
          )
          if (!product.rows[0]) {
            throw new Error(
              "Portfolio product must be an ordered internal product."
            )
          }
        }

        const isNewQuotedPart =
          input.portfolioMatchStatus === "New Quoted Part" ||
          input.portfolioMatchStatus === "New Design Required"
        const candidateBomLines = isNewQuotedPart ? (input.bomLines ?? []) : []
        const itemType = designItemType({
          bomLines: candidateBomLines,
          requestedItemType: input.itemType,
        })
        const portfolioMatchStatus = isNewQuotedPart
          ? "New Quoted Part"
          : input.portfolioMatchStatus
        const state = deriveDesignTaskState({
          completionRequested: input.completionRequested,
          designBomCompleted: input.designBomCompleted ?? "No",
          existingNextStageStatus,
          itemType,
          portfolioMatchStatus,
        })
        const { designBomCompleted, designStatus, nextStageStatus } = state
        const quotedPartUid = isNewQuotedPart
          ? normalizeDesignAllocatedUid(input.quotedPartUid) ||
            normalizeDesignAllocatedUid(enquiryLine.existing_quoted_part_uid) ||
            (await nextDesignUid(
              client,
              enquiryLine.organization_id,
              itemType === "Package" ? "PACKAGE" : "QUOTE"
            ))
          : null
        const internalPartName =
          designProductName({
            category: input.internalPartCategory,
            size: input.internalPartSize,
            subcategory: input.internalPartSubCategory,
          }) || null
        const inputBomLines = candidateBomLines
        if (designStatus === "Design Complete" && inputBomLines.length === 0) {
          throw new Error(
            "A completed new design requires at least one BOM line."
          )
        }
        if (
          designStatus === "Design Complete" &&
          itemType === "Package" &&
          inputBomLines.length < 2
        ) {
          throw new Error(
            "A completed Package design requires at least two BOM lines."
          )
        }
        const lineNumbers = new Set<number>()
        for (const bomLine of inputBomLines) {
          if (bomLine.lineNumber <= 0 || bomLine.quantity <= 0) {
            throw new Error("Design BOM line and quantity must be positive.")
          }
          if (lineNumbers.has(bomLine.lineNumber)) {
            throw new Error("Design BOM line numbers must be unique.")
          }
          lineNumbers.add(bomLine.lineNumber)
          if (
            designStatus === "Design Complete" &&
            itemType === "Package" &&
            bomLine.componentSource !== "Existing" &&
            bomLine.componentItemType === "List" &&
            (!bomLine.componentProductSize?.trim() ||
              !bomLine.componentCategory?.trim() ||
              !bomLine.componentSubcategory?.trim())
          ) {
            throw new Error(
              "Every new Package List component requires Product Size, Category, and Subcategory."
            )
          }
        }
        for (const bomLine of inputBomLines) {
          if (!bomLine.parentLineNumber) continue
          const parent = inputBomLines.find(
            (candidate) => candidate.lineNumber === bomLine.parentLineNumber
          )
          if (!parent || parent.componentItemType !== "Assembly") {
            throw new Error(
              "Nested child parts can only be placed under an Assembly row."
            )
          }
        }

        const design = await client.query<{
          id: string
          next_stage_status: string
        }>(
          `
            INSERT INTO sales.design_tasks (
              organization_id, enquiry_item_id, status,
              portfolio_match_status, matched_product_id, design_status,
              quoted_part_uid, item_type, design_bom_completed,
              next_stage_status, assigned_date, actual_completion_date,
              manufacturing_process, package_process_required,
              design_remarks, designer_name, target_completion_date,
              internal_part_size, internal_part_sub_category,
              internal_part_category, internal_part_name,
              internal_drawing_no, revision_no, design_bom_required,
              components_required, assembly_required, operation_notes,
              tooling_required, tooling_approx_cost, fixture_required,
              fixture_approx_cost, gauges_required, inspection_approx_cost,
              checked_by, approval_status, source_system, source_table,
              source_id, source_payload
            ) VALUES (
              $1, $2, $3, $4, $5, $3, $6, $7, $8, $9, now(),
              CASE WHEN $3 IN ('Design Complete', 'Not Required')
                THEN now() ELSE NULL END,
              $10, $11, $12, $13, $14, $15, $16, $17, $18, $6,
              $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
              $29, $30, $31, 'mrm-dashboard', 'design_tasks', $32, $33
            )
            ON CONFLICT (enquiry_item_id) DO UPDATE SET
              status = EXCLUDED.status,
              portfolio_match_status = EXCLUDED.portfolio_match_status,
              matched_product_id = EXCLUDED.matched_product_id,
              design_status = EXCLUDED.design_status,
              quoted_part_uid = EXCLUDED.quoted_part_uid,
              item_type = EXCLUDED.item_type,
              design_bom_completed = EXCLUDED.design_bom_completed,
              next_stage_status = EXCLUDED.next_stage_status,
              actual_completion_date = COALESCE(
                sales.design_tasks.actual_completion_date,
                EXCLUDED.actual_completion_date
              ),
              manufacturing_process = EXCLUDED.manufacturing_process,
              package_process_required = EXCLUDED.package_process_required,
              design_remarks = EXCLUDED.design_remarks,
              designer_name = EXCLUDED.designer_name,
              target_completion_date = EXCLUDED.target_completion_date,
              internal_part_size = EXCLUDED.internal_part_size,
              internal_part_sub_category = EXCLUDED.internal_part_sub_category,
              internal_part_category = EXCLUDED.internal_part_category,
              internal_part_name = EXCLUDED.internal_part_name,
              internal_drawing_no = EXCLUDED.internal_drawing_no,
              revision_no = EXCLUDED.revision_no,
              design_bom_required = EXCLUDED.design_bom_required,
              components_required = EXCLUDED.components_required,
              assembly_required = EXCLUDED.assembly_required,
              operation_notes = EXCLUDED.operation_notes,
              tooling_required = EXCLUDED.tooling_required,
              tooling_approx_cost = EXCLUDED.tooling_approx_cost,
              fixture_required = EXCLUDED.fixture_required,
              fixture_approx_cost = EXCLUDED.fixture_approx_cost,
              gauges_required = EXCLUDED.gauges_required,
              inspection_approx_cost = EXCLUDED.inspection_approx_cost,
              checked_by = EXCLUDED.checked_by,
              approval_status = EXCLUDED.approval_status,
              source_payload = EXCLUDED.source_payload,
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              updated_at = now(),
              row_version = sales.design_tasks.row_version + 1
            RETURNING id, next_stage_status
          `,
          [
            enquiryLine.organization_id,
            input.enquiryItemId,
            designStatus,
            portfolioMatchStatus,
            isPortfolioMatch ? (input.matchedProductId ?? null) : null,
            quotedPartUid,
            itemType,
            designBomCompleted,
            nextStageStatus,
            input.manufacturingProcess ?? null,
            itemType === "Package"
              ? (input.packageProcessRequired ?? null)
              : null,
            input.designRemarks ?? null,
            input.designerName ?? null,
            input.targetCompletionDate ?? null,
            input.internalPartSize ?? null,
            input.internalPartSubCategory ?? null,
            input.internalPartCategory ?? null,
            internalPartName,
            "0",
            state.designBomRequired,
            input.componentsRequired ?? null,
            state.assemblyRequired,
            input.operationNotes ?? null,
            input.toolingRequired ?? "No",
            input.toolingRequired === "Yes"
              ? (input.toolingApproxCost ?? 0)
              : 0,
            input.fixtureRequired ?? "No",
            input.fixtureRequired === "Yes"
              ? (input.fixtureApproxCost ?? 0)
              : 0,
            input.gaugesRequired ?? "No",
            input.gaugesRequired === "Yes"
              ? (input.inspectionApproxCost ?? 0)
              : 0,
            input.checkedBy ?? null,
            state.approvalStatus,
            randomUUID(),
            input,
          ]
        )
        const savedDesign = design.rows[0]
        if (!savedDesign) throw new Error("Design task could not be saved.")
        const bomRows: Array<
          DesignBomLine & { packagePartUid: string | null }
        > = []
        for (const bomLine of inputBomLines) {
          let existingUid: string | null = null
          if (
            bomLine.componentSource === "Existing" &&
            !bomLine.existingProductId
          ) {
            throw new Error(
              "An existing package part must select an ordered internal product."
            )
          }
          if (bomLine.existingProductId) {
            const existing = await client.query<{ uid: string }>(
              `
                SELECT uid FROM catalog.items
                WHERE id = $1 AND organization_id = $2
                  AND lifecycle_status = 'P' AND uid_kind = 'INTERNAL'
              `,
              [bomLine.existingProductId, enquiryLine.organization_id]
            )
            existingUid = existing.rows[0]?.uid ?? null
            if (!existingUid) {
              throw new Error(
                "Package existing part must be an ordered internal product."
              )
            }
          }
          const packagePartUid =
            itemType === "Package" && bomLine.componentSource !== "Existing"
              ? bomLine.packagePartUid?.trim() ||
                (await nextDesignUid(
                  client,
                  enquiryLine.organization_id,
                  bomLine.componentItemType === "Assembly"
                    ? "ASSEMBLY"
                    : "QUOTE"
                ))
              : null
          const componentCode =
            packagePartUid ||
            bomLine.componentCode.trim() ||
            existingUid ||
            (itemType === "List" ? quotedPartUid : null)
          if (!componentCode) {
            throw new Error("Every Design BOM row requires a component code.")
          }
          bomRows.push({ ...bomLine, componentCode, packagePartUid })
        }

        await client.query(
          "DELETE FROM sales.design_bom_lines WHERE design_task_id = $1",
          [savedDesign.id]
        )
        for (const bomLine of bomRows) {
          await client.query(
            `
              INSERT INTO sales.design_bom_lines (
                organization_id, design_task_id, component_code, description,
                quantity, sequence, line_number, parent_line_number,
                component_source, existing_product_id, component_item_type,
                package_part_uid, package_part, bom_item, rod_size, rod_type,
                grade, manufacturing_process, casting, piece_weight,
                production_type, process_required, design_notes,
                source_system, source_table, source_id, source_payload
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
                $22, 'mrm-dashboard', 'design_bom_lines', $23, $24
              )
            `,
            [
              enquiryLine.organization_id,
              savedDesign.id,
              bomLine.componentCode,
              bomLine.packagePart ?? bomLine.bomItem ?? null,
              bomLine.quantity,
              bomLine.lineNumber,
              bomLine.parentLineNumber ?? null,
              bomLine.componentSource,
              bomLine.existingProductId ?? null,
              bomLine.componentItemType ?? "List",
              bomLine.packagePartUid,
              bomLine.packagePart ?? null,
              bomLine.bomItem ?? null,
              bomLine.rodSize ?? null,
              bomLine.rodType ?? null,
              bomLine.grade ?? null,
              bomLine.manufacturingProcess ?? null,
              bomLine.casting ?? null,
              bomLine.pieceWeight ?? null,
              bomLine.productionType ?? null,
              bomLine.processRequired ?? null,
              bomLine.notes ?? null,
              randomUUID(),
              bomLine,
            ]
          )
        }
        if (["Design Complete", "Not Required"].includes(designStatus)) {
          await client.query(
            `
              UPDATE sales.clarification_tasks
              SET status = 'Resolved', response = COALESCE($1, response),
                resolved_at = COALESCE(resolved_at, now()),
                updated_at = now(), row_version = row_version + 1
              WHERE enquiry_item_id = $2
                AND target_stage = 'Design'
                AND status = 'Open'
            `,
            [input.designRemarks ?? null, input.enquiryItemId]
          )
        }
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "design.saved",
          metadata: {
            designStatus,
            portfolioMatchStatus,
            quotedPartUid,
          },
          organizationId: enquiryLine.organization_id,
          targetId: savedDesign.id,
          targetTable: "design_tasks",
        })
        return {
          id: savedDesign.id,
          nextStageStatus: savedDesign.next_stage_status,
          quotedPartUid,
        }
      })
    },

    async prepareCostingFromDesign(
      enquiryItemId: string,
      actorUserId?: string | null
    ) {
      return transaction(pool, async (client) => {
        const design = await client.query<{
          description: string
          design_remarks: string | null
          design_status: string
          enquiry_item_id: string
          id: string
          item_type: string
          manufacturing_process: string | null
          matched_product_id: string | null
          next_stage_status: string
          organization_id: string
          package_process_required: string | null
          quoted_part_uid: string | null
        }>(
          `
            SELECT task.id, task.enquiry_item_id, task.organization_id,
              task.design_status, task.next_stage_status,
              task.matched_product_id, task.quoted_part_uid, task.item_type,
              task.manufacturing_process, task.package_process_required,
              task.design_remarks,
              COALESCE(NULLIF(btrim(task.internal_part_name), ''), item.description)
                AS description
            FROM sales.design_tasks task
            JOIN sales.enquiry_items item
              ON item.id = task.enquiry_item_id
            WHERE task.enquiry_item_id = $1
            FOR UPDATE OF task
          `,
          [enquiryItemId]
        )
        const row = design.rows[0]
        if (!row) {
          throw new Error("Design task was not found.")
        }
        if (!["Design Complete", "Not Required"].includes(row.design_status)) {
          throw new Error("Design must be complete before costing can start.")
        }
        if (
          !["Not Started", "Changes Required"].includes(row.next_stage_status)
        ) {
          throw new Error("Costing has already started for this design.")
        }

        if (row.matched_product_id) {
          const product = await client.query<{ uid: string }>(
            "SELECT uid FROM catalog.items WHERE id = $1",
            [row.matched_product_id]
          )
          await client.query(
            `
              UPDATE sales.design_tasks
              SET next_stage_status = 'Product Costing Complete',
                updated_at = now(), row_version = row_version + 1
              WHERE id = $1
            `,
            [row.id]
          )
          await writeAuditEvent(client, {
            actorUserId,
            eventType: "design.costing_prepared",
            metadata: { portfolioMatch: true },
            organizationId: row.organization_id,
            targetId: row.id,
            targetTable: "design_tasks",
          })
          return {
            nextStageStatus: "Product Costing Complete",
            productId: row.matched_product_id,
            productUid: product.rows[0]!.uid,
          }
        }

        const uid = row.quoted_part_uid?.trim()
        if (!uid) {
          throw new Error("Design part number is required before costing.")
        }
        const bomLines = await client.query<{
          casting: string | null
          component_code: string
          component_category: string | null
          component_item_type: string
          component_product_size: string | null
          component_source: string
          component_subcategory: string | null
          design_notes: string | null
          existing_product_id: string | null
          grade: string | null
          line_number: number
          manufacturing_process: string | null
          package_part: string | null
          package_part_uid: string | null
          parent_line_number: number | null
          piece_weight: string | null
          production_type: string | null
          process_required: string | null
          quantity: string
          rod_size: string | null
          rod_type: string | null
        }>(
          `
            SELECT component_code, quantity::text, line_number,
              parent_line_number, component_source, existing_product_id,
              component_item_type, package_part_uid, package_part, rod_size,
              source_payload ->> 'componentCategory' AS component_category,
              source_payload ->> 'componentProductSize'
                AS component_product_size,
              source_payload ->> 'componentSubcategory'
                AS component_subcategory,
              rod_type, grade, production_type, manufacturing_process,
              casting::text,
              piece_weight::text, process_required, design_notes
            FROM sales.design_bom_lines
            WHERE design_task_id = $1
            ORDER BY line_number
          `,
          [row.id]
        )
        const firstLine = bomLines.rows[0]
        const product = await client.query<{ id: string; uid: string }>(
          `
            INSERT INTO catalog.items (
              organization_id, uid, description, item_type, production_type,
              material_grade_id, rod_type_id, rod_size, machine_type_id,
              weight_100_pcs,
              casting, remarks, source_system, source_table, source_id,
              source_payload
            )
            VALUES (
              $1, $2, $3, $4, $5,
              (SELECT id FROM catalog.material_grades
               WHERE organization_id = $1 AND lower(name) = lower($6)
               LIMIT 1),
              (SELECT id FROM catalog.rod_types
               WHERE organization_id = $1 AND lower(name) = lower($7)
               LIMIT 1),
              $8,
              (SELECT id FROM catalog.machine_types
               WHERE organization_id = $1 AND lower(name) = lower($9)
               LIMIT 1),
              $10, $11, $12, 'mrm-dashboard', 'design_tasks', $13, $14
            )
            ON CONFLICT (organization_id, lower(uid)) DO UPDATE SET
              description = EXCLUDED.description,
              item_type = EXCLUDED.item_type,
              production_type = EXCLUDED.production_type,
              material_grade_id = EXCLUDED.material_grade_id,
              rod_type_id = EXCLUDED.rod_type_id,
              rod_size = EXCLUDED.rod_size,
              machine_type_id = EXCLUDED.machine_type_id,
              weight_100_pcs = EXCLUDED.weight_100_pcs,
              casting = EXCLUDED.casting,
              remarks = EXCLUDED.remarks,
              source_payload = EXCLUDED.source_payload,
              updated_at = now(),
              row_version = catalog.items.row_version + 1
            RETURNING id, uid
          `,
          [
            row.organization_id,
            uid,
            row.description,
            row.item_type,
            row.item_type === "List"
              ? (firstLine?.production_type ?? null)
              : null,
            row.item_type === "List" ? (firstLine?.grade ?? null) : null,
            row.item_type === "List" ? (firstLine?.rod_type ?? null) : null,
            row.item_type === "List" ? (firstLine?.rod_size ?? null) : null,
            row.manufacturing_process,
            row.item_type === "List" ? asNumber(firstLine?.piece_weight) : 0,
            row.item_type === "List" ? asNumber(firstLine?.casting, 1) : 1,
            row.package_process_required ?? row.design_remarks,
            row.id,
            {
              designTaskId: row.id,
              firstMaterialLine: firstLine ?? null,
            },
          ]
        )
        const parentProduct = product.rows[0]!

        if (row.item_type === "Package" || row.item_type === "Assembly") {
          await client.query(
            "DELETE FROM catalog.bom_lines WHERE parent_item_id = $1",
            [parentProduct.id]
          )
          const componentByLine = new Map<number, string>()
          for (const bomLine of bomLines.rows) {
            let componentId = bomLine.existing_product_id
            if (componentId) {
              const existing = await client.query<{ id: string }>(
                `
                  SELECT id FROM catalog.items
                  WHERE id = $1 AND organization_id = $2
                `,
                [componentId, row.organization_id]
              )
              if (!existing.rows[0]) {
                throw new Error(
                  "Design component does not belong to this organization."
                )
              }
            } else {
              const componentUid =
                bomLine.package_part_uid?.trim() ||
                bomLine.component_code.trim()
              if (!componentUid) {
                continue
              }
              const component = await client.query<{ id: string }>(
                `
                  INSERT INTO catalog.items (
                    organization_id, uid, description, item_type,
                    production_type, material_grade_id, rod_type_id, rod_size,
                    machine_type_id, weight_100_pcs, casting, remarks, source_system,
                    source_table, source_id, source_payload
                  )
                  VALUES (
                    $1, $2, $3, $4, $5,
                    (SELECT id FROM catalog.material_grades
                     WHERE organization_id = $1 AND lower(name) = lower($6)
                     LIMIT 1),
                    (SELECT id FROM catalog.rod_types
                     WHERE organization_id = $1 AND lower(name) = lower($7)
                     LIMIT 1),
                    $8,
                    (SELECT id FROM catalog.machine_types
                     WHERE organization_id = $1 AND lower(name) = lower($9)
                     LIMIT 1),
                    $10, $11, $12, 'mrm-dashboard', 'design_bom_lines',
                    $13, $14
                  )
                  ON CONFLICT (organization_id, lower(uid)) DO UPDATE SET
                    description = EXCLUDED.description,
                    item_type = EXCLUDED.item_type,
                    production_type = EXCLUDED.production_type,
                    material_grade_id = EXCLUDED.material_grade_id,
                    rod_type_id = EXCLUDED.rod_type_id,
                    rod_size = EXCLUDED.rod_size,
                    machine_type_id = EXCLUDED.machine_type_id,
                    weight_100_pcs = EXCLUDED.weight_100_pcs,
                    casting = EXCLUDED.casting,
                    remarks = EXCLUDED.remarks,
                    source_payload = EXCLUDED.source_payload,
                    updated_at = now(),
                    row_version = catalog.items.row_version + 1
                  RETURNING id
                `,
                [
                  row.organization_id,
                  componentUid,
                  bomLine.package_part ||
                    `${row.description} component ${bomLine.line_number}`,
                  bomLine.component_item_type,
                  bomLine.production_type,
                  bomLine.grade,
                  bomLine.rod_type,
                  bomLine.rod_size,
                  bomLine.manufacturing_process,
                  asNumber(bomLine.piece_weight),
                  asNumber(bomLine.casting, 1),
                  bomLine.design_notes,
                  `${row.id}:${bomLine.line_number}`,
                  {
                    bomLine,
                    category: bomLine.component_category,
                    designBomLineNumber: bomLine.line_number,
                    designTaskId: row.id,
                    productSize: bomLine.component_product_size,
                    subcategory: bomLine.component_subcategory,
                  },
                ]
              )
              componentId = component.rows[0]!.id
            }
            componentByLine.set(bomLine.line_number, componentId)
          }
          for (const bomLine of bomLines.rows) {
            const componentId = componentByLine.get(bomLine.line_number)
            const parentId = bomLine.parent_line_number
              ? componentByLine.get(bomLine.parent_line_number)
              : parentProduct.id
            if (!componentId || !parentId || componentId === parentId) {
              continue
            }
            await client.query(
              `
                INSERT INTO catalog.bom_lines (
                  organization_id, parent_item_id, component_item_id,
                  quantity, notes,
                  source_system, source_table, source_id, source_payload
                )
                VALUES (
                  $1, $2, $3, $4, $5, 'mrm-dashboard',
                  'design_bom_lines', $6, $7
                )
              `,
              [
                row.organization_id,
                parentId,
                componentId,
                bomLine.quantity,
                bomLine.design_notes,
                `${row.id}:${bomLine.line_number}`,
                bomLine,
              ]
            )
          }
        }
        await client.query(
          `
            UPDATE sales.design_tasks
            SET next_stage_status = 'Product Costing', updated_at = now(),
              row_version = row_version + 1
            WHERE id = $1
          `,
          [row.id]
        )
        await writeAuditEvent(client, {
          actorUserId,
          eventType: "design.costing_prepared",
          metadata: { portfolioMatch: false, productId: parentProduct.id },
          organizationId: row.organization_id,
          targetId: row.id,
          targetTable: "design_tasks",
        })
        return {
          nextStageStatus: "Product Costing",
          productId: parentProduct.id,
          productUid: parentProduct.uid,
        }
      })
    },

    async recordAttachment(input: {
      byteSize: number
      fileName: string
      mediaType?: string | null
      organizationId: string
      purpose?: "cad" | "customer_marked" | "drawing" | "internal_drawing"
      sha256?: string | null
      sourceId: string
      storageKey: string
      targetId: string
      targetTable?: "design_tasks" | "enquiry_items"
    }) {
      if (
        path.basename(input.fileName) !== input.fileName ||
        input.fileName === "." ||
        input.fileName === ".."
      ) {
        throw new Error("Attachment file name must be a safe base name.")
      }
      const normalizedStorageKey = path.posix.normalize(input.storageKey)
      if (
        normalizedStorageKey.startsWith("../") ||
        normalizedStorageKey.startsWith("/") ||
        normalizedStorageKey === ".." ||
        normalizedStorageKey.includes("\\")
      ) {
        throw new Error("Attachment storage key must be a safe relative path.")
      }
      if (input.byteSize < 0) {
        throw new Error("Attachment byte size cannot be negative.")
      }
      return transaction(pool, async (client) => {
        const targetTable = input.targetTable ?? "enquiry_items"
        const purpose = input.purpose ?? "drawing"
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          [
            input.organizationId,
            "sales",
            targetTable,
            input.targetId,
            purpose,
          ].join(":"),
        ])
        const target = await client.query<{ id: string }>(
          targetTable === "design_tasks"
            ? `
                SELECT id FROM sales.design_tasks
                WHERE id = $1 AND organization_id = $2
              `
            : `
                SELECT id FROM sales.enquiry_items
                WHERE id = $1 AND organization_id = $2
              `,
          [input.targetId, input.organizationId]
        )
        if (!target.rows[0]) {
          throw new Error("Attachment target was not found.")
        }
        const file = await client.query<{
          file_name: string
          id: string
          storage_key: string
        }>(
          `
            INSERT INTO core.files (
              organization_id, file_name, media_type, byte_size, sha256,
              storage_key, source_system, source_table, source_id,
              source_payload
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, 'mrm-dashboard',
              $7, $8, $9
            )
            ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
              file_name = EXCLUDED.file_name,
              media_type = EXCLUDED.media_type,
              byte_size = EXCLUDED.byte_size,
              sha256 = EXCLUDED.sha256,
              storage_key = EXCLUDED.storage_key,
              source_payload = EXCLUDED.source_payload,
              updated_at = now()
            RETURNING id, file_name, storage_key
          `,
          [
            input.organizationId,
            input.fileName,
            input.mediaType ?? null,
            input.byteSize,
            input.sha256 ?? null,
            normalizedStorageKey,
            targetTable === "design_tasks"
              ? "design_attachments"
              : "enquiry_attachments",
            input.sourceId,
            input,
          ]
        )
        const existingLink = await client.query(
          `
            SELECT id FROM core.file_links
            WHERE file_id = $1 AND target_schema = 'sales'
              AND target_table = $2 AND target_id = $3 AND purpose = $4
          `,
          [file.rows[0]!.id, targetTable, input.targetId, purpose]
        )
        if (existingLink.rows[0]) {
          return {
            fileName: file.rows[0]!.file_name,
            id: file.rows[0]!.id,
            storageKey: file.rows[0]!.storage_key,
          }
        }
        const version = await client.query<{ value: number }>(
          `
            SELECT coalesce(max(version), 0)::integer + 1 AS value
            FROM core.file_links
            WHERE organization_id = $1 AND target_schema = 'sales'
              AND target_table = $2 AND target_id = $3 AND purpose = $4
          `,
          [input.organizationId, targetTable, input.targetId, purpose]
        )
        await client.query(
          `
            UPDATE core.file_links
            SET is_current = false, deactivated_at = now(), updated_at = now(),
              row_version = row_version + 1
            WHERE organization_id = $1 AND target_schema = 'sales'
              AND target_table = $2 AND target_id = $3 AND purpose = $4
              AND is_current
          `,
          [input.organizationId, targetTable, input.targetId, purpose]
        )
        await client.query(
          `
            UPDATE core.files prior
            SET lifecycle_state = 'superseded', updated_at = now()
            FROM core.file_links link
            WHERE link.file_id = prior.id AND link.organization_id = $1
              AND link.target_schema = 'sales' AND link.target_table = $2
              AND link.target_id = $3 AND link.purpose = $4
              AND NOT link.is_current AND prior.lifecycle_state = 'current'
          `,
          [input.organizationId, targetTable, input.targetId, purpose]
        )
        await client.query(
          `
            INSERT INTO core.file_links (
              organization_id, file_id, target_schema, target_table,
              target_id, purpose, version, is_current
            )
            VALUES ($1, $2, 'sales', $3, $4, $5, $6, true)
          `,
          [
            input.organizationId,
            file.rows[0]!.id,
            targetTable,
            input.targetId,
            purpose,
            version.rows[0]!.value,
          ]
        )
        return {
          fileName: file.rows[0]!.file_name,
          id: file.rows[0]!.id,
          storageKey: file.rows[0]!.storage_key,
        }
      })
    },

    async listAttachments(input: {
      organizationId: string
      purpose?:
        | "cad"
        | "customer_marked"
        | "drawing"
        | "internal_drawing"
        | "sales_clarification"
      targetId: string
      targetTable: "design_tasks" | "enquiry_items"
    }) {
      const files = await pool.query<{
        byte_size: string
        created_at: Date
        file_name: string
        id: string
        is_current: boolean
        lifecycle_state: "current" | "deleted" | "superseded"
        media_type: string | null
        object_lifecycle_state:
          | "available"
          | "deleted"
          | "deletion_failed"
          | null
        purpose: string
        public_url: string | null
        storage_key: string
        version: number
      }>(
        `
          SELECT file.id, file.file_name, file.media_type,
            file.byte_size::text, file.storage_key, file.created_at,
            file.lifecycle_state, file_link.purpose, file_link.version,
            file_link.is_current, object.public_url,
            object.lifecycle_state AS object_lifecycle_state
          FROM core.file_links file_link
          JOIN core.files file ON file.id = file_link.file_id
          LEFT JOIN core.file_objects object ON object.id = file.physical_object_id
          WHERE file_link.organization_id = $1
            AND file_link.target_schema = 'sales'
            AND file_link.target_table = $2
            AND file_link.target_id = $3
            AND ($4::text IS NULL OR file_link.purpose = $4)
          ORDER BY file_link.version DESC, file.created_at DESC, file.id DESC
        `,
        [
          input.organizationId,
          input.targetTable,
          input.targetId,
          input.purpose ?? null,
        ]
      )
      return files.rows.map((row) => ({
        byteSize: Number(row.byte_size),
        createdAt: row.created_at,
        fileName: row.file_name,
        id: row.id,
        isCurrent: row.is_current,
        lifecycleState: row.lifecycle_state,
        mediaType: row.media_type,
        objectLifecycleState: row.object_lifecycle_state,
        purpose: row.purpose,
        publicUrl: row.public_url,
        storageKey: row.storage_key,
        version: row.version,
      }))
    },

    async listAttachmentsForTargets(input: {
      organizationId: string
      purpose?:
        | "cad"
        | "customer_marked"
        | "drawing"
        | "internal_drawing"
        | "sales_clarification"
      targetIds: string[]
      targetTable: "design_tasks" | "enquiry_items"
    }) {
      if (input.targetIds.length === 0) {
        return new Map<
          string,
          Awaited<ReturnType<typeof this.listAttachments>>
        >()
      }

      const files = await pool.query<{
        byte_size: string
        created_at: Date
        file_name: string
        id: string
        is_current: boolean
        lifecycle_state: "current" | "deleted" | "superseded"
        media_type: string | null
        object_lifecycle_state:
          | "available"
          | "deleted"
          | "deletion_failed"
          | null
        purpose: string
        public_url: string | null
        storage_key: string
        target_id: string
        version: number
      }>(
        `
          SELECT file_link.target_id, file.id, file.file_name, file.media_type,
            file.byte_size::text, file.storage_key, file.created_at,
            file.lifecycle_state, file_link.purpose, file_link.version,
            file_link.is_current, object.public_url,
            object.lifecycle_state AS object_lifecycle_state
          FROM core.file_links file_link
          JOIN core.files file ON file.id = file_link.file_id
          LEFT JOIN core.file_objects object ON object.id = file.physical_object_id
          WHERE file_link.organization_id = $1
            AND file_link.target_schema = 'sales'
            AND file_link.target_table = $2
            AND file_link.target_id = ANY($3::uuid[])
            AND ($4::text IS NULL OR file_link.purpose = $4)
          ORDER BY file_link.target_id, file_link.version DESC,
            file.created_at DESC, file.id DESC
        `,
        [
          input.organizationId,
          input.targetTable,
          input.targetIds,
          input.purpose ?? null,
        ]
      )
      const attachmentsByTarget = new Map<
        string,
        Awaited<ReturnType<typeof this.listAttachments>>
      >()
      for (const row of files.rows) {
        const attachments = attachmentsByTarget.get(row.target_id) ?? []
        attachments.push({
          byteSize: Number(row.byte_size),
          createdAt: row.created_at,
          fileName: row.file_name,
          id: row.id,
          isCurrent: row.is_current,
          lifecycleState: row.lifecycle_state,
          mediaType: row.media_type,
          objectLifecycleState: row.object_lifecycle_state,
          purpose: row.purpose,
          publicUrl: row.public_url,
          storageKey: row.storage_key,
          version: row.version,
        })
        attachmentsByTarget.set(row.target_id, attachments)
      }
      return attachmentsByTarget
    },

    async listDrawingHistory(input: {
      enquiryItemId: string
      organizationId: string
    }) {
      const drawings = await pool.query<{
        byte_size: string
        created_at: Date
        file_name: string
        id: string
        media_type: string | null
        is_current: boolean
        lifecycle_state: "current" | "deleted" | "superseded"
        public_url: string | null
        purpose: string
        storage_key: string
        version: number
      }>(
        `
          SELECT file.id, file.file_name, file.media_type,
            file.byte_size::text, file.storage_key, file.created_at,
            file.lifecycle_state, file_link.is_current, file_link.version,
            file_link.purpose, object.public_url
          FROM core.file_links file_link
          JOIN core.files file ON file.id = file_link.file_id
          LEFT JOIN core.file_objects object ON object.id = file.physical_object_id
          WHERE file_link.organization_id = $1
            AND file_link.target_schema = 'sales'
            AND file_link.target_table = 'enquiry_items'
            AND file_link.target_id = $2
            AND file_link.purpose IN ('drawing', 'sales_clarification')
          ORDER BY file.created_at DESC, file.id DESC
        `,
        [input.organizationId, input.enquiryItemId]
      )
      return drawings.rows.map((row) => ({
        byteSize: Number(row.byte_size),
        createdAt: row.created_at,
        fileName: row.file_name,
        id: row.id,
        isCurrent: row.is_current,
        lifecycleState: row.lifecycle_state,
        mediaType: row.media_type,
        purpose: row.purpose,
        publicUrl: row.public_url,
        storageKey: row.storage_key,
        version: row.version,
      }))
    },

    async getCurrentDrawing(input: {
      enquiryItemId: string
      organizationId: string
    }) {
      const drawings = await pool.query<{
        byte_size: string
        created_at: Date
        file_name: string
        id: string
        media_type: string | null
        lifecycle_state: "current" | "deleted" | "superseded"
        object_lifecycle_state:
          | "available"
          | "deleted"
          | "deletion_failed"
          | null
        public_url: string | null
        storage_key: string
      }>(
        `
          SELECT file.id, file.file_name, file.media_type,
            file.byte_size::text, file.storage_key, file.created_at,
            file.lifecycle_state, object.public_url,
            object.lifecycle_state AS object_lifecycle_state
          FROM core.file_links file_link
          JOIN core.files file ON file.id = file_link.file_id
          LEFT JOIN core.file_objects object ON object.id = file.physical_object_id
          WHERE file_link.organization_id = $1
            AND file_link.target_schema = 'sales'
            AND file_link.target_table = 'enquiry_items'
            AND file_link.target_id = $2
            AND file_link.purpose IN ('drawing', 'sales_clarification')
            AND file_link.is_current
          ORDER BY file.created_at DESC, file.id DESC
          LIMIT 1
        `,
        [input.organizationId, input.enquiryItemId]
      )
      const row = drawings.rows[0]
      if (!row) {
        throw new Error("Drawing was not found.")
      }
      if (
        row.lifecycle_state === "deleted" ||
        row.object_lifecycle_state === "deleted"
      ) {
        throw new Error("Drawing is deleted or unavailable.")
      }
      return {
        byteSize: Number(row.byte_size),
        createdAt: row.created_at,
        fileName: row.file_name,
        id: row.id,
        mediaType: row.media_type,
        publicUrl: row.public_url,
        storageKey: row.storage_key,
      }
    },

    async createImportReview(input: {
      actorUserId?: string | null
      enquiryId: string
      importKey: string
      organizationId: string
      rows: ImportRow[]
    }) {
      return transaction(pool, (client) =>
        createImportReviewWithClient(client, input)
      )
    },

    async applyImportReview(input: {
      actorUserId?: string | null
      decisions: Array<{ action: string; rowNumber: number }>
      reviewId: string
    }) {
      return transaction(pool, async (client) => {
        const review = await client.query<{
          enquiry_id: string
          organization_id: string
          status: string
        }>(
          `
            SELECT review.enquiry_id, review.organization_id, review.status
            FROM sales.enquiry_import_reviews review
            JOIN sales.enquiries enquiry ON enquiry.id = review.enquiry_id
            WHERE review.id = $1
              AND ($2::uuid IS NULL OR enquiry.created_by_user_id = $2)
            FOR UPDATE OF review
          `,
          [input.reviewId, input.actorUserId ?? null]
        )
        const reviewRow = review.rows[0]
        if (!reviewRow) {
          throw new Error("Import review was not found.")
        }
        if (reviewRow.status === "Applied") {
          return getImportReviewWithClient(
            client,
            input.reviewId,
            input.actorUserId
              ? { originatingSalespersonUserId: input.actorUserId }
              : undefined
          )
        }
        const decisions = new Map<number, string>()
        for (const decision of input.decisions) {
          if (decisions.has(decision.rowNumber)) {
            throw new Error(
              `Import row ${decision.rowNumber} has two decisions.`
            )
          }
          decisions.set(decision.rowNumber, decision.action)
        }
        const reviewRows = await client.query<{
          created_enquiry_item_id: string | null
          match_note: string | null
          matched_enquiry_item_id: string | null
          matched_product_id: string | null
          matched_quote_item_id: string | null
          raw_values: Record<string, unknown>
          row_number: number
        }>(
          `
            SELECT row_number, raw_values, matched_enquiry_item_id,
              matched_product_id, matched_quote_item_id, match_note,
              created_enquiry_item_id
            FROM sales.enquiry_import_review_rows
            WHERE review_id = $1
            ORDER BY row_number
            FOR UPDATE
          `,
          [input.reviewId]
        )
        const rowNumbers = new Set(reviewRows.rows.map((row) => row.row_number))
        for (const rowNumber of decisions.keys()) {
          if (!rowNumbers.has(rowNumber)) {
            throw new Error(`Import row ${rowNumber} was not found.`)
          }
        }
        for (const importRow of reviewRows.rows) {
          if (importRow.created_enquiry_item_id) {
            continue
          }
          const requestedAction = decisions.get(importRow.row_number) ?? "Skip"
          const action =
            requestedAction === "Ignore"
              ? "Skip"
              : requestedAction === "Create new line"
                ? "Add New Line"
                : requestedAction
          if (action === "Skip") {
            await client.query(
              `
                UPDATE sales.enquiry_import_review_rows
                SET applied_action = 'Skip', updated_at = now(),
                  row_version = row_version + 1
                WHERE review_id = $1 AND row_number = $2
              `,
              [input.reviewId, importRow.row_number]
            )
            continue
          }
          if (
            ![
              "Add New Line",
              "Ask Sales",
              "Commercial Requote",
              "Link to existing work",
              "Technical Revision",
            ].includes(action)
          ) {
            throw new Error(`Unsupported import action: ${action}.`)
          }
          if (
            action === "Link to existing work" &&
            !importRow.matched_enquiry_item_id
          ) {
            throw new Error("Linked rows need an existing in-progress line.")
          }
          if (
            action === "Commercial Requote" &&
            !importRow.matched_product_id
          ) {
            throw new Error("Commercial requote rows need a matched product.")
          }
          if (
            action === "Technical Revision" &&
            !importRow.matched_quote_item_id &&
            !importRow.matched_product_id &&
            !importRow.matched_enquiry_item_id
          ) {
            throw new Error(
              "Technical revision rows need a matched quote, product, or in-progress line."
            )
          }
          const raw = importRow.raw_values
          const created = await addEnquiryItemWithClient(client, {
            actorUserId: input.actorUserId,
            customerPartCode: asTrimmed(raw.part),
            description: asTrimmed(raw.description),
            drawingReference: asTrimmed(raw.drawing_reference) || null,
            enquiryId: reviewRow.enquiry_id,
            grade: asTrimmed(raw.grade) || null,
            organizationId: reviewRow.organization_id,
            quantity: asNumber(raw.quantity),
            remarks: asTrimmed(raw.remarks) || null,
            sourceId: `${input.reviewId}:${importRow.row_number}`,
            targetPrice: asNumber(raw.target_price),
          })
          if (action === "Technical Revision") {
            const reason =
              importRow.match_note ??
              "Matched previous item, but Sales marked it for Technical Review."
            await client.query(
              `
                UPDATE sales.enquiry_items
                SET technical_review_status = 'Pending Review',
                  revision_type = 'Technical Revision',
                  revision_reason = $1,
                  linked_enquiry_item_id = $2,
                  link_type = $3,
                  updated_at = now(), row_version = row_version + 1
                WHERE id = $4
              `,
              [
                reason,
                importRow.matched_enquiry_item_id,
                importRow.matched_enquiry_item_id
                  ? "In Progress Technical Revision"
                  : "Matched Quote - Technical Revision",
                created.id,
              ]
            )
            await writeAuditEvent(client, {
              actorUserId: input.actorUserId,
              eventType: "import.technical_revision_match",
              metadata: {
                matchNote: importRow.match_note,
                reviewId: input.reviewId,
                rowNumber: importRow.row_number,
              },
              organizationId: reviewRow.organization_id,
              targetId: created.id,
              targetTable: "enquiry_items",
            })
          }
          if (action === "Ask Sales") {
            await client.query(
              `
                UPDATE sales.enquiry_items
                SET technical_review_status = 'Need Sales Confirmation',
                  updated_at = now(), row_version = row_version + 1
                WHERE id = $1
              `,
              [created.id]
            )
            await createOrUpdateClarification(client, {
              enquiryId: reviewRow.enquiry_id,
              enquiryItemId: created.id,
              message:
                "Description matches previous work, but the customer part code did not match. Please confirm whether this is the same item or a new item.",
              organizationId: reviewRow.organization_id,
              sourceStage: "Import Review",
              targetStage: "Sales",
            })
          }
          if (action === "Link to existing work") {
            await client.query(
              `
                UPDATE sales.enquiry_items
                SET technical_review_status = 'Linked to Existing Work',
                  linked_enquiry_item_id = $1,
                  link_type = 'In Progress Match',
                  updated_at = now(), row_version = row_version + 1
                WHERE id = $2
              `,
              [importRow.matched_enquiry_item_id, created.id]
            )
          }
          if (action === "Commercial Requote") {
            const product = await client.query<{ item_type: string }>(
              `
                SELECT item_type FROM catalog.items
                WHERE id = $1 AND organization_id = $2
              `,
              [importRow.matched_product_id, reviewRow.organization_id]
            )
            if (!product.rows[0]) {
              throw new Error(
                "Commercial requote product is outside this organization."
              )
            }
            await client.query(
              `
                INSERT INTO sales.design_tasks (
                  organization_id, enquiry_item_id, status,
                  portfolio_match_status, matched_product_id, design_status,
                  design_bom_completed, next_stage_status, item_type,
                  assigned_date, actual_completion_date, source_system,
                  source_table, source_id, source_payload
                )
                VALUES (
                  $1, $2, 'Not Required', 'Matches Existing Portfolio',
                  $3, 'Not Required', 'Yes', 'Product Costing Complete', $4,
                  now(), now(), 'mrm-dashboard', 'design_tasks', $5, $6
                )
              `,
              [
                reviewRow.organization_id,
                created.id,
                importRow.matched_product_id,
                product.rows[0].item_type,
                `import:${input.reviewId}:${importRow.row_number}`,
                { action, importRow },
              ]
            )
          }
          await client.query(
            `
              UPDATE sales.enquiry_import_review_rows
              SET applied_action = $1, created_enquiry_item_id = $2,
                updated_at = now(), row_version = row_version + 1
              WHERE review_id = $3 AND row_number = $4
            `,
            [action, created.id, input.reviewId, importRow.row_number]
          )
        }
        await client.query(
          `
            UPDATE sales.enquiry_import_reviews
            SET status = 'Applied', applied_at = now(), imported_at = now(),
              updated_at = now(), row_version = row_version + 1
            WHERE id = $1
          `,
          [input.reviewId]
        )
        return getImportReviewWithClient(
          client,
          input.reviewId,
          input.actorUserId
            ? { originatingSalespersonUserId: input.actorUserId }
            : undefined
        )
      })
    },

    async getEnquiry(enquiryId: string, scope?: SalesWorkScope) {
      return transaction(pool, async (client) => {
        await client.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
        )
        const enquiry = await client.query<{
          buyer_name: string | null
          company_name: string
          conversion_rate: string
          currency: string
          customer_id: string
          customer_uid: string
          enquiry_number: string
          id: string
          incoterms: string | null
          organization_id: string
          packaging_terms: string | null
          payment_terms: string | null
          priority: string
          received_on: string
          remarks: string | null
          shipment_mode: string | null
          source: string
          status: string
          technical_handover_status: string
        }>(
          `
            SELECT enquiry.id, enquiry.organization_id,
              enquiry.enquiry_number, enquiry.status,
              enquiry.technical_handover_status, enquiry.customer_id,
              enquiry.received_on::text, enquiry.source, enquiry.priority,
              enquiry.buyer_name, enquiry.remarks, enquiry.incoterms,
              enquiry.payment_terms, enquiry.currency,
              enquiry.conversion_rate::text, enquiry.shipment_mode,
              enquiry.packaging_terms, customer.customer_uid,
              customer.company_name
            FROM sales.enquiries enquiry
            JOIN sales.customers customer ON customer.id = enquiry.customer_id
            WHERE enquiry.id = $1
              AND ($2::uuid IS NULL OR enquiry.created_by_user_id = $2)
          `,
          [enquiryId, scope?.originatingSalespersonUserId ?? null]
        )
        if (!enquiry.rows[0]) {
          throw new Error("ENQ was not found.")
        }
        const items = await client.query<{
          customer_part_code: string | null
          description: string
          design_status: string | null
          drawing_file_id: string | null
          drawing_file_name: string | null
          drawing_reference: string | null
          feasibility_reason: string | null
          grade: string | null
          id: string
          line_number: number
          missing_information: string | null
          next_stage_status: string | null
          quantity: string
          remarks: string | null
          target_price: string | null
          technical_checklist: TechnicalChecklist
          technical_remarks: string | null
          technical_review_status: string
        }>(
          `
            SELECT item.id, item.line_number, item.customer_part_code,
              item.description, item.technical_review_status,
              item.grade, item.quantity::text, item.target_price::text,
              item.drawing_reference, item.remarks,
              item.technical_checklist, item.missing_information,
              item.feasibility_reason, item.technical_remarks,
              design.design_status, design.next_stage_status,
              drawing.id AS drawing_file_id,
              drawing.file_name AS drawing_file_name
            FROM sales.enquiry_items item
            LEFT JOIN sales.design_tasks design
              ON design.enquiry_item_id = item.id
            LEFT JOIN LATERAL (
              SELECT file.id, file.file_name
              FROM core.file_links file_link
              JOIN core.files file ON file.id = file_link.file_id
              WHERE file_link.target_schema = 'sales'
                AND file_link.target_table = 'enquiry_items'
                AND file_link.target_id = item.id
                AND file_link.purpose IN ('drawing', 'sales_clarification')
                AND file_link.is_current
              ORDER BY file.created_at DESC, file.id DESC
              LIMIT 1
            ) drawing ON true
            WHERE item.enquiry_id = $1
            ORDER BY item.line_number
          `,
          [enquiryId]
        )
        const clarifications = await client.query<{
          enquiry_item_id: string | null
          id: string
          response: string | null
          source_stage: string
          status: string
          target_stage: string
        }>(
          `
            SELECT id, enquiry_item_id, source_stage, target_stage, status,
              response
            FROM sales.clarification_tasks
            WHERE enquiry_id = $1
            ORDER BY created_at
          `,
          [enquiryId]
        )
        const importReviewSummaries = await client.query<{
          id: string
          status: string
        }>(
          `
            SELECT id, status
            FROM sales.enquiry_import_reviews
            WHERE enquiry_id = $1
            ORDER BY created_at DESC
          `,
          [enquiryId]
        )
        const importReviews = await Promise.all(
          importReviewSummaries.rows.map((review) =>
            getImportReviewWithClient(client, review.id, scope)
          )
        )
        return {
          clarifications: clarifications.rows.map((row) => ({
            enquiryItemId: row.enquiry_item_id,
            id: row.id,
            response: row.response,
            sourceStage: row.source_stage,
            status: row.status,
            targetStage: row.target_stage,
          })),
          enquiry: {
            buyerName: enquiry.rows[0].buyer_name,
            companyName: enquiry.rows[0].company_name,
            conversionRate: Number(enquiry.rows[0].conversion_rate),
            currency: enquiry.rows[0].currency,
            customerId: enquiry.rows[0].customer_id,
            customerUid: enquiry.rows[0].customer_uid,
            enquiryNumber: enquiry.rows[0].enquiry_number,
            id: enquiry.rows[0].id,
            incoterms: enquiry.rows[0].incoterms,
            organizationId: enquiry.rows[0].organization_id,
            packagingTerms: enquiry.rows[0].packaging_terms,
            paymentTerms: enquiry.rows[0].payment_terms,
            priority: enquiry.rows[0].priority,
            receivedOn: enquiry.rows[0].received_on,
            remarks: enquiry.rows[0].remarks,
            shipmentMode: enquiry.rows[0].shipment_mode,
            source: enquiry.rows[0].source,
            status: enquiry.rows[0].status,
            technicalHandoverStatus: enquiry.rows[0].technical_handover_status,
          },
          importReviews,
          items: items.rows.map((row) => ({
            customerPartCode: row.customer_part_code,
            description: row.description,
            designStatus: row.design_status,
            drawingFileId: row.drawing_file_id,
            drawingFileName: row.drawing_file_name,
            drawingReference: row.drawing_reference,
            feasibilityReason: row.feasibility_reason,
            grade: row.grade,
            id: row.id,
            lineNumber: row.line_number,
            missingInformation: row.missing_information,
            nextStageStatus: row.next_stage_status,
            quantity: Number(row.quantity),
            remarks: row.remarks,
            targetPrice:
              row.target_price === null ? null : Number(row.target_price),
            technicalChecklist: row.technical_checklist ?? {},
            technicalRemarks: row.technical_remarks,
            technicalReviewStatus: row.technical_review_status,
          })),
        }
      })
    },

    async getImportReview(reviewId: string, scope?: SalesWorkScope) {
      return transaction(pool, async (client) => {
        await client.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
        )
        return getImportReviewWithClient(client, reviewId, scope)
      })
    },

    async listEnquiries(
      organizationCode: string,
      limit = 200,
      scope?: SalesWorkScope
    ) {
      const result = await pool.query<{
        buyer_name: string | null
        company_name: string
        customer_uid: string
        due_followup_count: string
        enquiry_number: string
        id: string
        item_count: string
        latest_quote_sent_at: Date | null
        next_followup_due: string | null
        not_feasible_line_count: string
        organization_id: string
        ordered_line_count: string
        pending_line_count: string
        po_line_count: string
        priority: string
        quote_item_count: string
        quote_sent_count: string
        quoted_line_count: string
        received_on: string
        remarks: string | null
        source: string
        status: string
        technical_handover_at: Date | null
        technical_handover_status: string
        technical_started_count: string
        design_task_count: string
        open_sales_clarification_count: string
      }>(
        `
          SELECT enquiry.id, enquiry.organization_id,
            enquiry.enquiry_number, enquiry.status,
            enquiry.technical_handover_status,
            enquiry.technical_handover_at, enquiry.received_on::text,
            enquiry.source, enquiry.priority, enquiry.buyer_name,
            enquiry.remarks, customer.customer_uid, customer.company_name,
            count(DISTINCT item.id)::text AS item_count,
            count(DISTINCT item.id) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM sales.quote_items quote
                WHERE quote.enquiry_item_id = item.id
              )
            )::text AS quoted_line_count,
            count(DISTINCT item.id) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM sales.purchase_order_lines po_line
                JOIN sales.quote_items quote
                  ON quote.id = po_line.quote_item_id
                WHERE quote.enquiry_item_id = item.id
              )
            )::text AS ordered_line_count,
            count(DISTINCT item.id) FILTER (
              WHERE item.technical_review_status IN (
                'Pending Review', 'Need Clarification',
                'Need Sales Confirmation'
              )
            )::text AS pending_line_count,
            count(DISTINCT item.id) FILTER (
              WHERE item.technical_review_status = 'Not Feasible'
            )::text AS not_feasible_line_count,
            (
              SELECT count(*)::text FROM sales.quote_items quote
              WHERE quote.enquiry_id = enquiry.id
            ) AS quote_item_count,
            (
              SELECT count(*)::text FROM sales.quote_items quote
              WHERE quote.enquiry_id = enquiry.id
                AND quote.sent_at IS NOT NULL
            ) AS quote_sent_count,
            (
              SELECT max(quote.sent_at) FROM sales.quote_items quote
              WHERE quote.enquiry_id = enquiry.id
            ) AS latest_quote_sent_at,
            (
              SELECT min(followup.due_on)::text FROM sales.followups followup
              WHERE followup.enquiry_id = enquiry.id
                AND followup.status = 'Pending'
            ) AS next_followup_due,
            (
              SELECT count(*)::text FROM sales.followups followup
              WHERE followup.enquiry_id = enquiry.id
                AND followup.status = 'Pending'
                AND followup.due_on <= current_date
            ) AS due_followup_count,
            (
              SELECT count(*)::text
              FROM sales.purchase_order_lines po_line
              JOIN sales.quote_items quote ON quote.id = po_line.quote_item_id
              WHERE quote.enquiry_id = enquiry.id
            ) AS po_line_count,
            (
              SELECT count(*)::text FROM sales.enquiry_items started
              WHERE started.enquiry_id = enquiry.id
                AND started.reviewed_at IS NOT NULL
            ) AS technical_started_count,
            (
              SELECT count(*)::text FROM sales.design_tasks design
              JOIN sales.enquiry_items design_item
                ON design_item.id = design.enquiry_item_id
              WHERE design_item.enquiry_id = enquiry.id
            ) AS design_task_count,
            (
              SELECT count(*)::text
              FROM sales.clarification_tasks clarification
              WHERE clarification.enquiry_id = enquiry.id
                AND clarification.target_stage = 'Sales'
                AND clarification.status = 'Open'
            ) AS open_sales_clarification_count
          FROM sales.enquiries enquiry
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          LEFT JOIN sales.enquiry_items item ON item.enquiry_id = enquiry.id
          WHERE lower(organization.code) = lower($1)
            AND ($3::uuid IS NULL OR enquiry.created_by_user_id = $3)
          GROUP BY enquiry.id, customer.customer_uid, customer.company_name
          ORDER BY enquiry.created_at DESC
          LIMIT $2
        `,
        [
          organizationCode.trim(),
          boundedListLimit(limit),
          scope?.originatingSalespersonUserId ?? null,
        ]
      )
      return result.rows.map((row) => ({
        buyerName: row.buyer_name,
        canDelete:
          Number(row.quote_item_count) === 0 &&
          Number(row.po_line_count) === 0 &&
          row.technical_handover_status !== "Handed Over" &&
          Number(row.technical_started_count) === 0 &&
          Number(row.design_task_count) === 0,
        canEdit:
          Number(row.quote_item_count) === 0 &&
          Number(row.po_line_count) === 0 &&
          (row.technical_handover_status !== "Handed Over" ||
            Number(row.open_sales_clarification_count) > 0 ||
            (Number(row.technical_started_count) === 0 &&
              Number(row.design_task_count) === 0)),
        companyName: row.company_name,
        customerUid: row.customer_uid,
        dueFollowupCount: Number(row.due_followup_count),
        enquiryNumber: row.enquiry_number,
        id: row.id,
        itemCount: Number(row.item_count),
        latestQuoteSentAt: row.latest_quote_sent_at,
        nextFollowupDue: row.next_followup_due,
        notFeasibleLineCount: Number(row.not_feasible_line_count),
        orderedLineCount: Number(row.ordered_line_count),
        organizationId: row.organization_id,
        pendingLineCount: Number(row.pending_line_count),
        priority: row.priority,
        quoteSentCount: Number(row.quote_sent_count),
        quotedLineCount: Number(row.quoted_line_count),
        receivedOn: row.received_on,
        remarks: row.remarks,
        source: row.source,
        status: row.status,
        technicalHandoverAt: row.technical_handover_at,
        technicalHandoverStatus: row.technical_handover_status,
      }))
    },

    async listEnquiriesBounded(
      organizationCode: string,
      requestedLimit = 200,
      scope?: SalesWorkScope
    ) {
      const limit = operationalRootLimit(requestedLimit)
      const roots = await pool.query<EnquiryRootDatabaseRow>(
        `
          SELECT enquiry.id, enquiry.organization_id,
            enquiry.enquiry_number, enquiry.status,
            enquiry.technical_handover_status,
            enquiry.technical_handover_at, enquiry.received_on::text,
            enquiry.source, enquiry.priority, enquiry.buyer_name,
            enquiry.remarks, enquiry.created_at, customer.customer_uid,
            customer.company_name
          FROM sales.enquiries enquiry
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          WHERE lower(organization.code) = lower($1)
            AND ($3::uuid IS NULL OR enquiry.created_by_user_id = $3)
          ORDER BY enquiry.created_at DESC, enquiry.id DESC
          LIMIT $2
        `,
        [
          organizationCode.trim(),
          limit + 1,
          scope?.originatingSalespersonUserId ?? null,
        ]
      )
      const rows = await enquiryRowsWithRelations(
        pool,
        roots.rows.slice(0, limit)
      )
      return boundedResult(rows, limit, roots.rows.length > limit)
    },

    async listEnquirySpreadsheetBounded(
      organizationCode: string,
      requestedLimit = 200,
      scope?: SalesWorkScope
    ) {
      const limit = operationalRootLimit(requestedLimit)
      const rows = await pool.query<EnquirySpreadsheetDatabaseRow>(
        `
          SELECT enquiry_item.id AS enquiry_item_id,
            enquiry.id AS enquiry_id, enquiry.enquiry_number,
            enquiry.received_on::text, customer.customer_uid,
            customer.company_name, enquiry.source, enquiry.priority,
            enquiry.buyer_name, enquiry_item.line_number,
            enquiry_item.customer_part_code, enquiry_item.description,
            enquiry_item.grade, enquiry_item.quantity::text,
            enquiry_item.target_price::text,
            enquiry_item.drawing_reference,
            drawing.file_name AS drawing_file_name,
            CASE
              WHEN enquiry.technical_handover_status <> 'Handed Over'
                THEN 'With Sales'
              WHEN EXISTS (
                SELECT 1
                FROM sales.clarification_tasks clarification
                WHERE clarification.enquiry_item_id = enquiry_item.id
                  AND clarification.status = 'Open'
                  AND clarification.target_stage = 'Sales'
              ) THEN 'With Sales'
              WHEN selected_quote.product_lifecycle_status = 'P'
                OR selected_quote.status = 'Ordered' THEN 'Ordered / P'
              WHEN selected_quote.status = 'Superseded'
                OR selected_quote.superseded_by_quote_item_id IS NOT NULL
                THEN 'Revision Given'
              WHEN selected_quote.sent_at IS NOT NULL THEN 'Quote Sent'
              WHEN selected_quote.status = 'Ready' THEN 'Ready To Send'
              WHEN selected_quote.id IS NOT NULL THEN 'Quote Costing'
              WHEN enquiry_item.technical_review_status = 'Not Feasible'
                THEN 'Cannot Quote'
              WHEN enquiry_item.technical_review_status IN (
                'Need Clarification', 'Need Sales Confirmation'
              ) THEN 'With Sales'
              WHEN enquiry_item.technical_review_status = 'Pending Review'
                THEN 'Technical Review'
              WHEN design.next_stage_status = 'Product Costing Complete'
                OR design.matched_product_id IS NOT NULL THEN 'Quote Costing'
              WHEN design.next_stage_status IN (
                'Product Costing', 'Changes Required'
              ) THEN 'Product Costing'
              WHEN COALESCE(design.design_status, '') NOT IN ('', 'Not Required')
                THEN 'Design'
              ELSE 'Technical Review'
            END AS current_status,
            COALESCE(
              selected_quote.item_uid, matched_product.uid,
              design.quoted_part_uid, design.internal_drawing_no,
              matched_product.converted_from_quote_uid
            ) AS design_part_no,
            CASE
              WHEN selected_quote.sent_at IS NOT NULL THEN 'PDF Sent'
              WHEN selected_quote.product_lifecycle_status = 'P'
                OR selected_quote.status = 'Ordered' THEN 'Order Received'
              ELSE 'Not Sent'
            END AS quote_pdf_status,
            selected_quote.sent_at AS quote_pdf_sent_at
          FROM sales.enquiry_items enquiry_item
          JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          LEFT JOIN sales.design_tasks design
            ON design.enquiry_item_id = enquiry_item.id
          LEFT JOIN catalog.items matched_product
            ON matched_product.id = design.matched_product_id
          LEFT JOIN LATERAL (
            SELECT product.id
            FROM catalog.items product
            WHERE product.organization_id = enquiry.organization_id
              AND (
                lower(product.uid) = lower(COALESCE(
                  design.quoted_part_uid, design.internal_drawing_no, ''
                ))
                OR lower(COALESCE(product.converted_from_quote_uid, '')) =
                  lower(COALESCE(
                    design.quoted_part_uid, design.internal_drawing_no, ''
                  ))
              )
            ORDER BY CASE
                WHEN lower(product.uid) = lower(COALESCE(
                  design.quoted_part_uid, design.internal_drawing_no, ''
                )) THEN 0 ELSE 1
              END,
              product.updated_at DESC, product.id DESC
            LIMIT 1
          ) designed_product ON true
          LEFT JOIN LATERAL (
            SELECT quote.id, quote.status,
              quote.superseded_by_quote_item_id, quote.sent_at,
              product.uid AS item_uid,
              product.lifecycle_status AS product_lifecycle_status
            FROM sales.quote_items quote
            JOIN catalog.items product ON product.id = quote.item_id
            WHERE quote.organization_id = enquiry.organization_id
              AND quote.status <> 'Cancelled'
              AND (
                quote.enquiry_item_id = enquiry_item.id
                OR (
                  quote.enquiry_id = enquiry.id
                  AND quote.item_id = COALESCE(
                    design.matched_product_id, designed_product.id,
                    enquiry_item.item_id
                  )
                )
              )
            ORDER BY
              CASE WHEN quote.enquiry_item_id = enquiry_item.id THEN 0 ELSE 1 END,
              CASE
                WHEN product.lifecycle_status = 'P'
                  OR quote.status = 'Ordered' THEN 0
                WHEN quote.is_active THEN 1
                WHEN quote.sent_at IS NOT NULL THEN 2
                ELSE 3
              END,
              COALESCE(quote.sent_at, quote.updated_at, quote.created_at) DESC,
              quote.id DESC
            LIMIT 1
          ) selected_quote ON true
          LEFT JOIN LATERAL (
            SELECT file.file_name
            FROM core.file_links file_link
            JOIN core.files file ON file.id = file_link.file_id
            WHERE file_link.target_schema = 'sales'
              AND file_link.target_table = 'enquiry_items'
              AND file_link.target_id = enquiry_item.id
              AND file_link.purpose IN ('drawing', 'sales_clarification')
              AND file_link.is_current
            ORDER BY file.created_at DESC, file.id DESC
            LIMIT 1
          ) drawing ON true
          WHERE lower(organization.code) = lower($1)
            AND ($3::uuid IS NULL OR enquiry.created_by_user_id = $3)
            AND enquiry_item.linked_enquiry_item_id IS NULL
          ORDER BY enquiry.created_at DESC, enquiry.id DESC,
            enquiry_item.line_number, enquiry_item.id
          LIMIT $2
        `,
        [
          organizationCode.trim(),
          limit + 1,
          scope?.originatingSalespersonUserId ?? null,
        ]
      )
      return boundedResult(
        rows.rows.slice(0, limit).map(enquirySpreadsheetItemFromRow),
        limit,
        rows.rows.length > limit
      )
    },

    async listTechnicalReviewQueueBounded(
      organizationCode: string,
      requestedLimit = 200
    ) {
      const limit = operationalRootLimit(requestedLimit)
      const roots = await pool.query<{
        company_name: string
        created_at: Date
        customer_part_code: string
        customer_uid: string
        description: string
        drawing_reference: string | null
        enquiry_id: string
        enquiry_item_id: string
        enquiry_number: string
        feasibility_reason: string | null
        grade: string | null
        line_number: number
        missing_information: string | null
        quantity: string
        reviewed_at: Date | null
        target_price: string | null
        technical_checklist: TechnicalChecklist
        technical_remarks: string | null
        technical_review_status: string
      }>(
        `
          SELECT enquiry_item.id AS enquiry_item_id,
            enquiry.id AS enquiry_id, enquiry.enquiry_number,
            enquiry.created_at, customer.customer_uid,
            customer.company_name, enquiry_item.line_number,
            enquiry_item.customer_part_code, enquiry_item.description,
            enquiry_item.grade, enquiry_item.quantity::text,
            enquiry_item.target_price::text,
            enquiry_item.drawing_reference,
            enquiry_item.technical_review_status,
            enquiry_item.technical_checklist,
            enquiry_item.missing_information,
            enquiry_item.feasibility_reason,
            enquiry_item.technical_remarks, enquiry_item.reviewed_at
          FROM sales.enquiry_items enquiry_item
          JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          WHERE lower(organization.code) = lower($1)
            AND enquiry_item.linked_enquiry_item_id IS NULL
            AND enquiry.technical_handover_status = 'Handed Over'
            AND enquiry_item.technical_review_status IN (
              'Pending Review', 'Need Clarification'
            )
            AND NOT EXISTS (
              SELECT 1 FROM sales.clarification_tasks sales_clarification
              WHERE sales_clarification.enquiry_item_id = enquiry_item.id
                AND sales_clarification.status = 'Open'
                AND sales_clarification.target_stage = 'Sales'
            )
          ORDER BY CASE enquiry_item.technical_review_status
              WHEN 'Pending Review' THEN 0
              WHEN 'Need Clarification' THEN 1
              WHEN 'Feasible' THEN 2
              WHEN 'Not Feasible' THEN 3
              ELSE 5
            END,
            enquiry.created_at DESC, enquiry_item.line_number,
            enquiry_item.id
          LIMIT $2
        `,
        [organizationCode.trim(), limit + 1]
      )
      const returnedRoots = roots.rows.slice(0, limit)
      const [clarifications, drawings] = returnedRoots.length
        ? await Promise.all([
            pool.query<{
              enquiry_item_id: string
              question: string
              source_stage: string
            }>(
              `
                SELECT DISTINCT ON (clarification.enquiry_item_id)
                  clarification.enquiry_item_id, clarification.question,
                  clarification.source_stage
                FROM sales.clarification_tasks clarification
                WHERE clarification.enquiry_item_id = ANY($1::uuid[])
                  AND clarification.status = 'Open'
                  AND clarification.target_stage = 'Technical'
                ORDER BY clarification.enquiry_item_id,
                  clarification.created_at DESC, clarification.id DESC
              `,
              [returnedRoots.map((root) => root.enquiry_item_id)]
            ),
            pool.query<{ enquiry_item_id: string; file_name: string }>(
              `
                SELECT DISTINCT ON (file_link.target_id)
                  file_link.target_id AS enquiry_item_id, file.file_name
                FROM core.file_links file_link
                JOIN core.files file ON file.id = file_link.file_id
                WHERE file_link.target_schema = 'sales'
                  AND file_link.target_table = 'enquiry_items'
                  AND file_link.target_id = ANY($1::uuid[])
                  AND file_link.purpose IN ('drawing', 'sales_clarification')
                  AND file_link.is_current
                ORDER BY file_link.target_id,
                  file.created_at DESC, file.id DESC
              `,
              [returnedRoots.map((root) => root.enquiry_item_id)]
            ),
          ])
        : [{ rows: [] }, { rows: [] }]
      const clarificationByItem = new Map(
        clarifications.rows.map((row) => [row.enquiry_item_id, row] as const)
      )
      const drawingByItem = new Map(
        drawings.rows.map(
          (row) => [row.enquiry_item_id, row.file_name] as const
        )
      )
      const rows = returnedRoots.map((row) => {
        const clarification = clarificationByItem.get(row.enquiry_item_id)
        return {
          companyName: row.company_name,
          customerPartCode: row.customer_part_code,
          customerUid: row.customer_uid,
          description: row.description,
          drawingFileName: drawingByItem.get(row.enquiry_item_id) ?? null,
          drawingReference: row.drawing_reference,
          enquiryId: row.enquiry_id,
          enquiryItemId: row.enquiry_item_id,
          enquiryNumber: row.enquiry_number,
          feasibilityReason: row.feasibility_reason,
          grade: row.grade,
          latestClarificationMessage: clarification?.question ?? null,
          latestClarificationSource: clarification?.source_stage ?? null,
          lineNumber: row.line_number,
          missingInformation: row.missing_information,
          quantity: Number(row.quantity),
          reviewedAt: row.reviewed_at,
          targetPrice:
            row.target_price === null ? null : Number(row.target_price),
          technicalChecklist: row.technical_checklist ?? {},
          technicalRemarks: row.technical_remarks,
          technicalReviewStatus: row.technical_review_status,
        }
      })
      return boundedResult(rows, limit, roots.rows.length > limit)
    },

    async listSalesClarificationQueueBounded(
      organizationCode: string,
      requestedLimit = 200,
      scope?: SalesWorkScope
    ) {
      const limit = operationalRootLimit(requestedLimit)
      const rows = await this.listSalesClarificationQueue(
        organizationCode,
        limit + 1,
        scope
      )
      return boundedResult(rows, limit)
    },

    async listSalesHandoverQueueBounded(
      organizationCode: string,
      requestedLimit = 200,
      scope?: SalesWorkScope
    ) {
      const limit = operationalRootLimit(requestedLimit)
      const rows = await this.listSalesHandoverQueue(
        organizationCode,
        limit + 1,
        scope
      )
      return boundedResult(rows, limit)
    },

    async listSalesQuoteReadyQueueBounded(
      organizationCode: string,
      requestedLimit = 200,
      scope?: SalesWorkScope
    ) {
      const limit = operationalRootLimit(requestedLimit)
      const rows = await this.listSalesQuoteReadyQueue(
        organizationCode,
        limit + 1,
        scope
      )
      return boundedResult(rows, limit)
    },

    async listFollowupsBounded(
      organizationCode: string,
      requestedLimit = 200,
      scope?: SalesWorkScope
    ) {
      const limit = operationalRootLimit(requestedLimit)
      const rows = await this.listFollowups(organizationCode, limit + 1, scope)
      return boundedResult(rows, limit)
    },

    async listSalesSentQuoteQueueBounded(
      organizationCode: string,
      scope?: SalesWorkScope
    ) {
      const rows = await this.listSalesSentQuoteQueue(
        organizationCode,
        commercialSelectorLimit + 1,
        scope
      )
      return boundedResult(rows, commercialSelectorLimit)
    },

    async listDesignQueueBounded(
      organizationCode: string,
      requestedLimit = 200,
      view: "active" | "completed" = "active"
    ) {
      const limit = operationalRootLimit(requestedLimit)
      const roots = await pool.query<DesignQueueDatabaseRow>(
        `
          SELECT enquiry_item.id AS enquiry_item_id,
            enquiry.id AS enquiry_id, enquiry.organization_id,
            enquiry.enquiry_number, customer.customer_uid,
            customer.company_name, enquiry_item.line_number,
            enquiry_item.customer_part_code, enquiry_item.description,
            enquiry.delivery_terms, enquiry.payment_terms,
            enquiry.remarks AS enquiry_remarks,
            enquiry_item.quantity::text, enquiry_item.grade,
            enquiry_item.target_price::text,
            enquiry_item.remarks AS line_remarks,
            enquiry_item.drawing_reference,
            enquiry_item.technical_review_status,
            enquiry_item.technical_checklist,
            enquiry_item.technical_remarks,
            enquiry_item.missing_information,
            enquiry_item.feasibility_reason,
            design.id AS design_id, design.design_status,
            design.portfolio_match_status, design.matched_product_id,
            matched_product.uid AS matched_product_uid,
            matched_product.description AS matched_product_description,
            design.quoted_part_uid, design.item_type,
            design.design_bom_completed, design.next_stage_status,
            design.manufacturing_process, design.package_process_required,
            design.design_remarks, design.designer_name,
            design.target_completion_date::text,
            design.internal_part_size, design.internal_part_sub_category,
            design.internal_part_category, design.revision_no,
            design.design_bom_required, design.components_required,
            design.assembly_required, design.operation_notes,
            design.tooling_required, design.tooling_approx_cost::text,
            design.fixture_required, design.fixture_approx_cost::text,
            design.gauges_required, design.inspection_approx_cost::text,
            design.checked_by, design.approval_status
          FROM sales.enquiry_items enquiry_item
          JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          LEFT JOIN sales.design_tasks design
            ON design.enquiry_item_id = enquiry_item.id
          LEFT JOIN catalog.items matched_product
            ON matched_product.id = design.matched_product_id
          WHERE lower(organization.code) = lower($1)
            AND enquiry_item.technical_review_status IN (
              'Feasible', 'Duplicate / Existing Product'
            )
            AND (
              ($3::text = 'completed'
                AND design.design_status = 'Design Complete')
              OR ($3::text = 'active'
                AND COALESCE(design.design_status, 'Pending Design') NOT IN (
                  'Design Complete', 'Not Required'
                ))
            )
          ORDER BY
            CASE WHEN $3::text = 'completed' THEN design.updated_at END DESC
              NULLS LAST,
            CASE COALESCE(design.design_status, 'Pending Design')
              WHEN 'Changes Required' THEN 0
              WHEN 'Pending Design' THEN 1
              WHEN 'In Progress' THEN 2
              WHEN 'Need Clarification' THEN 3
              ELSE 4
            END,
            enquiry.created_at DESC, enquiry_item.line_number,
            enquiry_item.id
          LIMIT $2
        `,
        [organizationCode.trim(), limit + 1, view]
      )
      const returnedRoots = roots.rows.slice(0, limit)
      const rows = await designRowsWithRelations(pool, returnedRoots)
      return boundedResult(rows, limit, roots.rows.length > limit)
    },

    async getDesignTask(organizationCode: string, enquiryItemId: string) {
      const roots = await pool.query<DesignQueueDatabaseRow>(
        `
          SELECT enquiry_item.id AS enquiry_item_id,
            enquiry.id AS enquiry_id, enquiry.organization_id,
            enquiry.enquiry_number, customer.customer_uid,
            customer.company_name, enquiry_item.line_number,
            enquiry_item.customer_part_code, enquiry_item.description,
            enquiry.delivery_terms, enquiry.payment_terms,
            enquiry.remarks AS enquiry_remarks,
            enquiry_item.quantity::text, enquiry_item.grade,
            enquiry_item.target_price::text,
            enquiry_item.remarks AS line_remarks,
            enquiry_item.drawing_reference,
            enquiry_item.technical_review_status,
            enquiry_item.technical_checklist,
            enquiry_item.technical_remarks,
            enquiry_item.missing_information,
            enquiry_item.feasibility_reason,
            design.id AS design_id, design.design_status,
            design.portfolio_match_status, design.matched_product_id,
            matched_product.uid AS matched_product_uid,
            matched_product.description AS matched_product_description,
            design.quoted_part_uid, design.item_type,
            design.design_bom_completed, design.next_stage_status,
            design.manufacturing_process, design.package_process_required,
            design.design_remarks, design.designer_name,
            design.target_completion_date::text,
            design.internal_part_size, design.internal_part_sub_category,
            design.internal_part_category, design.revision_no,
            design.design_bom_required, design.components_required,
            design.assembly_required, design.operation_notes,
            design.tooling_required, design.tooling_approx_cost::text,
            design.fixture_required, design.fixture_approx_cost::text,
            design.gauges_required, design.inspection_approx_cost::text,
            design.checked_by, design.approval_status
          FROM sales.enquiry_items enquiry_item
          JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          LEFT JOIN sales.design_tasks design
            ON design.enquiry_item_id = enquiry_item.id
          LEFT JOIN catalog.items matched_product
            ON matched_product.id = design.matched_product_id
          WHERE lower(organization.code) = lower($1)
            AND enquiry_item.id = $2
          LIMIT 1
        `,
        [organizationCode.trim(), enquiryItemId]
      )
      const rows = await designRowsWithRelations(pool, roots.rows)
      return rows[0] ?? null
    },

    async getDesignQueueSummary(organizationCode: string) {
      const result = await pool.query<{
        in_progress: string
        open_tasks: string
        pending_design: string
      }>(
        `
          SELECT
            count(*) FILTER (
              WHERE COALESCE(design.design_status, 'Pending Design') =
                'Pending Design'
            )::text AS pending_design,
            count(*) FILTER (
              WHERE COALESCE(design.design_status, 'Pending Design') IN (
                'In Progress', 'Design In Progress'
              )
            )::text AS in_progress,
            count(*)::text AS open_tasks
          FROM sales.enquiry_items enquiry_item
          JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          LEFT JOIN sales.design_tasks design
            ON design.enquiry_item_id = enquiry_item.id
          WHERE lower(organization.code) = lower($1)
            AND enquiry_item.technical_review_status IN (
              'Feasible', 'Duplicate / Existing Product'
            )
            AND COALESCE(design.design_status, 'Pending Design') NOT IN (
              'Design Complete', 'Not Required'
            )
        `,
        [organizationCode.trim()]
      )
      return {
        inProgress: Number(result.rows[0]?.in_progress ?? 0),
        openTasks: Number(result.rows[0]?.open_tasks ?? 0),
        pendingDesign: Number(result.rows[0]?.pending_design ?? 0),
      }
    },

    async searchDesignPortfolioProducts(
      organizationCode: string,
      value: string
    ) {
      const { containsPattern, query } = selectorSearchTerm(value)
      const products = await pool.query<{
        description: string
        id: string
        item_type: string
        uid: string
      }>(
        `
          SELECT item.id, item.uid, item.description, item.item_type
          FROM catalog.items item
          JOIN core.organizations organization
            ON organization.id = item.organization_id
          WHERE lower(organization.code) = lower($1)
            AND item.uid_kind = 'INTERNAL'
            AND item.lifecycle_status = 'P'
            AND (
              $2::text = ''
              OR lower(item.uid) = $2
              OR (
                $3::text IS NOT NULL
                AND lower(
                  coalesce(item.uid, '') || ' ' ||
                  coalesce(item.description, '')
                ) LIKE $3
              )
            )
          ORDER BY CASE WHEN lower(item.uid) = $2 THEN 0 ELSE 1 END,
            item.uid, item.id
          LIMIT $4
        `,
        [
          organizationCode.trim(),
          query,
          containsPattern,
          commercialSelectorLimit + 1,
        ]
      )
      return selectorResult(
        products.rows.map((row) => ({
          description: row.description,
          id: row.id,
          itemType: row.item_type,
          uid: row.uid,
        }))
      )
    },

    async listFollowupsForExport(
      organizationCode: string,
      batchSize = 500,
      scope?: SalesWorkScope
    ) {
      return transaction(pool, async (client) => {
        await client.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
        )
        return followupsForExport(client, organizationCode, batchSize, scope)
      })
    },

    async listSalesSentQuotesForExport(
      organizationCode: string,
      batchSize = 500,
      scope?: SalesWorkScope
    ) {
      return transaction(pool, async (client) => {
        await client.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
        )
        return sentQuotesForExport(client, organizationCode, batchSize, scope)
      })
    },

    async getSalesHistoryForExport(
      organizationCode: string,
      batchSize = 500,
      scope?: SalesWorkScope
    ) {
      return transaction(pool, async (client) => {
        await client.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
        )
        return {
          followups: await followupsForExport(
            client,
            organizationCode,
            batchSize,
            scope
          ),
          sentQuotes: await sentQuotesForExport(
            client,
            organizationCode,
            batchSize,
            scope
          ),
        }
      })
    },

    async listEnquiriesForExport(
      organizationCode: string,
      batchSize = 500,
      scope?: SalesWorkScope
    ) {
      const limit = boundedListLimit(batchSize)
      return transaction(pool, async (client) => {
        await client.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
        )
        const rows: Awaited<ReturnType<typeof enquiryRowsWithRelations>> = []
        let cursorCreatedAt: string | null = null
        let cursorId: string | null = null

        while (true) {
          const roots: QueryResult<EnquiryRootDatabaseRow> =
            await client.query<EnquiryRootDatabaseRow>(
              `
              SELECT enquiry.id, enquiry.organization_id,
                enquiry.enquiry_number, enquiry.status,
                enquiry.technical_handover_status,
                enquiry.technical_handover_at, enquiry.received_on::text,
                enquiry.source, enquiry.priority, enquiry.buyer_name,
                enquiry.remarks, enquiry.created_at,
                enquiry.created_at::text AS cursor_created_at,
                customer.customer_uid,
                customer.company_name
              FROM sales.enquiries enquiry
              JOIN core.organizations organization
                ON organization.id = enquiry.organization_id
              JOIN sales.customers customer
                ON customer.id = enquiry.customer_id
              WHERE lower(organization.code) = lower($1)
                AND ($5::uuid IS NULL OR enquiry.created_by_user_id = $5)
                AND (
                  $2::timestamptz IS NULL
                  OR (enquiry.created_at, enquiry.id)
                    < ($2::timestamptz, $3::uuid)
                )
              ORDER BY enquiry.created_at DESC, enquiry.id DESC
              LIMIT $4
            `,
              [
                organizationCode.trim(),
                cursorCreatedAt,
                cursorId,
                limit,
                scope?.originatingSalespersonUserId ?? null,
              ]
            )
          if (!roots.rows.length) break
          rows.push(...(await enquiryRowsWithRelations(client, roots.rows)))
          const cursor: EnquiryRootDatabaseRow = roots.rows.at(-1)!
          cursorCreatedAt = cursor.cursor_created_at!
          cursorId = cursor.id
          if (roots.rows.length < limit) break
        }

        return rows
      })
    },

    async getEnquiryLinesForExport(
      enquiryId: string,
      batchSize = 500,
      scope?: SalesWorkScope
    ) {
      const limit = boundedListLimit(batchSize)
      return transaction(pool, async (client) => {
        await client.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
        )
        const enquiry = await client.query<{
          company_name: string
          customer_uid: string
          enquiry_number: string
        }>(
          `
            SELECT enquiry.enquiry_number, customer.customer_uid,
              customer.company_name
            FROM sales.enquiries enquiry
            JOIN sales.customers customer ON customer.id = enquiry.customer_id
            WHERE enquiry.id = $1
              AND ($2::uuid IS NULL OR enquiry.created_by_user_id = $2)
          `,
          [enquiryId, scope?.originatingSalespersonUserId ?? null]
        )
        if (!enquiry.rows[0]) throw new Error("ENQ was not found.")

        const items: Array<{
          customerPartCode: string | null
          description: string
          drawingFileName: string | null
          drawingReference: string | null
          grade: string | null
          id: string
          lineNumber: number
          quantity: number
          remarks: string | null
          targetPrice: number | null
        }> = []
        let cursorLineNumber: number | null = null
        let cursorId: string | null = null

        while (true) {
          const batch: QueryResult<EnquiryLineExportDatabaseRow> =
            await client.query<EnquiryLineExportDatabaseRow>(
              `
              SELECT item.id, item.line_number, item.customer_part_code,
                item.description, item.grade, item.quantity::text,
                item.target_price::text, item.drawing_reference,
                item.remarks, drawing.file_name AS drawing_file_name
              FROM sales.enquiry_items item
              LEFT JOIN LATERAL (
                SELECT file.file_name
                FROM core.file_links file_link
                JOIN core.files file ON file.id = file_link.file_id
                WHERE file_link.target_schema = 'sales'
                  AND file_link.target_table = 'enquiry_items'
                  AND file_link.target_id = item.id
                  AND file_link.purpose IN ('drawing', 'sales_clarification')
                  AND file_link.is_current
                ORDER BY file.created_at DESC, file.id DESC
                LIMIT 1
              ) drawing ON true
              WHERE item.enquiry_id = $1
                AND (
                  $2::integer IS NULL
                  OR (item.line_number, item.id)
                    > ($2::integer, $3::uuid)
                )
              ORDER BY item.line_number, item.id
              LIMIT $4
            `,
              [enquiryId, cursorLineNumber, cursorId, limit]
            )
          items.push(
            ...batch.rows.map((row) => ({
              customerPartCode: row.customer_part_code,
              description: row.description,
              drawingFileName: row.drawing_file_name,
              drawingReference: row.drawing_reference,
              grade: row.grade,
              id: row.id,
              lineNumber: row.line_number,
              quantity: Number(row.quantity),
              remarks: row.remarks,
              targetPrice:
                row.target_price === null ? null : Number(row.target_price),
            }))
          )
          if (!batch.rows.length || batch.rows.length < limit) break
          const cursor: EnquiryLineExportDatabaseRow = batch.rows.at(-1)!
          cursorLineNumber = cursor.line_number
          cursorId = cursor.id
        }

        return {
          enquiry: {
            companyName: enquiry.rows[0].company_name,
            customerUid: enquiry.rows[0].customer_uid,
            enquiryNumber: enquiry.rows[0].enquiry_number,
          },
          items,
        }
      })
    },
  }
}
