import { randomUUID } from "node:crypto"

import { Pool, type PoolClient } from "pg"

type RepositoryOptions = {
  connectionString: string
}

type PriceDecision = "Accept PO Price" | "Keep Our Price"

type MatchEvidence = {
  candidateLineageCount: number
  candidateQuoteCount: number
  matchedBy: "Customer Part Code" | "Item Alias" | "Item UID" | null
}

type PurchaseOrderLineRow = {
  currency_code: string
  customer_part_code: string
  decision: string
  description: string | null
  id: string
  line_number: number
  match_evidence: MatchEvidence | null
  match_status: string
  matched_item_id: string | null
  pi_price: string | null
  price_difference: string | null
  purchase_order_id: string
  quantity: string
  quote_item_id: string | null
  system_price: string | null
  unit_price: string
}

type ProformaInvoiceRow = {
  id: string
  invoice_date: string
  invoice_number: string
  purchase_order_id: string
  revision: number
  status: string
  total_amount: string
}

type QuoteMatchRow = {
  approved_price_usd: string
  customer_part_code: string | null
  id: string
  item_id: string
  item_uid: string
  lineage_item_id: string
  packaging: string | null
  purchase_times: string
  rate_usd: string
  revision: number
  scrap_rate: string
  shipping_terms: string | null
  profit_percent: string
  unit_price: string
}

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const asTrimmed = (value: string | null | undefined) => value?.trim() ?? ""

const asDateText = (value: string | Date) => {
  if (!(value instanceof Date)) return value
  const year = value.getFullYear()
  const month = (value.getMonth() + 1).toString().padStart(2, "0")
  const day = value.getDate().toString().padStart(2, "0")
  return `${year}-${month}-${day}`
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
        'commercial_order_events', $7
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

function mapPurchaseOrderLine(row: PurchaseOrderLineRow) {
  return {
    currencyCode: row.currency_code,
    customerPartCode: row.customer_part_code,
    decision: row.decision,
    description: row.description,
    id: row.id,
    lineNumber: row.line_number,
    matchEvidence: row.match_evidence ?? {
      candidateLineageCount: 0,
      candidateQuoteCount: 0,
      matchedBy: null,
    },
    matchStatus: row.match_status,
    matchedItemId: row.matched_item_id,
    piPrice: row.pi_price === null ? null : asNumber(row.pi_price),
    poPrice: asNumber(row.unit_price),
    priceDifference:
      row.price_difference === null ? null : asNumber(row.price_difference),
    purchaseOrderId: row.purchase_order_id,
    quantity: asNumber(row.quantity),
    quoteItemId: row.quote_item_id,
    systemPrice: row.system_price === null ? null : asNumber(row.system_price),
  }
}

function mapInvoice(row: ProformaInvoiceRow) {
  return {
    id: row.id,
    invoiceDate: asDateText(row.invoice_date as string | Date),
    invoiceNumber: row.invoice_number,
    purchaseOrderId: row.purchase_order_id,
    revision: row.revision,
    status: row.status,
    totalAmount: asNumber(row.total_amount),
  }
}

async function findQuoteMatch(
  client: PoolClient,
  input: {
    customerId: string
    customerPartCode: string
    organizationId: string
  }
) {
  const code = input.customerPartCode.trim()
  const result = await client.query<QuoteMatchRow & { matched_by: string }>(
    `
      SELECT quote.id, quote.item_id, quote.lineage_item_id,
        quote.customer_part_code, quote.revision, quote.unit_price,
        quote.rate_usd, quote.approved_price_usd, quote.scrap_rate,
        quote.purchase_times, quote.profit_percent, quote.shipping_terms,
        quote.packaging, item.uid AS item_uid,
        CASE
          WHEN lower(quote.customer_part_code) = lower($4)
            THEN 'Customer Part Code'
          WHEN lower(item.uid) = lower($4) THEN 'Item UID'
          ELSE 'Item Alias'
        END AS matched_by
      FROM sales.quote_items quote
      JOIN catalog.items item ON item.id = quote.item_id
      WHERE quote.organization_id = $1
        AND quote.customer_id = $2
        AND quote.is_active
        AND quote.status IN ('Sent', 'Accepted')
        AND (
          lower(quote.customer_part_code) = lower($3)
          OR lower(item.uid) = lower($3)
          OR EXISTS (
            SELECT 1
            FROM catalog.item_aliases alias
            WHERE alias.item_id = item.id
              AND lower(alias.alias) = lower($3)
          )
        )
      ORDER BY
        CASE WHEN lower(quote.customer_part_code) = lower($3) THEN 0
          WHEN lower(item.uid) = lower($3) THEN 1 ELSE 2 END,
        CASE WHEN quote.status = 'Accepted' THEN 0 ELSE 1 END,
        quote.revision DESC, quote.sent_at DESC NULLS LAST,
        quote.created_at DESC, quote.id DESC
    `,
    [input.organizationId, input.customerId, code, code]
  )
  const lineages = new Set(result.rows.map((row) => row.lineage_item_id))
  const evidence: MatchEvidence = {
    candidateLineageCount: lineages.size,
    candidateQuoteCount: result.rows.length,
    matchedBy:
      (result.rows[0]?.matched_by as MatchEvidence["matchedBy"]) ?? null,
  }
  return {
    evidence,
    quote: result.rows[0] ?? null,
  }
}

async function getPurchaseOrderLine(
  client: PoolClient,
  purchaseOrderLineId: string,
  lock = false
) {
  const result = await client.query<PurchaseOrderLineRow>(
    `
      SELECT *
      FROM sales.purchase_order_lines
      WHERE id = $1
      ${lock ? "FOR UPDATE" : ""}
    `,
    [purchaseOrderLineId]
  )
  if (!result.rows[0]) {
    throw new Error("Purchase-order line was not found.")
  }
  return result.rows[0]
}

async function nextInternalUid(client: PoolClient, organizationId: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `catalog.internal-uid:${organizationId}`,
  ])
  const result = await client.query<{ next_value: string }>(
    `
      SELECT (
        COALESCE(max(substring(uid FROM 2)::bigint), 0) + 1
      )::text AS next_value
      FROM catalog.items
      WHERE organization_id = $1 AND uid ~ '^M[0-9]+$'
    `,
    [organizationId]
  )
  return `M${result.rows[0]!.next_value}`
}

