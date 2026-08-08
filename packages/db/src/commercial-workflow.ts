import { randomUUID } from "node:crypto"
import path from "node:path"

import type { Pool, PoolClient } from "pg"

import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

type RepositoryOptions = RepositoryPoolOptions

type CommercialTerms = {
  conversionRate?: number
  currency?: string
  incoterms?: string | null
  packagingTerms?: string | null
  paymentTerms?: string | null
  shipmentMode?: string | null
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

type TechnicalChecklist = Record<string, boolean>

type DesignBomLine = {
  bomItem?: string | null
  casting?: number | null
  componentCode: string
  componentItemType?: string
  componentSource: string
  existingProductId?: string | null
  grade?: string | null
  lineNumber: number
  manufacturingProcess?: string | null
  notes?: string | null
  packagePart?: string | null
  packagePartUid?: string | null
  parentLineNumber?: number | null
  pieceWeight?: number | null
  processRequired?: string | null
  quantity: number
  rodSize?: string | null
  rodType?: string | null
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
        AND quote.status IN ('Draft', 'Sent', 'Accepted')
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
            AND quote.status IN ('Draft', 'Sent', 'Accepted')
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
        AND quote.status IN ('Draft', 'Sent', 'Accepted')
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
        AND quote.status IN ('Draft', 'Sent', 'Accepted')
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

async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await operation(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
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
      FOR UPDATE
    `,
    [input.enquiryId]
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

async function getImportReviewWithClient(client: PoolClient, reviewId: string) {
  const review = await client.query<{
    enquiry_id: string
    id: string
    status: string
  }>(
    `
      SELECT id, enquiry_id, status
      FROM sales.enquiry_import_reviews
      WHERE id = $1
    `,
    [reviewId]
  )
  if (!review.rows[0]) {
    throw new Error("Import review was not found.")
  }
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
    status: review.rows[0].status,
  }
}

export function createCommercialWorkflowRepository(options: RepositoryOptions) {
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
        const customer = await client.query<{ id: string }>(
          `
            SELECT id
            FROM sales.customers
            WHERE id = $1 AND organization_id = $2
            FOR SHARE
          `,
          [input.customerId, input.organizationId]
        )
        if (!customer.rows[0]) {
          throw new Error("Customer was not found in this organization.")
        }
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
              source_id, source_payload
            )
            VALUES (
              $1, $2, $3, $4, 'Logged', $5, $6, $7, $8, $9, $10,
              $11, $8, $12, $13, $14, 'Draft', 'mrm-dashboard',
              'enquiries', $15, $16
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
            input.buyerName ?? null,
            terms.incoterms ?? null,
            terms.paymentTerms ?? null,
            terms.currency ?? "USD",
            terms.conversionRate ?? 1,
            terms.shipmentMode ?? null,
            terms.packagingTerms ?? null,
            input.remarks ?? null,
            sourceId,
            input,
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
                FOR UPDATE
              `,
              [input.organizationId, row.enquiryNumber]
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

          const enquiryNumber = await nextEnquiryNumber(
            client,
            input.organizationId
          )
          const sourceId = randomUUID()
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
            FOR UPDATE
          `,
          [input.enquiryId, input.organizationId]
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
            FOR UPDATE
          `,
          [enquiryId]
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
            FOR UPDATE OF enquiry_item
          `,
          [input.enquiryItemId]
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
            FOR UPDATE
          `,
          [enquiryId]
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

    async listSalesHandoverQueue(organizationCode: string) {
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
          GROUP BY enquiry.id, customer.customer_uid, customer.company_name
          ORDER BY enquiry.created_at DESC
        `,
        [organizationCode.trim()]
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

    async listSalesQuoteReadyQueue(organizationCode: string) {
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
            AND quote.status IN ('Draft', 'Sent', 'Accepted', 'Ordered')
          WHERE organization.code = $1
            AND EXISTS (
              SELECT 1 FROM sales.quote_items ready_quote
              WHERE ready_quote.enquiry_id = enquiry.id
                AND ready_quote.status = 'Draft'
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
                      'Draft', 'Sent', 'Accepted', 'Ordered'
                    )
                )
            )
          GROUP BY enquiry.id, customer.customer_uid, customer.company_name
          ORDER BY latest_quote_at DESC NULLS LAST, enquiry.created_at DESC
        `,
        [organizationCode.trim()]
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

    async listSalesSentQuoteQueue(organizationCode: string) {
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
          GROUP BY enquiry.id, customer.customer_uid, customer.company_name
          ORDER BY latest_sent_at DESC, enquiry.created_at DESC
          LIMIT 50
        `,
        [organizationCode.trim()]
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

    async listSalesClarificationQueue(organizationCode: string) {
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
            AND clarification.target_stage = 'Sales'
            AND clarification.status = 'Open'
          ORDER BY clarification.created_at, clarification.id
        `,
        [organizationCode.trim()]
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
      const item = await pool.query<{
        customer_id: string
        customer_part_code: string
        organization_id: string
      }>(
        `
          SELECT enquiry.customer_id, enquiry.organization_id,
            enquiry_item.customer_part_code
          FROM sales.enquiry_items enquiry_item
          JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
          WHERE enquiry_item.id = $1
        `,
        [enquiryItemId]
      )
      if (!item.rows[0]) {
        throw new Error("Line item was not found.")
      }
      const candidates = await pool.query<{
        customer_part_code: string | null
        description: string
        item_type: string | null
        product_id: string
        product_uid: string
        quote_item_id: string
        quote_number: string
        revision: number
        status: string
        unit_price: string
      }>(
        `
          SELECT quote.id AS quote_item_id, quote.quote_number,
            quote.revision, quote.customer_part_code,
            quote.unit_price::text, quote.status,
            item.id AS product_id, item.uid AS product_uid,
            item.description, item.item_type
          FROM sales.quote_items quote
          JOIN catalog.items item ON item.id = quote.item_id
          WHERE quote.organization_id = $1
            AND quote.customer_id = $2
            AND quote.status IN ('Draft', 'Sent', 'Accepted', 'Ordered')
          ORDER BY
            CASE WHEN lower(btrim(coalesce(quote.customer_part_code, '')))
              = lower(btrim($3)) THEN 0 ELSE 1 END,
            quote.sent_at DESC NULLS LAST, quote.updated_at DESC,
            quote.id DESC
        `,
        [
          item.rows[0].organization_id,
          item.rows[0].customer_id,
          item.rows[0].customer_part_code,
        ]
      )
      return candidates.rows.map((row) => ({
        customerPartCode: row.customer_part_code,
        description: row.description,
        itemType: row.item_type,
        productId: row.product_id,
        productUid: row.product_uid,
        quoteItemId: row.quote_item_id,
        quoteNumber: row.quote_number,
        revision: row.revision,
        status: row.status,
        unitPrice: Number(row.unit_price),
      }))
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
            AND enquiry_item.technical_review_status
              <> 'Need Sales Confirmation'
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

    async listDesignQueue(organizationCode: string) {
      const items = await pool.query<{
        approval_status: string | null
        assembly_required: string | null
        bom_lines: DesignBomLine[]
        checked_by: string | null
        company_name: string
        components_required: string | null
        customer_part_code: string
        customer_uid: string
        design_bom_completed: string | null
        design_bom_required: string | null
        design_id: string | null
        design_remarks: string | null
        design_status: string | null
        designer_name: string | null
        description: string
        enquiry_id: string
        enquiry_item_id: string
        enquiry_number: string
        fixture_approx_cost: string | null
        fixture_required: string | null
        gauges_required: string | null
        inspection_approx_cost: string | null
        internal_part_category: string | null
        internal_part_size: string | null
        internal_part_sub_category: string | null
        item_type: string | null
        latest_clarification_message: string | null
        line_number: number
        manufacturing_process: string | null
        matched_product_description: string | null
        matched_product_id: string | null
        matched_product_uid: string | null
        next_stage_status: string | null
        operation_notes: string | null
        organization_id: string
        package_process_required: string | null
        portfolio_match_status: string | null
        quantity: string
        quoted_part_uid: string | null
        revision_no: string | null
        target_completion_date: string | null
        technical_review_status: string
        tooling_approx_cost: string | null
        tooling_required: string | null
      }>(
        `
          SELECT enquiry_item.id AS enquiry_item_id,
            enquiry.id AS enquiry_id, enquiry.organization_id,
            enquiry.enquiry_number, customer.customer_uid,
            customer.company_name, enquiry_item.line_number,
            enquiry_item.customer_part_code, enquiry_item.description,
            enquiry_item.quantity::text,
            enquiry_item.technical_review_status,
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
                  'lineNumber', bom.line_number,
                  'notes', bom.design_notes,
                  'packagePart', bom.package_part,
                  'packagePartUid', bom.package_part_uid,
                  'parentLineNumber', bom.parent_line_number,
                  'quantity', bom.quantity
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
            ) AS latest_clarification_message
          FROM sales.enquiry_items enquiry_item
          JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          LEFT JOIN sales.design_tasks design
            ON design.enquiry_item_id = enquiry_item.id
          LEFT JOIN catalog.items matched_product
            ON matched_product.id = design.matched_product_id
          WHERE organization.code = $1
            AND (
              enquiry_item.technical_review_status IN (
                'Feasible', 'Duplicate / Existing Product'
              )
              OR design.design_status IN (
                'Need Clarification', 'Changes Required'
              )
            )
          ORDER BY CASE COALESCE(design.design_status, 'Pending Design')
              WHEN 'Changes Required' THEN 0
              WHEN 'Need Clarification' THEN 1
              WHEN 'Pending Design' THEN 2
              ELSE 3
            END,
            enquiry.created_at, enquiry_item.line_number
        `,
        [organizationCode.trim()]
      )
      return items.rows.map((row) => ({
        approvalStatus: row.approval_status ?? "Pending",
        assemblyRequired: row.assembly_required ?? "No",
        bomLines: row.bom_lines,
        checkedBy: row.checked_by,
        companyName: row.company_name,
        componentsRequired: row.components_required,
        customerPartCode: row.customer_part_code,
        customerUid: row.customer_uid,
        designBomCompleted: row.design_bom_completed ?? "No",
        designBomRequired: row.design_bom_required ?? "No",
        designId: row.design_id,
        designRemarks: row.design_remarks,
        designStatus: row.design_status ?? "Pending Design",
        designerName: row.designer_name,
        description: row.description,
        enquiryId: row.enquiry_id,
        enquiryItemId: row.enquiry_item_id,
        enquiryNumber: row.enquiry_number,
        fixtureApproxCost: Number(row.fixture_approx_cost ?? 0),
        fixtureRequired: row.fixture_required ?? "No",
        gaugesRequired: row.gauges_required ?? "No",
        inspectionApproxCost: Number(row.inspection_approx_cost ?? 0),
        internalPartCategory: row.internal_part_category,
        internalPartSize: row.internal_part_size,
        internalPartSubCategory: row.internal_part_sub_category,
        itemType: row.item_type ?? "List",
        latestClarificationMessage: row.latest_clarification_message,
        lineNumber: row.line_number,
        manufacturingProcess: row.manufacturing_process,
        matchedProductDescription: row.matched_product_description,
        matchedProductId: row.matched_product_id,
        matchedProductUid: row.matched_product_uid,
        nextStageStatus: row.next_stage_status ?? "Not Started",
        operationNotes: row.operation_notes,
        organizationId: row.organization_id,
        packageProcessRequired: row.package_process_required,
        portfolioMatchStatus:
          row.portfolio_match_status ?? "New Design Required",
        quantity: Number(row.quantity),
        quotedPartUid: row.quoted_part_uid,
        revisionNo: row.revision_no ?? "0",
        targetCompletionDate: row.target_completion_date,
        technicalReviewStatus: row.technical_review_status,
        toolingApproxCost: Number(row.tooling_approx_cost ?? 0),
        toolingRequired: row.tooling_required ?? "No",
      }))
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
            FOR UPDATE OF clarification, enquiry_item
          `,
          [input.clarificationTaskId, input.enquiryItemId]
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
                    'Draft', 'Sent', 'Accepted', 'Ordered'
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
          `,
          [input.enquiryId, input.organizationId]
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
            SELECT organization_id, enquiry_id FROM sales.followups
            WHERE id = $1 FOR UPDATE
          `,
          [input.followupId]
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

    async listFollowups(organizationCode: string) {
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
          ORDER BY followup.due_on, followup.created_at, followup.id
        `,
        [organizationCode.trim()]
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

    async saveDesign(input: {
      approvalStatus?: string
      actorUserId?: string | null
      assemblyRequired?: string
      bomLines?: DesignBomLine[]
      checkedBy?: string | null
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
          existing_quoted_part_uid: string | null
          organization_id: string
          technical_review_status: string
        }>(
          `
            SELECT enquiry_item.organization_id,
              enquiry_item.technical_review_status,
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
        const isPortfolioMatch =
          input.portfolioMatchStatus === "Matches Existing Portfolio"
        if (isPortfolioMatch && !input.matchedProductId) {
          throw new Error("A matched portfolio product is required.")
        }
        if (input.matchedProductId) {
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

        const itemType = input.itemType === "Package" ? "Package" : "List"
        const designBomCompleted = isPortfolioMatch
          ? "Yes"
          : (input.designBomCompleted ??
            (input.designStatus === "Design Complete" ? "Yes" : "No"))
        const designStatus = isPortfolioMatch
          ? "Not Required"
          : designBomCompleted === "Yes"
            ? "Design Complete"
            : input.designStatus
        const nextStageStatus = isPortfolioMatch
          ? "Product Costing Complete"
          : "Not Started"
        const quotedPartUid = isPortfolioMatch
          ? null
          : input.quotedPartUid?.trim() ||
            enquiryLine.existing_quoted_part_uid ||
            (await nextDesignUid(
              client,
              enquiryLine.organization_id,
              itemType === "Package" ? "PACKAGE" : "QUOTE"
            ))
        const internalPartName =
          [
            input.internalPartSize,
            input.internalPartSubCategory,
            input.internalPartCategory,
          ]
            .filter(Boolean)
            .join(" ") || null
        const inputBomLines = isPortfolioMatch ? [] : (input.bomLines ?? [])
        if (designStatus === "Design Complete" && inputBomLines.length === 0) {
          throw new Error(
            "A completed new design requires at least one BOM line."
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
              actual_completion_date = EXCLUDED.actual_completion_date,
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
            WHERE sales.design_tasks.next_stage_status IN (
              'Not Started', 'Changes Required'
            )
            RETURNING id, next_stage_status
          `,
          [
            enquiryLine.organization_id,
            input.enquiryItemId,
            designStatus,
            input.portfolioMatchStatus,
            input.matchedProductId ?? null,
            quotedPartUid,
            itemType,
            designBomCompleted,
            nextStageStatus,
            input.manufacturingProcess ?? null,
            input.packageProcessRequired ?? null,
            input.designRemarks ?? null,
            input.designerName ?? null,
            input.targetCompletionDate ?? null,
            input.internalPartSize ?? null,
            input.internalPartSubCategory ?? null,
            input.internalPartCategory ?? null,
            internalPartName,
            input.revisionNo ?? "0",
            isPortfolioMatch ? "No" : (input.designBomRequired ?? "Yes"),
            input.componentsRequired ?? null,
            itemType === "Package" ? "Yes" : (input.assemblyRequired ?? "No"),
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
            input.approvalStatus ?? "Pending",
            randomUUID(),
            input,
          ]
        )
        if (!design.rows[0]) {
          throw new Error(
            "Design task cannot be edited because the next step has already started."
          )
        }

        const bomRows: Array<
          DesignBomLine & { packagePartUid: string | null }
        > = []
        for (const bomLine of inputBomLines) {
          let existingUid: string | null = null
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
          [design.rows[0].id]
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
                process_required, design_notes, source_system, source_table,
                source_id, source_payload
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
                'mrm-dashboard', 'design_bom_lines', $22, $23
              )
            `,
            [
              enquiryLine.organization_id,
              design.rows[0].id,
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
              bomLine.processRequired ?? null,
              bomLine.notes ?? null,
              randomUUID(),
              bomLine,
            ]
          )
        }
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "design.saved",
          metadata: {
            designStatus,
            portfolioMatchStatus: input.portfolioMatchStatus,
            quotedPartUid,
          },
          organizationId: enquiryLine.organization_id,
          targetId: design.rows[0].id,
          targetTable: "design_tasks",
        })
        return {
          id: design.rows[0].id,
          nextStageStatus: design.rows[0].next_stage_status,
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
              task.design_remarks, item.description
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
          component_item_type: string
          component_source: string
          design_notes: string | null
          existing_product_id: string | null
          grade: string | null
          line_number: number
          manufacturing_process: string | null
          package_part: string | null
          package_part_uid: string | null
          parent_line_number: number | null
          piece_weight: string | null
          quantity: string
          rod_size: string | null
          rod_type: string | null
        }>(
          `
            SELECT component_code, quantity::text, line_number,
              parent_line_number, component_source, existing_product_id,
              component_item_type, package_part_uid, package_part, rod_size,
              rod_type, grade, manufacturing_process, casting::text,
              piece_weight::text, design_notes
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
              rod_size, weight_100_pcs, casting, remarks, source_system,
              source_table, source_id, source_payload
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9,
              'mrm-dashboard', 'design_tasks', $10, $11
            )
            ON CONFLICT (organization_id, lower(uid)) DO UPDATE SET
              description = EXCLUDED.description,
              item_type = EXCLUDED.item_type,
              production_type = EXCLUDED.production_type,
              rod_size = EXCLUDED.rod_size,
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
            row.manufacturing_process,
            row.item_type === "List" ? (firstLine?.rod_size ?? null) : null,
            row.item_type === "List"
              ? asNumber(firstLine?.piece_weight) * 100
              : 0,
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
                    production_type, rod_size, weight_100_pcs, casting,
                    remarks, source_system, source_table, source_id,
                    source_payload
                  )
                  VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9,
                    'mrm-dashboard', 'design_bom_lines', $10, $11
                  )
                  ON CONFLICT (organization_id, lower(uid)) DO UPDATE SET
                    description = EXCLUDED.description,
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
                  bomLine.manufacturing_process,
                  bomLine.rod_size,
                  asNumber(bomLine.piece_weight) * 100,
                  asNumber(bomLine.casting, 1),
                  bomLine.design_notes,
                  `${row.id}:${bomLine.line_number}`,
                  bomLine,
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
        await client.query(
          `
            INSERT INTO core.file_links (
              organization_id, file_id, target_schema, target_table,
              target_id, purpose
            )
            VALUES ($1, $2, 'sales', $3, $4, $5)
            ON CONFLICT DO NOTHING
          `,
          [
            input.organizationId,
            file.rows[0]!.id,
            targetTable,
            input.targetId,
            purpose,
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
      purpose?: "cad" | "customer_marked" | "drawing" | "internal_drawing"
      targetId: string
      targetTable: "design_tasks" | "enquiry_items"
    }) {
      const files = await pool.query<{
        byte_size: string
        created_at: Date
        file_name: string
        id: string
        media_type: string | null
        purpose: string
        storage_key: string
      }>(
        `
          SELECT file.id, file.file_name, file.media_type,
            file.byte_size::text, file.storage_key, file.created_at,
            file_link.purpose
          FROM core.file_links file_link
          JOIN core.files file ON file.id = file_link.file_id
          WHERE file_link.organization_id = $1
            AND file_link.target_schema = 'sales'
            AND file_link.target_table = $2
            AND file_link.target_id = $3
            AND ($4::text IS NULL OR file_link.purpose = $4)
          ORDER BY file.created_at DESC, file.id DESC
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
        mediaType: row.media_type,
        purpose: row.purpose,
        storageKey: row.storage_key,
      }))
    },

    async listAttachmentsForTargets(input: {
      organizationId: string
      purpose?: "cad" | "customer_marked" | "drawing" | "internal_drawing"
      targetIds: string[]
      targetTable: "design_tasks" | "enquiry_items"
    }) {
      if (input.targetIds.length === 0) {
        return new Map<string, Awaited<ReturnType<typeof this.listAttachments>>>()
      }

      const files = await pool.query<{
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
          SELECT file_link.target_id, file.id, file.file_name, file.media_type,
            file.byte_size::text, file.storage_key, file.created_at,
            file_link.purpose
          FROM core.file_links file_link
          JOIN core.files file ON file.id = file_link.file_id
          WHERE file_link.organization_id = $1
            AND file_link.target_schema = 'sales'
            AND file_link.target_table = $2
            AND file_link.target_id = ANY($3::uuid[])
            AND ($4::text IS NULL OR file_link.purpose = $4)
          ORDER BY file_link.target_id, file.created_at DESC, file.id DESC
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
          mediaType: row.media_type,
          purpose: row.purpose,
          storageKey: row.storage_key,
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
        storage_key: string
      }>(
        `
          SELECT file.id, file.file_name, file.media_type,
            file.byte_size::text, file.storage_key, file.created_at
          FROM core.file_links file_link
          JOIN core.files file ON file.id = file_link.file_id
          WHERE file_link.organization_id = $1
            AND file_link.target_schema = 'sales'
            AND file_link.target_table = 'enquiry_items'
            AND file_link.target_id = $2
            AND file_link.purpose = 'drawing'
          ORDER BY file.created_at DESC, file.id DESC
        `,
        [input.organizationId, input.enquiryItemId]
      )
      return drawings.rows.map((row) => ({
        byteSize: Number(row.byte_size),
        createdAt: row.created_at,
        fileName: row.file_name,
        id: row.id,
        mediaType: row.media_type,
        storageKey: row.storage_key,
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
        storage_key: string
      }>(
        `
          SELECT file.id, file.file_name, file.media_type,
            file.byte_size::text, file.storage_key, file.created_at
          FROM core.file_links file_link
          JOIN core.files file ON file.id = file_link.file_id
          WHERE file_link.organization_id = $1
            AND file_link.target_schema = 'sales'
            AND file_link.target_table = 'enquiry_items'
            AND file_link.target_id = $2
            AND file_link.purpose = 'drawing'
          ORDER BY file.created_at DESC, file.id DESC
          LIMIT 1
        `,
        [input.organizationId, input.enquiryItemId]
      )
      const row = drawings.rows[0]
      if (!row) {
        throw new Error("Drawing was not found.")
      }
      return {
        byteSize: Number(row.byte_size),
        createdAt: row.created_at,
        fileName: row.file_name,
        id: row.id,
        mediaType: row.media_type,
        storageKey: row.storage_key,
      }
    },

    async createImportReview(input: {
      enquiryId: string
      importKey: string
      organizationId: string
      rows: ImportRow[]
    }) {
      return transaction(pool, async (client) => {
        const enquiry = await client.query<{
          customer_id: string
          id: string
        }>(
          `
            SELECT id, customer_id FROM sales.enquiries
            WHERE id = $1 AND organization_id = $2
          `,
          [input.enquiryId, input.organizationId]
        )
        if (!enquiry.rows[0]) {
          throw new Error("ENQ was not found in this organization.")
        }
        const review = await client.query<{ id: string }>(
          `
            INSERT INTO sales.enquiry_import_reviews (
              organization_id, enquiry_id, status, summary, source_system,
              source_table, source_id, source_payload
            )
            VALUES (
              $1, $2, 'Pending', $3, 'mrm-dashboard',
              'enquiry_import_reviews', $4, $5
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
        return getImportReviewWithClient(client, review.rows[0]!.id)
      })
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
            SELECT enquiry_id, organization_id, status
            FROM sales.enquiry_import_reviews
            WHERE id = $1
            FOR UPDATE
          `,
          [input.reviewId]
        )
        const reviewRow = review.rows[0]
        if (!reviewRow) {
          throw new Error("Import review was not found.")
        }
        if (reviewRow.status === "Applied") {
          return getImportReviewWithClient(client, input.reviewId)
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
        return getImportReviewWithClient(client, input.reviewId)
      })
    },

    async getEnquiry(enquiryId: string) {
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
          `,
          [enquiryId]
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
                AND file_link.purpose = 'drawing'
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
            getImportReviewWithClient(client, review.id)
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

    async getImportReview(reviewId: string) {
      return transaction(pool, async (client) => {
        await client.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
        )
        return getImportReviewWithClient(client, reviewId)
      })
    },

    async listEnquiries(organizationCode: string) {
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
          GROUP BY enquiry.id, customer.customer_uid, customer.company_name
          ORDER BY enquiry.created_at DESC
        `,
        [organizationCode.trim()]
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
  }
}
