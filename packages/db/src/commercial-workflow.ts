import { randomUUID } from "node:crypto"
import path from "node:path"

import { Pool, type PoolClient } from "pg"

type RepositoryOptions = {
  connectionString: string
}

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
    [
      input.organizationId,
      input.customerId,
      normalizedPart,
    ]
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
    [
      input.organizationId,
      input.customerId,
      input.enquiryId,
      normalizedPart,
    ]
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
    [
      input.organizationId,
      input.customerId,
      `%${normalizedPart.slice(0, 6)}%`,
    ]
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

export function createCommercialWorkflowRepository({
  connectionString,
}: RepositoryOptions) {
  const pool = new Pool({ connectionString })

  return {
    async close() {
      await pool.end()
    },

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

    async addEnquiryItem(input: AddEnquiryItem) {
      return transaction(pool, (client) =>
        addEnquiryItemWithClient(client, input)
      )
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

    async completeSalesClarification(input: {
      actorUserId?: string | null
      clarificationTaskId: string
      enquiryItemId: string
      response?: string | null
    }) {
      return transaction(pool, async (client) => {
        const task = await client.query<{
          id: string
          organization_id: string
        }>(
          `
            SELECT id, organization_id
            FROM sales.clarification_tasks
            WHERE id = $1 AND enquiry_item_id = $2
              AND target_stage = 'Sales'
            FOR UPDATE
          `,
          [input.clarificationTaskId, input.enquiryItemId]
        )
        if (!task.rows[0]) {
          throw new Error("Sales clarification task is required.")
        }
        await client.query(
          `
            UPDATE sales.enquiry_items
            SET technical_review_status = 'Pending Review',
              updated_at = now(), row_version = row_version + 1
            WHERE id = $1
          `,
          [input.enquiryItemId]
        )
        const resolved = await client.query<{
          id: string
          status: string
        }>(
          `
            UPDATE sales.clarification_tasks
            SET status = 'Resolved', response = $1, resolved_at = now(),
              updated_at = now(), row_version = row_version + 1
            WHERE id = $2
            RETURNING id, status
          `,
          [input.response ?? null, input.clarificationTaskId]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "clarification.resolved",
          organizationId: task.rows[0].organization_id,
          targetId: input.clarificationTaskId,
          targetTable: "clarification_tasks",
        })
        return resolved.rows[0]!
      })
    },

    async saveDesign(input: {
      actorUserId?: string | null
      bomLines?: DesignBomLine[]
      designRemarks?: string | null
      designStatus: string
      enquiryItemId: string
      itemType: string
      manufacturingProcess?: string | null
      matchedProductId?: string | null
      packageProcessRequired?: string | null
      portfolioMatchStatus: string
      quotedPartUid: string | null
    }) {
      return transaction(pool, async (client) => {
        const line = await client.query<{
          organization_id: string
          technical_review_status: string
        }>(
          `
            SELECT organization_id, technical_review_status
            FROM sales.enquiry_items
            WHERE id = $1
            FOR UPDATE
          `,
          [input.enquiryItemId]
        )
        if (!line.rows[0]) {
          throw new Error("Line item was not found.")
        }
        const isPortfolioMatch =
          input.portfolioMatchStatus === "Matches Existing Portfolio"
        if (isPortfolioMatch && !input.matchedProductId) {
          throw new Error("A matched portfolio product is required.")
        }
        if (input.matchedProductId) {
          const product = await client.query<{ id: string }>(
            `
              SELECT id
              FROM catalog.items
              WHERE id = $1 AND organization_id = $2
              FOR SHARE
            `,
            [input.matchedProductId, line.rows[0].organization_id]
          )
          if (!product.rows[0]) {
            throw new Error(
              "Matched product was not found in this organization."
            )
          }
        }
        if (
          !isPortfolioMatch &&
          input.designStatus === "Design Complete" &&
          !input.quotedPartUid?.trim()
        ) {
          throw new Error("Design part number is required before completion.")
        }

        const designStatus = isPortfolioMatch
          ? "Not Required"
          : input.designStatus
        const nextStageStatus = isPortfolioMatch
          ? "Product Costing Complete"
          : "Not Started"
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
              design_remarks, source_system, source_table, source_id,
              source_payload
            )
            VALUES (
              $1, $2, $3, $4, $5, $3, $6, $7, $8, $9, now(),
              CASE WHEN $3 IN ('Design Complete', 'Not Required')
                THEN now() ELSE NULL END,
              $10, $11, $12, 'mrm-dashboard', 'design_tasks', $13, $14
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
              source_payload = EXCLUDED.source_payload,
              updated_at = now(),
              row_version = sales.design_tasks.row_version + 1
            WHERE sales.design_tasks.next_stage_status IN (
              'Not Started', 'Changes Required'
            )
            RETURNING id, next_stage_status
          `,
          [
            line.rows[0].organization_id,
            input.enquiryItemId,
            designStatus,
            input.portfolioMatchStatus,
            input.matchedProductId ?? null,
            input.quotedPartUid?.trim() || null,
            input.itemType,
            designStatus === "Design Complete" || isPortfolioMatch
              ? "Yes"
              : "No",
            nextStageStatus,
            input.manufacturingProcess ?? null,
            input.packageProcessRequired ?? null,
            input.designRemarks ?? null,
            randomUUID(),
            input,
          ]
        )
        if (!design.rows[0]) {
          throw new Error(
            "Design task cannot be edited because the next step has already started."
          )
        }
        await client.query(
          "DELETE FROM sales.design_bom_lines WHERE design_task_id = $1",
          [design.rows[0].id]
        )
        for (const bomLine of isPortfolioMatch ? [] : (input.bomLines ?? [])) {
          if (bomLine.lineNumber <= 0 || bomLine.quantity <= 0) {
            throw new Error("Design BOM line and quantity must be positive.")
          }
          await client.query(
            `
              INSERT INTO sales.design_bom_lines (
                organization_id, design_task_id, component_code, description,
                quantity, sequence, line_number, parent_line_number,
                component_source, existing_product_id, component_item_type,
                package_part_uid, package_part, rod_size, rod_type, grade,
                manufacturing_process, casting, piece_weight,
                process_required, design_notes, source_system, source_table,
                source_id, source_payload
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16, $17, $18, $19, $20,
                'mrm-dashboard', 'design_bom_lines', $21, $22
              )
            `,
            [
              line.rows[0].organization_id,
              design.rows[0].id,
              bomLine.componentCode.trim(),
              bomLine.packagePart ?? null,
              bomLine.quantity,
              bomLine.lineNumber,
              bomLine.parentLineNumber ?? null,
              bomLine.componentSource,
              bomLine.existingProductId ?? null,
              bomLine.componentItemType ?? "List",
              bomLine.packagePartUid ?? null,
              bomLine.packagePart ?? null,
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
          },
          organizationId: line.rows[0].organization_id,
          targetId: design.rows[0].id,
          targetTable: "design_tasks",
        })
        return {
          id: design.rows[0].id,
          nextStageStatus: design.rows[0].next_stage_status,
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
      sha256?: string | null
      sourceId: string
      storageKey: string
      targetId: string
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
        const target = await client.query<{ id: string }>(
          `
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
              'enquiry_attachments', $7, $8
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
            VALUES ($1, $2, 'sales', 'enquiry_items', $3, 'drawing')
            ON CONFLICT DO NOTHING
          `,
          [input.organizationId, file.rows[0]!.id, input.targetId]
        )
        return {
          fileName: file.rows[0]!.file_name,
          id: file.rows[0]!.id,
          storageKey: file.rows[0]!.storage_key,
        }
      })
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
            throw new Error(`Import row ${decision.rowNumber} has two decisions.`)
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
          enquiry_number: string
          id: string
          organization_id: string
          status: string
          technical_handover_status: string
        }>(
          `
            SELECT id, organization_id, enquiry_number, status,
              technical_handover_status
            FROM sales.enquiries
            WHERE id = $1
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
          id: string
          line_number: number
          next_stage_status: string | null
          technical_review_status: string
        }>(
          `
            SELECT item.id, item.line_number, item.customer_part_code,
              item.description, item.technical_review_status,
              design.design_status, design.next_stage_status
            FROM sales.enquiry_items item
            LEFT JOIN sales.design_tasks design
              ON design.enquiry_item_id = item.id
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
            enquiryNumber: enquiry.rows[0].enquiry_number,
            id: enquiry.rows[0].id,
            organizationId: enquiry.rows[0].organization_id,
            status: enquiry.rows[0].status,
            technicalHandoverStatus: enquiry.rows[0].technical_handover_status,
          },
          importReviews,
          items: items.rows.map((row) => ({
            customerPartCode: row.customer_part_code,
            description: row.description,
            designStatus: row.design_status,
            id: row.id,
            lineNumber: row.line_number,
            nextStageStatus: row.next_stage_status,
            technicalReviewStatus: row.technical_review_status,
          })),
        }
      })
    },

    async listEnquiries(organizationCode: string) {
      const result = await pool.query<{
        company_name: string
        enquiry_number: string
        id: string
        item_count: string
        status: string
        technical_handover_status: string
      }>(
        `
          SELECT enquiry.id, enquiry.enquiry_number, enquiry.status,
            enquiry.technical_handover_status, customer.company_name,
            count(item.id)::text AS item_count
          FROM sales.enquiries enquiry
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          LEFT JOIN sales.enquiry_items item ON item.enquiry_id = enquiry.id
          WHERE lower(organization.code) = lower($1)
          GROUP BY enquiry.id, customer.company_name
          ORDER BY enquiry.created_at DESC
        `,
        [organizationCode.trim()]
      )
      return result.rows.map((row) => ({
        companyName: row.company_name,
        enquiryNumber: row.enquiry_number,
        id: row.id,
        itemCount: Number(row.item_count),
        status: row.status,
        technicalHandoverStatus: row.technical_handover_status,
      }))
    },
  }
}