async function convertQuotedItem(
  client: PoolClient,
  input: {
    actorUserId?: string | null
    itemId: string
    organizationId: string
  }
) {
  const result = await client.query<{
    lifecycle_status: string
    uid: string
    uid_kind: string
  }>(
    `
      SELECT uid, uid_kind, lifecycle_status
      FROM catalog.items
      WHERE id = $1 AND organization_id = $2
      FOR UPDATE
    `,
    [input.itemId, input.organizationId]
  )
  const item = result.rows[0]
  if (!item) {
    throw new Error("Quoted product was not found.")
  }
  if (item.uid_kind !== "QUOTE") {
    if (item.lifecycle_status !== "P") {
      await client.query(
        `
          UPDATE catalog.items
          SET lifecycle_status = 'P', updated_by_user_id = $1,
            updated_at = now(), row_version = row_version + 1
          WHERE id = $2
        `,
        [input.actorUserId ?? null, input.itemId]
      )
    }
    return item.uid
  }

  const permanentUid = await nextInternalUid(client, input.organizationId)
  await client.query(
    `
      UPDATE catalog.items
      SET uid = $1, uid_kind = 'INTERNAL', lifecycle_status = 'P',
        converted_from_quote_uid = $2, updated_by_user_id = $3,
        updated_at = now(), row_version = row_version + 1
      WHERE id = $4
    `,
    [permanentUid, item.uid, input.actorUserId ?? null, input.itemId]
  )
  await client.query(
    `
      INSERT INTO catalog.item_aliases (
        organization_id, item_id, alias_type, alias, created_by_user_id,
        updated_by_user_id, source_system, source_table, source_id,
        source_payload
      )
      VALUES (
        $1, $2, 'QUOTE_UID', $3, $4, $4, 'mrm-dashboard',
        'quote_uid_conversion', $5, $6
      )
      ON CONFLICT (organization_id, alias_type, lower(alias)) DO NOTHING
    `,
    [
      input.organizationId,
      input.itemId,
      item.uid,
      input.actorUserId ?? null,
      randomUUID(),
      { permanentUid, quoteUid: item.uid },
    ]
  )
  return permanentUid
}

async function approveQuoteAndProduct(
  client: PoolClient,
  input: {
    actorUserId?: string | null
    organizationId: string
    quoteItemId: string
  }
) {
  const result = await client.query<{
    customer_id: string
    item_id: string
    price_lineage_key: string | null
  }>(
    `
      SELECT customer_id, item_id, price_lineage_key
      FROM sales.quote_items
      WHERE id = $1 AND organization_id = $2
      FOR UPDATE
    `,
    [input.quoteItemId, input.organizationId]
  )
  const quote = result.rows[0]
  if (!quote) {
    throw new Error("Historical quote was not found.")
  }

  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [
      [
        "pricing-active",
        input.organizationId,
        quote.customer_id,
        quote.price_lineage_key ?? "legacy-null",
      ].join(":"),
    ]
  )

  await client.query(
    `
      UPDATE sales.quote_items
      SET status = 'Superseded', is_active = false,
        superseded_by_quote_item_id = $1, updated_by_user_id = $2,
        updated_at = now(), row_version = row_version + 1
      WHERE organization_id = $3 AND customer_id = $4
        AND price_lineage_key IS NOT DISTINCT FROM $5
        AND is_active AND id <> $1
    `,
    [
      input.quoteItemId,
      input.actorUserId ?? null,
      input.organizationId,
      quote.customer_id,
      quote.price_lineage_key,
    ]
  )
  await client.query(
    `
      UPDATE sales.quote_items
      SET status = 'Accepted', is_active = true, ordered_at = now(),
        superseded_by_quote_item_id = NULL, updated_by_user_id = $1,
        updated_at = now(), row_version = row_version + 1
      WHERE id = $2
    `,
    [input.actorUserId ?? null, input.quoteItemId]
  )
  await convertQuotedItem(client, {
    actorUserId: input.actorUserId,
    itemId: quote.item_id,
    organizationId: input.organizationId,
  })

  const components = await client.query<{ item_id: string }>(
    `
      SELECT DISTINCT child_quote.item_id
      FROM sales.quote_product_snapshots snapshot
      JOIN sales.quote_package_components component
        ON component.quote_product_snapshot_id = snapshot.id
      JOIN sales.quote_items child_quote
        ON child_quote.id = component.child_quote_item_id
      WHERE snapshot.quote_item_id = $1
    `,
    [input.quoteItemId]
  )
  for (const component of components.rows) {
    await convertQuotedItem(client, {
      actorUserId: input.actorUserId,
      itemId: component.item_id,
      organizationId: input.organizationId,
    })
  }
}

export function createCommercialOrdersRepository({
  connectionString,
}: RepositoryOptions) {
  const pool = new Pool({ connectionString })

  return {
    async close() {
      await pool.end()
    },

    async createPurchaseOrder(input: {
      actorUserId?: string | null
      currencyCode?: string
      customerId: string
      fileId?: string | null
      notes?: string | null
      organizationId: string
      poDate: string
      poNumber: string
    }) {
      return transaction(pool, async (client) => {
        const poNumber = input.poNumber.trim()
        if (!poNumber) {
          throw new Error("PO number is required.")
        }
        const customer = await client.query(
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
        const sourceId = randomUUID()
        const created = await client.query<{
          id: string
          po_date: string
          po_number: string
          status: string
        }>(
          `
            INSERT INTO sales.purchase_orders (
              organization_id, customer_id, po_number, po_date, status,
              currency_code, file_id, notes, created_by_user_id,
              updated_by_user_id, source_system, source_table, source_id,
              source_payload
            )
            VALUES (
              $1, $2, $3, $4, 'Imported', $5, $6, $7, $8, $8,
              'mrm-dashboard', 'purchase_orders', $9, $10
            )
            RETURNING id, po_number, po_date, status
          `,
          [
            input.organizationId,
            input.customerId,
            poNumber,
            input.poDate,
            input.currencyCode ?? "USD",
            input.fileId ?? null,
            input.notes ?? null,
            input.actorUserId ?? null,
            sourceId,
            input,
          ]
        )
        const row = created.rows[0]!
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "purchase_order.created",
          metadata: { poNumber },
          organizationId: input.organizationId,
          targetId: row.id,
          targetTable: "purchase_orders",
        })
        return {
          id: row.id,
          poDate: row.po_date,
          poNumber: row.po_number,
          status: row.status,
        }
      })
    },

    async addPurchaseOrderLine(input: {
      actorUserId?: string | null
      currencyCode?: string
      customerPartCode: string
      description?: string | null
      lineNumber: number
      poPrice: number
      purchaseOrderId: string
      quantity: number
    }) {
      return transaction(pool, async (client) => {
        const order = await client.query<{
          customer_id: string
          organization_id: string
          status: string
        }>(
          `
            SELECT organization_id, customer_id, status
            FROM sales.purchase_orders
            WHERE id = $1
            FOR UPDATE
          `,
          [input.purchaseOrderId]
        )
        const purchaseOrder = order.rows[0]
        if (!purchaseOrder) {
          throw new Error("Purchase order was not found.")
        }
        if (["Approved", "Cancelled"].includes(purchaseOrder.status)) {
          throw new Error("This purchase order is closed.")
        }
        if (input.lineNumber <= 0 || input.quantity <= 0 || input.poPrice < 0) {
          throw new Error("PO line number, quantity, or price is invalid.")
        }
        const code = input.customerPartCode.trim()
        if (!code) {
          throw new Error("Customer part code is required.")
        }
        const match = await findQuoteMatch(client, {
          customerId: purchaseOrder.customer_id,
          customerPartCode: code,
          organizationId: purchaseOrder.organization_id,
        })
        const quote = match.quote
        const systemPrice = quote
          ? asNumber(
              quote.approved_price_usd,
              asNumber(quote.rate_usd, asNumber(quote.unit_price))
            )
          : null
        const difference =
          systemPrice === null ? null : input.poPrice - systemPrice
        const matchesPrice =
          difference !== null && Math.abs(difference) < 0.0001
        const matchStatus = quote
          ? matchesPrice
            ? "Matched"
            : "Difference"
          : "Unmatched"
        const decision = matchesPrice ? "Matched" : "Pending"
        const sourceId = randomUUID()
        const created = await client.query<PurchaseOrderLineRow>(
          `
            INSERT INTO sales.purchase_order_lines (
              organization_id, purchase_order_id, line_number,
              customer_part_code, description, quantity, unit_price,
              currency_code, quote_item_id, matched_item_id, match_status,
              match_evidence, system_price, price_difference, decision,
              pi_price, system_quote_revision, system_scrap_rate,
              system_purchase_times, system_profit_percent,
              system_shipping_terms, system_packaging, created_by_user_id,
              updated_by_user_id, source_system, source_table, source_id,
              source_payload
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
              $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
              $23, 'mrm-dashboard', 'purchase_order_lines', $24, $25
            )
            RETURNING *
          `,
          [
            purchaseOrder.organization_id,
            input.purchaseOrderId,
            input.lineNumber,
            code,
            input.description ?? null,
            input.quantity,
            input.poPrice,
            input.currencyCode ?? "USD",
            quote?.id ?? null,
            quote?.item_id ?? null,
            matchStatus,
            match.evidence,
            systemPrice,
            difference,
            decision,
            matchesPrice ? systemPrice : null,
            quote?.revision ?? null,
            quote ? asNumber(quote.scrap_rate) : null,
            quote ? asNumber(quote.purchase_times, 1) : null,
            quote ? asNumber(quote.profit_percent) : null,
            quote?.shipping_terms ?? null,
            quote?.packaging ?? null,
            input.actorUserId ?? null,
            sourceId,
            input,
          ]
        )
        await client.query(
          `
            UPDATE sales.purchase_orders
            SET total_amount = (
              SELECT COALESCE(sum(quantity * unit_price), 0)
              FROM sales.purchase_order_lines
              WHERE purchase_order_id = $1
            ), updated_by_user_id = $2, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $1
          `,
          [input.purchaseOrderId, input.actorUserId ?? null]
        )
        const row = created.rows[0]!
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "purchase_order_line.imported",
          metadata: { decision, matchStatus },
          organizationId: purchaseOrder.organization_id,
          targetId: row.id,
          targetTable: "purchase_order_lines",
        })
        return mapPurchaseOrderLine(row)
      })
    },

    async importPurchaseOrderLines(input: {
      actorUserId?: string | null
      purchaseOrderId: string
      rows: Array<{
        currencyCode?: string
        customerPartCode: string
        description?: string | null
        lineNumber: number
        poPrice: number
        quantity: number
      }>
    }) {
      if (input.rows.length === 0) {
        throw new Error("The PO import does not contain any lines.")
      }
      if (
        input.rows.some(
          (row) =>
            !row.customerPartCode.trim() ||
            row.lineNumber <= 0 ||
            row.quantity <= 0 ||
            row.poPrice < 0
        )
      ) {
        throw new Error(
          "Every PO row requires a part code, line, quantity, and price."
        )
      }
      if (
        new Set(input.rows.map((row) => row.lineNumber)).size !==
        input.rows.length
      ) {
        throw new Error("PO line numbers must be unique.")
      }

      return transaction(pool, async (client) => {
        const order = await client.query<{
          customer_id: string
          organization_id: string
          status: string
        }>(
          `
            SELECT organization_id, customer_id, status
            FROM sales.purchase_orders
            WHERE id = $1
            FOR UPDATE
          `,
          [input.purchaseOrderId]
        )
        const purchaseOrder = order.rows[0]
        if (!purchaseOrder) {
          throw new Error("Purchase order was not found.")
        }
        if (["Approved", "Cancelled"].includes(purchaseOrder.status)) {
          throw new Error("This purchase order is closed.")
        }

        const inserted = []
        for (const row of input.rows) {
          const match = await findQuoteMatch(client, {
            customerId: purchaseOrder.customer_id,
            customerPartCode: row.customerPartCode,
            organizationId: purchaseOrder.organization_id,
          })
          const quote = match.quote
          const systemPrice = quote
            ? asNumber(
                quote.approved_price_usd,
                asNumber(quote.rate_usd, asNumber(quote.unit_price))
              )
            : null
          const difference =
            systemPrice === null ? null : row.poPrice - systemPrice
          const matchesPrice =
            difference !== null && Math.abs(difference) < 0.0001
          const matchStatus = quote
            ? matchesPrice
              ? "Matched"
              : "Difference"
            : "Unmatched"
          const decision = matchesPrice ? "Matched" : "Pending"
          const created = await client.query<PurchaseOrderLineRow>(
            `
              INSERT INTO sales.purchase_order_lines (
                organization_id, purchase_order_id, line_number,
                customer_part_code, description, quantity, unit_price,
                currency_code, quote_item_id, matched_item_id, match_status,
                match_evidence, system_price, price_difference, decision,
                pi_price, system_quote_revision, system_scrap_rate,
                system_purchase_times, system_profit_percent,
                system_shipping_terms, system_packaging, created_by_user_id,
                updated_by_user_id, source_system, source_table, source_id,
                source_payload
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
                $23, 'mrm-dashboard', 'purchase_order_lines', $24, $25
              )
              RETURNING *
            `,
            [
              purchaseOrder.organization_id,
              input.purchaseOrderId,
              row.lineNumber,
              row.customerPartCode.trim(),
              row.description ?? null,
              row.quantity,
              row.poPrice,
              row.currencyCode ?? "USD",
              quote?.id ?? null,
              quote?.item_id ?? null,
              matchStatus,
              match.evidence,
              systemPrice,
              difference,
              decision,
              matchesPrice ? systemPrice : null,
              quote?.revision ?? null,
              quote ? asNumber(quote.scrap_rate) : null,
              quote ? asNumber(quote.purchase_times, 1) : null,
              quote ? asNumber(quote.profit_percent) : null,
              quote?.shipping_terms ?? null,
              quote?.packaging ?? null,
              input.actorUserId ?? null,
              randomUUID(),
              row,
            ]
          )
          inserted.push(mapPurchaseOrderLine(created.rows[0]!))
        }
        await client.query(
          `
            UPDATE sales.purchase_orders
            SET total_amount = (
              SELECT COALESCE(sum(quantity * unit_price), 0)
              FROM sales.purchase_order_lines
              WHERE purchase_order_id = $1
            ), updated_by_user_id = $2, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $1
          `,
          [input.purchaseOrderId, input.actorUserId ?? null]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "purchase_order.imported",
          metadata: { lineCount: inserted.length },
          organizationId: purchaseOrder.organization_id,
          targetId: input.purchaseOrderId,
          targetTable: "purchase_orders",
        })
        return inserted
      })
    },

    async decidePurchaseOrderLinePrice(input: {
      actorUserId?: string | null
      comment?: string | null
      decision: PriceDecision
      purchaseOrderLineId: string
    }) {
      return transaction(pool, async (client) => {
        const line = await getPurchaseOrderLine(
          client,
          input.purchaseOrderLineId,
          true
        )
        const order = await client.query<{
          organization_id: string
          status: string
        }>(
          "SELECT organization_id, status FROM sales.purchase_orders WHERE id = $1 FOR UPDATE",
          [line.purchase_order_id]
        )
        const purchaseOrder = order.rows[0]!
        if (["Approved", "Cancelled"].includes(purchaseOrder.status)) {
          throw new Error("This purchase order is closed.")
        }
        if (!line.quote_item_id || !line.matched_item_id) {
          throw new Error("A matched quote is required before deciding price.")
        }
        if (input.decision === "Accept PO Price") {
          await client.query(
            `
              INSERT INTO sales.quote_revision_requests (
                organization_id, purchase_order_line_id, quote_item_id,
                item_id, requested_price, currency_code, status,
                created_by_user_id, updated_by_user_id, source_system,
                source_table, source_id, source_payload
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, 'Open', $7, $7,
                'mrm-dashboard', 'quote_revision_requests', $8, $9
              )
              ON CONFLICT (purchase_order_line_id) WHERE status = 'Open'
              DO UPDATE SET requested_price = EXCLUDED.requested_price,
                updated_by_user_id = EXCLUDED.updated_by_user_id,
                updated_at = now(), row_version =
                  sales.quote_revision_requests.row_version + 1,
                source_payload = EXCLUDED.source_payload
            `,
            [
              purchaseOrder.organization_id,
              line.id,
              line.quote_item_id,
              line.matched_item_id,
              asNumber(line.unit_price),
              line.currency_code,
              input.actorUserId ?? null,
              randomUUID(),
              input,
            ]
          )
        } else {
          await client.query(
            `
              UPDATE sales.quote_revision_requests
              SET status = 'Cancelled', resolution_comment = $1,
                resolved_at = now(), updated_by_user_id = $2,
                updated_at = now(), row_version = row_version + 1
              WHERE purchase_order_line_id = $3 AND status = 'Open'
            `,
            [
              input.comment ?? "Customer accepted our quoted price.",
              input.actorUserId ?? null,
              line.id,
            ]
          )
        }
        const updated = await client.query<PurchaseOrderLineRow>(
          `
            UPDATE sales.purchase_order_lines
            SET decision = $1, decision_comment = $2, match_status = $3,
              pi_price = $4, updated_by_user_id = $5, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $6
            RETURNING *
          `,
          [
            input.decision,
            input.comment ?? null,
            input.decision === "Accept PO Price"
              ? "Pending Costing Revision"
              : "Difference",
            input.decision === "Keep Our Price" ? line.system_price : null,
            input.actorUserId ?? null,
            line.id,
          ]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "purchase_order_line.price_decided",
          metadata: { decision: input.decision },
          organizationId: purchaseOrder.organization_id,
          targetId: line.id,
          targetTable: "purchase_order_lines",
        })
        return mapPurchaseOrderLine(updated.rows[0]!)
      })
    },

    async createQuoteRequestFromPurchaseOrderLine(input: {
      actorUserId?: string | null
      purchaseOrderLineId: string
    }) {
      return transaction(pool, async (client) => {
        const line = await getPurchaseOrderLine(
          client,
          input.purchaseOrderLineId,
          true
        )
        if (
          !["Unmatched", "Ambiguous", "Quote Required"].includes(
            line.match_status
          )
        ) {
          throw new Error(
            "Only an unmatched PO line can create a quote request."
          )
        }
        const orderResult = await client.query<{
          customer_id: string
          organization_id: string
          po_date: string
          po_number: string
          quote_enquiry_id: string | null
          status: string
        }>(
          `
            SELECT organization_id, customer_id, po_number, po_date, status,
              quote_enquiry_id
            FROM sales.purchase_orders
            WHERE id = $1
            FOR UPDATE
          `,
          [line.purchase_order_id]
        )
        const order = orderResult.rows[0]!
        if (["Approved", "Cancelled"].includes(order.status)) {
          throw new Error("This purchase order is closed.")
        }

        let enquiryId = order.quote_enquiry_id
        if (!enquiryId) {
          const now = new Date()
          const year = now.getFullYear().toString().slice(-2)
          const month = (now.getMonth() + 1).toString().padStart(2, "0")
          const key = `ENQ_${year}${month}`
          const sequence = await client.query<{ current_value: string }>(
            `
              INSERT INTO core.number_sequences (
                organization_id, key, current_value, source_system,
                source_table, source_id
              )
              VALUES ($1, $2, 1, 'mrm-dashboard', 'enquiries', $2)
              ON CONFLICT (organization_id, key) DO UPDATE SET
                current_value = core.number_sequences.current_value + 1,
                updated_at = now()
              RETURNING current_value::text
            `,
            [order.organization_id, key]
          )
          const enquiryNumber = `ENQ-${year}${month}-${Number(
            sequence.rows[0]!.current_value
          )
            .toString()
            .padStart(3, "0")}`
          const created = await client.query<{ id: string }>(
            `
              INSERT INTO sales.enquiries (
                organization_id, enquiry_number, customer_id, received_on,
                status, subject, customer_reference, source,
                technical_handover_status, created_by_user_id,
                updated_by_user_id, source_system, source_table, source_id,
                source_payload
              )
              VALUES (
                $1, $2, $3, $4, 'Logged', $5, $6, 'Purchase Order',
                'Draft', $7, $7, 'mrm-dashboard', 'po_quote_enquiries',
                $8, $9
              )
              RETURNING id
            `,
            [
              order.organization_id,
              enquiryNumber,
              order.customer_id,
              order.po_date,
              `Quote request for PO ${order.po_number}`,
              order.po_number,
              input.actorUserId ?? null,
              randomUUID(),
              { purchaseOrderId: line.purchase_order_id },
            ]
          )
          enquiryId = created.rows[0]!.id
          await client.query(
            "UPDATE sales.purchase_orders SET quote_enquiry_id = $1 WHERE id = $2",
            [enquiryId, line.purchase_order_id]
          )
        }

        const existing = await client.query<{ id: string }>(
          `
            SELECT id
            FROM sales.enquiry_items
            WHERE source_system = 'mrm-dashboard'
              AND source_table = 'po_quote_request_lines'
              AND source_id = $1
          `,
          [line.id]
        )
        let enquiryItemId = existing.rows[0]?.id
        if (!enquiryItemId) {
          const nextLine = await client.query<{ line_number: number }>(
            `
              SELECT COALESCE(max(line_number), 0)::integer + 1 AS line_number
              FROM sales.enquiry_items
              WHERE enquiry_id = $1
            `,
            [enquiryId]
          )
          const created = await client.query<{ id: string }>(
            `
              INSERT INTO sales.enquiry_items (
                organization_id, enquiry_id, line_number, customer_part_code,
                description, quantity, target_price, status,
                technical_review_status, created_by_user_id,
                updated_by_user_id, source_system, source_table, source_id,
                source_payload
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, 'Open', 'Pending Review',
                $8, $8, 'mrm-dashboard', 'po_quote_request_lines', $9, $10
              )
              RETURNING id
            `,
            [
              order.organization_id,
              enquiryId,
              nextLine.rows[0]!.line_number,
              line.customer_part_code,
              line.description ?? line.customer_part_code,
              line.quantity,
              line.unit_price,
              input.actorUserId ?? null,
              line.id,
              { purchaseOrderLineId: line.id },
            ]
          )
          enquiryItemId = created.rows[0]!.id
        }
        await client.query(
          `
            UPDATE sales.purchase_order_lines
            SET match_status = 'Quote Required', decision = 'Pending',
              updated_by_user_id = $1, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $2
          `,
          [input.actorUserId ?? null, line.id]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "purchase_order_line.quote_requested",
          metadata: { enquiryId, enquiryItemId },
          organizationId: order.organization_id,
          targetId: line.id,
          targetTable: "purchase_order_lines",
        })
        return { enquiryId, enquiryItemId, purchaseOrderLineId: line.id }
      })
    },

    async resolveQuoteRevisionRequest(input: {
      actorUserId?: string | null
      quoteRevisionRequestId: string
      replacementQuoteItemId: string
    }) {
      return transaction(pool, async (client) => {
        const request = await client.query<{
          organization_id: string
          purchase_order_line_id: string
          requested_price: string
          status: string
        }>(
          `
            SELECT organization_id, purchase_order_line_id, requested_price,
              status
            FROM sales.quote_revision_requests
            WHERE id = $1
            FOR UPDATE
          `,
          [input.quoteRevisionRequestId]
        )
        const revisionRequest = request.rows[0]
        if (!revisionRequest || revisionRequest.status !== "Open") {
          throw new Error("Open quote revision request was not found.")
        }
        const quoteResult = await client.query<QuoteMatchRow>(
          `
            SELECT quote.id, quote.item_id, quote.lineage_item_id,
              quote.customer_part_code, quote.revision, quote.unit_price,
              quote.rate_usd, quote.approved_price_usd, quote.scrap_rate,
              quote.purchase_times, quote.profit_percent,
              quote.shipping_terms, quote.packaging, item.uid AS item_uid
            FROM sales.quote_items quote
            JOIN catalog.items item ON item.id = quote.item_id
            WHERE quote.id = $1 AND quote.organization_id = $2
              AND quote.status IN ('Sent', 'Accepted')
            FOR UPDATE
          `,
          [input.replacementQuoteItemId, revisionRequest.organization_id]
        )
        const quote = quoteResult.rows[0]
        if (!quote) {
          throw new Error("A sent replacement quote is required.")
        }
        const systemPrice = asNumber(
          quote.approved_price_usd,
          asNumber(quote.rate_usd, asNumber(quote.unit_price))
        )
        if (
          Math.abs(systemPrice - asNumber(revisionRequest.requested_price)) >=
          0.0001
        ) {
          throw new Error(
            "Replacement quote price must equal the accepted PO price."
          )
        }
        const updated = await client.query<PurchaseOrderLineRow>(
          `
            UPDATE sales.purchase_order_lines
            SET quote_item_id = $1, matched_item_id = $2,
              match_status = 'Matched', decision = 'Matched',
              system_price = $3, price_difference = 0, pi_price = $3,
              system_quote_revision = $4, system_scrap_rate = $5,
              system_purchase_times = $6, system_profit_percent = $7,
              system_shipping_terms = $8, system_packaging = $9,
              updated_by_user_id = $10, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $11
            RETURNING *
          `,
          [
            quote.id,
            quote.item_id,
            systemPrice,
            quote.revision,
            quote.scrap_rate,
            quote.purchase_times,
            quote.profit_percent,
            quote.shipping_terms,
            quote.packaging,
            input.actorUserId ?? null,
            revisionRequest.purchase_order_line_id,
          ]
        )
        await client.query(
          `
            UPDATE sales.quote_revision_requests
            SET status = 'Resolved', resolved_quote_item_id = $1,
              resolved_at = now(), resolution_comment = $2,
              updated_by_user_id = $3, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $4
          `,
          [
            quote.id,
            "Replacement quote matches the accepted PO price.",
            input.actorUserId ?? null,
            input.quoteRevisionRequestId,
          ]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "quote_revision_request.resolved",
          metadata: { replacementQuoteItemId: quote.id },
          organizationId: revisionRequest.organization_id,
          targetId: input.quoteRevisionRequestId,
          targetTable: "quote_revision_requests",
        })
        return mapPurchaseOrderLine(updated.rows[0]!)
      })
    },

    async generateProformaInvoice(input: {
      actorUserId?: string | null
      invoiceDate?: string
      purchaseOrderId: string
    }) {
      return transaction(pool, async (client) => {
        const orderResult = await client.query<{
          organization_id: string
          po_date: string
          po_number: string
          status: string
        }>(
          `
            SELECT organization_id, po_number, po_date, status
            FROM sales.purchase_orders
            WHERE id = $1
            FOR UPDATE
          `,
          [input.purchaseOrderId]
        )
        const order = orderResult.rows[0]
        if (!order) {
          throw new Error("Purchase order was not found.")
        }
        if (["Approved", "Cancelled"].includes(order.status)) {
          throw new Error("This purchase order is closed.")
        }
        const existing = await client.query<ProformaInvoiceRow>(
          `
            SELECT *
            FROM sales.proforma_invoices
            WHERE purchase_order_id = $1
              AND status IN ('Draft', 'Sent')
            ORDER BY revision DESC
            LIMIT 1
            FOR UPDATE
          `,
          [input.purchaseOrderId]
        )
        if (existing.rows[0]) {
          return mapInvoice(existing.rows[0])
        }
        const lines = await client.query<PurchaseOrderLineRow>(
          `
            SELECT *
            FROM sales.purchase_order_lines
            WHERE purchase_order_id = $1
            ORDER BY line_number
            FOR UPDATE
          `,
          [input.purchaseOrderId]
        )
        if (
          lines.rows.length === 0 ||
          lines.rows.some(
            (line) =>
              !line.quote_item_id ||
              line.pi_price === null ||
              ["Unmatched", "Ambiguous", "Pending Costing Revision"].includes(
                line.match_status
              ) ||
              line.decision === "Pending"
          )
        ) {
          throw new Error(
            "Every purchase-order line must have completed matching and pricing before generating a PI."
          )
        }
        const revision = await client.query<{ revision: number }>(
          `
            SELECT COALESCE(max(revision), 0)::integer + 1 AS revision
            FROM sales.proforma_invoices
            WHERE organization_id = $1 AND invoice_number = $2
          `,
          [order.organization_id, order.po_number]
        )
        const totalAmount = lines.rows.reduce(
          (total, line) =>
            total + asNumber(line.quantity) * asNumber(line.pi_price),
          0
        )
        const sourceId = randomUUID()
        const created = await client.query<ProformaInvoiceRow>(
          `
            INSERT INTO sales.proforma_invoices (
              organization_id, purchase_order_id, invoice_number, revision,
              status, invoice_date, total_amount, created_by_user_id,
              updated_by_user_id, source_system, source_table, source_id,
              source_payload
            )
            VALUES (
              $1, $2, $3, $4, 'Draft', $5, $6, $7, $7,
              'mrm-dashboard', 'proforma_invoices', $8, $9
            )
            RETURNING *
          `,
          [
            order.organization_id,
            input.purchaseOrderId,
            order.po_number,
            revision.rows[0]!.revision,
            input.invoiceDate ?? order.po_date,
            totalAmount,
            input.actorUserId ?? null,
            sourceId,
            input,
          ]
        )
        const invoice = created.rows[0]!
        for (const line of lines.rows) {
          const lineAmount = asNumber(line.quantity) * asNumber(line.pi_price)
          await client.query(
            `
              INSERT INTO sales.proforma_invoice_lines (
                organization_id, proforma_invoice_id,
                purchase_order_line_id, quote_item_id, line_number,
                quantity, unit_price, line_amount, created_by_user_id,
                source_system, source_table, source_id, source_payload
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                'mrm-dashboard', 'proforma_invoice_lines', $10, $11
              )
            `,
            [
              order.organization_id,
              invoice.id,
              line.id,
              line.quote_item_id,
              line.line_number,
              line.quantity,
              line.pi_price,
              lineAmount,
              input.actorUserId ?? null,
              randomUUID(),
              {
                customerPartCode: line.customer_part_code,
                historicalQuoteItemId: line.quote_item_id,
              },
            ]
          )
        }
        await client.query(
          `
            UPDATE sales.purchase_orders
            SET status = 'PI Draft', updated_by_user_id = $1,
              updated_at = now(), row_version = row_version + 1
            WHERE id = $2
          `,
          [input.actorUserId ?? null, input.purchaseOrderId]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "proforma_invoice.generated",
          metadata: { revision: invoice.revision, totalAmount },
          organizationId: order.organization_id,
          targetId: invoice.id,
          targetTable: "proforma_invoices",
        })
        return mapInvoice(invoice)
      })
    },

    async markProformaInvoiceSent(input: {
      actorUserId?: string | null
      proformaInvoiceId: string
    }) {
      return transaction(pool, async (client) => {
        const invoice = await client.query<
          ProformaInvoiceRow & { organization_id: string }
        >(
          `
            SELECT *
            FROM sales.proforma_invoices
            WHERE id = $1
            FOR UPDATE
          `,
          [input.proformaInvoiceId]
        )
        const row = invoice.rows[0]
        if (!row) {
          throw new Error("Proforma invoice was not found.")
        }
        if (row.status !== "Draft") {
          throw new Error("Only a draft PI can be marked sent.")
        }
        const updated = await client.query<ProformaInvoiceRow>(
          `
            UPDATE sales.proforma_invoices
            SET status = 'Sent', sent_at = now(), sent_by_user_id = $1,
              updated_by_user_id = $1, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $2
            RETURNING *
          `,
          [input.actorUserId ?? null, input.proformaInvoiceId]
        )
        await client.query(
          `
            UPDATE sales.purchase_orders
            SET status = 'PI Sent', updated_by_user_id = $1,
              updated_at = now(), row_version = row_version + 1
            WHERE id = $2
          `,
          [input.actorUserId ?? null, row.purchase_order_id]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "proforma_invoice.sent",
          organizationId: row.organization_id,
          targetId: row.id,
          targetTable: "proforma_invoices",
        })
        return mapInvoice(updated.rows[0]!)
      })
    },

    async approveProformaInvoice(input: {
      actorUserId?: string | null
      proformaInvoiceId: string
    }) {
      return transaction(pool, async (client) => {
        const result = await client.query<
          ProformaInvoiceRow & { organization_id: string }
        >(
          `
            SELECT *
            FROM sales.proforma_invoices
            WHERE id = $1
            FOR UPDATE
          `,
          [input.proformaInvoiceId]
        )
        const invoice = result.rows[0]
        if (!invoice) {
          throw new Error("Proforma invoice was not found.")
        }
        if (invoice.status !== "Sent") {
          throw new Error("Only a sent PI can be approved.")
        }
        const lines = await client.query<{ quote_item_id: string }>(
          `
            SELECT quote_item_id
            FROM sales.proforma_invoice_lines
            WHERE proforma_invoice_id = $1
            ORDER BY line_number
            FOR UPDATE
          `,
          [invoice.id]
        )
        if (lines.rows.length === 0) {
          throw new Error("The PI has no historical quote lines.")
        }
        for (const line of lines.rows) {
          await approveQuoteAndProduct(client, {
            actorUserId: input.actorUserId,
            organizationId: invoice.organization_id,
            quoteItemId: line.quote_item_id,
          })
        }
        const approved = await client.query<ProformaInvoiceRow>(
          `
            UPDATE sales.proforma_invoices
            SET status = 'Approved', approved_at = now(),
              approved_by_user_id = $1, updated_by_user_id = $1,
              updated_at = now(), row_version = row_version + 1
            WHERE id = $2
            RETURNING *
          `,
          [input.actorUserId ?? null, invoice.id]
        )
        await client.query(
          `
            UPDATE sales.purchase_orders
            SET status = 'Approved', updated_by_user_id = $1,
              updated_at = now(), row_version = row_version + 1
            WHERE id = $2
          `,
          [input.actorUserId ?? null, invoice.purchase_order_id]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "proforma_invoice.approved",
          metadata: { quoteCount: lines.rows.length },
          organizationId: invoice.organization_id,
          targetId: invoice.id,
          targetTable: "proforma_invoices",
        })
        return mapInvoice(approved.rows[0]!)
      })
    },

    async cancelPurchaseOrder(input: {
      actorUserId?: string | null
      purchaseOrderId: string
      reason?: string | null
    }) {
      return transaction(pool, async (client) => {
        const result = await client.query<{
          organization_id: string
          status: string
        }>(
          `
            SELECT organization_id, status
            FROM sales.purchase_orders
            WHERE id = $1
            FOR UPDATE
          `,
          [input.purchaseOrderId]
        )
        const order = result.rows[0]
        if (!order) {
          throw new Error("Purchase order was not found.")
        }
        if (order.status === "Approved") {
          throw new Error("An approved purchase order cannot be cancelled.")
        }
        if (order.status === "Cancelled") {
          throw new Error("This purchase order is already cancelled.")
        }
        await client.query(
          `
            UPDATE sales.purchase_orders
            SET status = 'Cancelled', cancellation_reason = $1,
              updated_by_user_id = $2, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $3
          `,
          [
            asTrimmed(input.reason) || "Cancelled by user.",
            input.actorUserId ?? null,
            input.purchaseOrderId,
          ]
        )
        await client.query(
          `
            UPDATE sales.proforma_invoices
            SET status = 'Cancelled', cancellation_reason = $1,
              updated_by_user_id = $2, updated_at = now(),
              row_version = row_version + 1
            WHERE purchase_order_id = $3 AND status IN ('Draft', 'Sent')
          `,
          [
            asTrimmed(input.reason) || "Purchase order cancelled.",
            input.actorUserId ?? null,
            input.purchaseOrderId,
          ]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "purchase_order.cancelled",
          metadata: { reason: input.reason ?? null },
          organizationId: order.organization_id,
          targetId: input.purchaseOrderId,
          targetTable: "purchase_orders",
        })
        return { id: input.purchaseOrderId, status: "Cancelled" }
      })
    },

    async getPurchaseOrder(purchaseOrderId: string) {
      const order = await pool.query<{
        cancellation_reason: string | null
        company_name: string
        id: string
        po_date: string
        po_number: string
        status: string
        total_amount: string
      }>(
        `
          SELECT purchase_order.id, purchase_order.po_number,
            purchase_order.po_date, purchase_order.status,
            purchase_order.total_amount, purchase_order.cancellation_reason,
            customer.company_name
          FROM sales.purchase_orders purchase_order
          JOIN sales.customers customer
            ON customer.id = purchase_order.customer_id
          WHERE purchase_order.id = $1
        `,
        [purchaseOrderId]
      )
      if (!order.rows[0]) {
        throw new Error("Purchase order was not found.")
      }
      const lines = await pool.query<PurchaseOrderLineRow>(
        `
          SELECT *
          FROM sales.purchase_order_lines
          WHERE purchase_order_id = $1
          ORDER BY line_number
        `,
        [purchaseOrderId]
      )
      const invoices = await pool.query<ProformaInvoiceRow>(
        `
          SELECT *
          FROM sales.proforma_invoices
          WHERE purchase_order_id = $1
          ORDER BY revision DESC
        `,
        [purchaseOrderId]
      )
      const row = order.rows[0]
      return {
        cancellationReason: row.cancellation_reason,
        companyName: row.company_name,
        id: row.id,
        invoices: invoices.rows.map(mapInvoice),
        lines: lines.rows.map(mapPurchaseOrderLine),
        poDate: asDateText(row.po_date as string | Date),
        poNumber: row.po_number,
        status: row.status,
        totalAmount: asNumber(row.total_amount),
      }
    },

    async listPurchaseOrders(organizationCode: string) {
      const result = await pool.query<{
        company_name: string
        id: string
        line_count: string
        po_date: string
        po_number: string
        status: string
        total_amount: string
      }>(
        `
          SELECT purchase_order.id, purchase_order.po_number,
            purchase_order.po_date, purchase_order.status,
            purchase_order.total_amount, customer.company_name,
            count(line.id)::text AS line_count
          FROM sales.purchase_orders purchase_order
          JOIN core.organizations organization
            ON organization.id = purchase_order.organization_id
          JOIN sales.customers customer
            ON customer.id = purchase_order.customer_id
          LEFT JOIN sales.purchase_order_lines line
            ON line.purchase_order_id = purchase_order.id
          WHERE lower(organization.code) = lower($1)
          GROUP BY purchase_order.id, customer.company_name
          ORDER BY purchase_order.po_date DESC, purchase_order.created_at DESC
        `,
        [organizationCode.trim()]
      )
      return result.rows.map((row) => ({
        companyName: row.company_name,
        id: row.id,
        lineCount: Number(row.line_count),
        poDate: asDateText(row.po_date as string | Date),
        poNumber: row.po_number,
        status: row.status,
        totalAmount: asNumber(row.total_amount),
      }))
    },
  }
}
