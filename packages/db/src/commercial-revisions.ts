import { randomUUID } from "node:crypto"

import { Pool, type PoolClient } from "pg"

type RepositoryOptions = {
  connectionString: string
}

type QuoteRow = {
  alloy_premium: string
  approved_price_usd: string
  assembled_part_inr: string
  calculation_json: Record<string, unknown>
  conversion_rate: string
  customer_id: string
  customer_part_code: string | null
  enquiry_id: string | null
  enquiry_item_id: string | null
  extrusion_cost: string
  forging_cost: string
  id: string
  item_id: string
  lineage_item_id: string
  overhead_cost_input: string
  packing_cost: string
  packaging: string | null
  price_lineage_key: string | null
  profit_percent: string
  purchase_times: string
  quantity: string
  quote_number: string
  quote_type: string
  rate_inr: string
  rate_usd: string
  revision: number
  scrap_rate: string
  shipping_cost: string
  shipping_terms: string | null
  snapshot_calculation_json: Record<string, unknown>
  snapshot_id: string
  snapshot_product_json: Record<string, unknown>
  total_rate_inr: string
}

type ComponentRow = {
  child_quote_item_id: string | null
  component_item_id: string | null
  component_uid: string
  description: string | null
  extended_cost: string
  id: string
  quantity: string
  sequence: number
  unit_cost: string
}

type QuoteOverride = {
  fieldName: string
  value: number
}

type RevisedQuote = {
  newPrice: number
  replacementQuoteItemId: string
}

const fieldLabels: Record<string, string> = {
  alloy_premium: "Alloy premium",
  extrusion_cost: "Extrusion cost",
  forging_cost: "Forging cost",
  overhead_cost_input: "Overhead cost",
  packing_cost: "Packing cost",
  profit_percent: "Profit percent",
  purchase_times: "Purchase multiplier",
  scrap_rate: "Scrap rate",
  shipping_cost: "Shipping cost",
}

const productFields = new Set([
  "alloy_premium",
  "extrusion_cost",
  "forging_cost",
])

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const asText = (value: unknown) =>
  typeof value === "string" ? value.trim() : ""

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
    afterState?: Record<string, unknown> | null
    beforeState?: Record<string, unknown> | null
    eventType: string
    metadata?: Record<string, unknown>
    organizationId: string
    reason?: string | null
    targetId: string
    targetSchema?: string
    targetTable: string
  }
) {
  await client.query(
    `
      INSERT INTO audit.events (
        organization_id, event_type, target_schema, target_table, target_id,
        actor_user_id, reason, before_state, after_state, metadata,
        source_system, source_table, source_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'mrm-dashboard',
        'commercial_revision_events', $11
      )
    `,
    [
      input.organizationId,
      input.eventType,
      input.targetSchema ?? "sales",
      input.targetTable,
      input.targetId,
      input.actorUserId ?? null,
      input.reason ?? null,
      input.beforeState ?? null,
      input.afterState ?? null,
      input.metadata ?? {},
      randomUUID(),
    ]
  )
}

async function getQuote(client: PoolClient, quoteItemId: string, lock = false) {
  const result = await client.query<QuoteRow>(
    `
      SELECT quote.id, quote.quote_number, quote.revision,
        quote.enquiry_id, quote.enquiry_item_id, quote.customer_id,
        quote.item_id, quote.lineage_item_id, quote.customer_part_code,
        quote.quantity, quote.quote_type, quote.packaging,
        quote.shipping_terms, quote.scrap_rate, quote.alloy_premium,
        quote.extrusion_cost, quote.forging_cost, quote.packing_cost,
        quote.shipping_cost, quote.overhead_cost_input, quote.purchase_times,
        quote.profit_percent, quote.conversion_rate,
        quote.assembled_part_inr, quote.rate_inr, quote.total_rate_inr,
        quote.rate_usd, quote.approved_price_usd, quote.calculation_json,
        quote.price_lineage_key, snapshot.id AS snapshot_id,
        snapshot.product_snapshot AS snapshot_product_json,
        snapshot.calculation_json AS snapshot_calculation_json
      FROM sales.quote_items quote
      JOIN sales.quote_product_snapshots snapshot
        ON snapshot.quote_item_id = quote.id
      WHERE quote.id = $1
      ${lock ? "FOR UPDATE OF quote" : ""}
    `,
    [quoteItemId]
  )
  if (!result.rows[0]) {
    throw new Error("Quote revision source was not found.")
  }
  return result.rows[0]
}

async function getComponents(client: PoolClient, quoteItemId: string) {
  const result = await client.query<ComponentRow>(
    `
      SELECT component.id, component.component_item_id,
        component.component_uid, component.description, component.quantity,
        component.unit_cost, component.extended_cost, component.sequence,
        component.child_quote_item_id
      FROM sales.quote_product_snapshots snapshot
      JOIN sales.quote_package_components component
        ON component.quote_product_snapshot_id = snapshot.id
      WHERE snapshot.quote_item_id = $1
      ORDER BY component.sequence, component.created_at, component.id
    `,
    [quoteItemId]
  )
  return result.rows
}

async function activeParentQuoteIds(
  client: PoolClient,
  childQuoteItemId: string
) {
  const result = await client.query<{ id: string }>(
    `
      SELECT DISTINCT parent.id
      FROM sales.quote_package_components component
      JOIN sales.quote_product_snapshots snapshot
        ON snapshot.id = component.quote_product_snapshot_id
      JOIN sales.quote_items parent ON parent.id = snapshot.quote_item_id
      WHERE component.child_quote_item_id = $1
        AND parent.is_active
        AND parent.status IN ('Sent', 'Accepted')
    `,
    [childQuoteItemId]
  )
  return result.rows.map((row) => row.id)
}

async function collectQuoteAncestors(
  client: PoolClient,
  selectedQuoteIds: string[]
) {
  const all = new Set(selectedQuoteIds)
  const queue = [...selectedQuoteIds]
  while (queue.length) {
    const child = queue.shift()!
    for (const parent of await activeParentQuoteIds(client, child)) {
      if (!all.has(parent)) {
        all.add(parent)
        queue.push(parent)
      }
    }
  }
  return all
}

function revisedCalculation(
  quote: QuoteRow,
  components: ComponentRow[],
  revisedChildren: Map<string, RevisedQuote>,
  override?: QuoteOverride
) {
  const oldPrice = asNumber(quote.approved_price_usd, asNumber(quote.rate_usd))
  const conversionRate = asNumber(quote.conversion_rate, 1)
  const oldProfit = asNumber(quote.profit_percent)
  const profit =
    override?.fieldName === "profit_percent" ? override.value : oldProfit
  const calculation = { ...quote.calculation_json }

  if (components.length) {
    const childQuoteTotal = components.reduce((total, component) => {
      const revised = component.child_quote_item_id
        ? revisedChildren.get(component.child_quote_item_id)
        : undefined
      const unitCost = revised
        ? revised.newPrice * conversionRate
        : asNumber(component.unit_cost)
      return total + asNumber(component.quantity, 1) * unitCost
    }, 0)
    const processBase = asNumber(
      quote.calculation_json.packageProcessCostPerPiece,
      asNumber(quote.calculation_json.totalA)
    )
    const rejectionPercent = asNumber(
      quote.snapshot_product_json.rejectionPercent
    )
    const profitB = processBase * profit
    const packageBeforeRejection = childQuoteTotal + processBase + profitB
    const rejectionCost = packageBeforeRejection * rejectionPercent
    const totalRateInr = packageBeforeRejection + rejectionCost
    return {
      calculation: {
        ...calculation,
        childQuoteTotal,
        packageBeforeRejection,
        profitB,
        rejectionCost,
        totalA: processBase,
        totalAPlusB: processBase + profitB,
        totalRateInr,
        totalRodsCost: childQuoteTotal,
      },
      profit,
      totalRateInr,
      totalRateUsd: conversionRate > 0 ? totalRateInr / conversionRate : 0,
    }
  }

  if (!override) {
    return {
      calculation,
      profit,
      totalRateInr: asNumber(quote.total_rate_inr),
      totalRateUsd: oldPrice,
    }
  }

  const oldTotalInr = asNumber(quote.total_rate_inr)
  if (override.fieldName === "profit_percent") {
    const totalA = asNumber(quote.calculation_json.totalA)
    const fixedAfterProfit = oldTotalInr - totalA * (1 + oldProfit)
    const profitB = totalA * override.value
    const totalRateInr = totalA + profitB + fixedAfterProfit
    return {
      calculation: {
        ...calculation,
        profitB,
        totalAPlusB: totalA + profitB,
        totalRateInr,
      },
      profit: override.value,
      totalRateInr,
      totalRateUsd: conversionRate > 0 ? totalRateInr / conversionRate : 0,
    }
  }

  const oldFieldValue = asNumber(quote[override.fieldName as keyof QuoteRow])
  const delta = override.value - oldFieldValue
  const totalRateInr = Math.max(0, oldTotalInr + delta)
  return {
    calculation: { ...calculation, totalRateInr },
    profit,
    totalRateInr,
    totalRateUsd: conversionRate > 0 ? totalRateInr / conversionRate : 0,
  }
}

async function createRevisedQuote(
  client: PoolClient,
  input: {
    actorUserId?: string | null
    affectedQuoteIds: Set<string>
    cache: Map<string, RevisedQuote>
    quoteItemId: string
    overrides: Map<string, QuoteOverride>
    sourceKind: "Bulk Revision" | "ECN"
    sourceRecordId: string
    visiting?: Set<string>
  }
): Promise<RevisedQuote> {
  const cached = input.cache.get(input.quoteItemId)
  if (cached) return cached
  const visiting = input.visiting ?? new Set<string>()
  if (visiting.has(input.quoteItemId)) {
    throw new Error("Quote package cycle detected during revision.")
  }
  visiting.add(input.quoteItemId)

  const quote = await getQuote(client, input.quoteItemId, true)
  const components = await getComponents(client, input.quoteItemId)
  const revisedChildren = new Map<string, RevisedQuote>()
  for (const component of components) {
    if (
      component.child_quote_item_id &&
      input.affectedQuoteIds.has(component.child_quote_item_id)
    ) {
      revisedChildren.set(
        component.child_quote_item_id,
        await createRevisedQuote(client, {
          ...input,
          quoteItemId: component.child_quote_item_id,
          visiting: new Set(visiting),
        })
      )
    }
  }

  const revised = revisedCalculation(
    quote,
    components,
    revisedChildren,
    input.overrides.get(input.quoteItemId)
  )
  const nextRevision = await client.query<{ revision: number }>(
    `
      SELECT COALESCE(max(revision), 0)::integer + 1 AS revision
      FROM sales.quote_items
      WHERE organization_id = (
        SELECT organization_id FROM sales.quote_items WHERE id = $1
      )
        AND quote_number = $2
    `,
    [quote.id, quote.quote_number]
  )
  const sourceId = randomUUID()
  const created = await client.query<{ id: string }>(
    `
      INSERT INTO sales.quote_items (
        organization_id, quote_number, revision, enquiry_id, enquiry_item_id,
        customer_id, item_id, lineage_item_id, customer_part_code, quantity,
        unit_price, currency_code, status, is_active, sent_at, quote_type,
        packaging, shipping_terms, scrap_rate, alloy_premium, extrusion_cost,
        forging_cost, packing_cost, shipping_cost, overhead_cost_input,
        purchase_times, profit_percent, conversion_rate, assembled_part_inr,
        rate_inr, total_rate_inr, rate_usd, approved_price_usd,
        calculation_json, price_lineage_key, created_by_user_id,
        updated_by_user_id, source_system, source_table, source_id,
        source_payload
      )
      SELECT
        organization_id, quote_number, $1, enquiry_id, enquiry_item_id,
        customer_id, item_id, lineage_item_id, customer_part_code, quantity,
        $2, currency_code, 'Draft', false, NULL, quote_type, packaging,
        shipping_terms,
        CASE WHEN $3 = 'scrap_rate' THEN $4 ELSE scrap_rate END,
        CASE WHEN $3 = 'alloy_premium' THEN $4 ELSE alloy_premium END,
        CASE WHEN $3 = 'extrusion_cost' THEN $4 ELSE extrusion_cost END,
        CASE WHEN $3 = 'forging_cost' THEN $4 ELSE forging_cost END,
        CASE WHEN $3 = 'packing_cost' THEN $4 ELSE packing_cost END,
        CASE WHEN $3 = 'shipping_cost' THEN $4 ELSE shipping_cost END,
        CASE WHEN $3 = 'overhead_cost_input' THEN $4
          ELSE overhead_cost_input END,
        CASE WHEN $3 = 'purchase_times' THEN $4 ELSE purchase_times END,
        $5, conversion_rate, assembled_part_inr, $6, $6, $2, $2, $7,
        price_lineage_key, $8, $8, 'mrm-dashboard',
        'quote_revisions', $9, $10
      FROM sales.quote_items
      WHERE id = $11
      RETURNING id
    `,
    [
      nextRevision.rows[0]!.revision,
      revised.totalRateUsd,
      input.overrides.get(quote.id)?.fieldName ?? "",
      input.overrides.get(quote.id)?.value ?? 0,
      revised.profit,
      revised.totalRateInr,
      revised.calculation,
      input.actorUserId ?? null,
      sourceId,
      {
        sourceKind: input.sourceKind,
        sourceQuoteItemId: quote.id,
        sourceRecordId: input.sourceRecordId,
      },
      quote.id,
    ]
  )
  const replacementQuoteItemId = created.rows[0]!.id

  const snapshot = await client.query<{ id: string }>(
    `
      INSERT INTO sales.quote_product_snapshots (
        organization_id, quote_item_id, item_uid, description, item_type,
        production_type, weight_100_pcs, pieces_per_kg, material_rate,
        material_cost, conversion_cost, packaging_cost, shipping_cost,
        overhead_cost, rejection_cost, total_cost, quoted_price,
        calculation_version, product_snapshot, calculation_json,
        created_by_user_id, source_system, source_table, source_id,
        source_payload
      )
      SELECT
        organization_id, $1, item_uid, description, item_type,
        production_type, weight_100_pcs, pieces_per_kg, material_rate,
        material_cost, conversion_cost, packaging_cost, shipping_cost,
        overhead_cost, $2, $3, $4, calculation_version, product_snapshot,
        $5, $6, 'mrm-dashboard', 'quote_revision_snapshots', $7, $8
      FROM sales.quote_product_snapshots
      WHERE quote_item_id = $9
      RETURNING id
    `,
    [
      replacementQuoteItemId,
      asNumber(revised.calculation.rejectionCost),
      revised.totalRateInr,
      revised.totalRateInr,
      revised.calculation,
      input.actorUserId ?? null,
      randomUUID(),
      {
        sourceKind: input.sourceKind,
        sourceQuoteItemId: quote.id,
        sourceRecordId: input.sourceRecordId,
      },
      quote.id,
    ]
  )

  for (const component of components) {
    const childRevision = component.child_quote_item_id
      ? revisedChildren.get(component.child_quote_item_id)
      : undefined
    const unitCost = childRevision
      ? childRevision.newPrice * asNumber(quote.conversion_rate, 1)
      : asNumber(component.unit_cost)
    await client.query(
      `
        INSERT INTO sales.quote_package_components (
          organization_id, quote_product_snapshot_id, component_item_id,
          component_uid, description, quantity, unit_cost, extended_cost,
          sequence, child_quote_item_id, created_by_user_id, source_system,
          source_table, source_id, source_payload
        )
        SELECT organization_id, $1, component_item_id, component_uid,
          description, quantity, $2, quantity * $2, sequence, $3, $4,
          'mrm-dashboard', 'quote_revision_components', $5, $6
        FROM sales.quote_package_components
        WHERE id = $7
      `,
      [
        snapshot.rows[0]!.id,
        unitCost,
        childRevision?.replacementQuoteItemId ?? component.child_quote_item_id,
        input.actorUserId ?? null,
        randomUUID(),
        {
          sourceComponentId: component.id,
          sourceKind: input.sourceKind,
          sourceRecordId: input.sourceRecordId,
        },
        component.id,
      ]
    )
  }
  await client.query(
    `
      INSERT INTO sales.quote_terms (
        organization_id, quote_item_id, term_type, label, value, sequence,
        created_by_user_id, source_system, source_table, source_id,
        source_payload
      )
      SELECT organization_id, $1, term_type, label, value, sequence, $2,
        'mrm-dashboard', 'quote_revision_terms', gen_random_uuid()::text,
        jsonb_build_object('sourceQuoteTermId', id)
      FROM sales.quote_terms
      WHERE quote_item_id = $3
    `,
    [replacementQuoteItemId, input.actorUserId ?? null, quote.id]
  )
  await client.query(
    `
      UPDATE sales.quote_items
      SET status = 'Superseded', is_active = false,
        superseded_by_quote_item_id = $1, updated_by_user_id = $2,
        updated_at = now(), row_version = row_version + 1
      WHERE id = $3
    `,
    [replacementQuoteItemId, input.actorUserId ?? null, quote.id]
  )
  await client.query(
    `
      UPDATE sales.quote_items
      SET status = 'Sent', is_active = true, sent_at = now(),
        updated_by_user_id = $1, updated_at = now(),
        row_version = row_version + 1
      WHERE id = $2
    `,
    [input.actorUserId ?? null, replacementQuoteItemId]
  )
  const result = {
    newPrice: revised.totalRateUsd,
    replacementQuoteItemId,
  }
  input.cache.set(quote.id, result)
  return result
}

async function nextRevisionNumber(
  client: PoolClient,
  organizationId: string,
  prefix: string
) {
  const key = `${prefix}_REVISION`
  const result = await client.query<{ current_value: string }>(
    `
      INSERT INTO core.number_sequences (
        organization_id, key, current_value, source_system, source_table,
        source_id
      )
      VALUES ($1, $2, 1, 'mrm-dashboard', 'commercial_revisions', $2)
      ON CONFLICT (organization_id, key) DO UPDATE SET
        current_value = core.number_sequences.current_value + 1,
        updated_at = now()
      RETURNING current_value::text
    `,
    [organizationId, key]
  )
  return `${prefix}-${Number(result.rows[0]!.current_value)
    .toString()
    .padStart(4, "0")}`
}

export function createCommercialRevisionsRepository({
  connectionString,
}: RepositoryOptions) {
  const pool = new Pool({ connectionString })

  return {
    async close() {
      await pool.end()
    },

    async listBulkPriceRevisions(organizationCode: string) {
      const result = await pool.query<{
        change_count: string
        company_name: string | null
        effective_on: string
        id: string
        reason: string
        revision_number: string
        revision_route: string
        revised_quote_count: string
        status: string
      }>(
        `
          SELECT revision.id, revision.revision_number, revision.status,
            revision.reason, revision.effective_on::text,
            revision.revision_route, customer.company_name,
            count(change.id)::text AS change_count,
            count(change.replacement_quote_item_id)::text
              AS revised_quote_count
          FROM sales.bulk_price_revisions revision
          JOIN core.organizations organization
            ON organization.id = revision.organization_id
          LEFT JOIN sales.customers customer
            ON customer.id = revision.customer_id
          LEFT JOIN sales.bulk_price_revision_changes change
            ON change.bulk_price_revision_id = revision.id
          WHERE lower(organization.code) = lower($1)
          GROUP BY revision.id, customer.company_name
          ORDER BY revision.created_at DESC, revision.id DESC
        `,
        [organizationCode]
      )
      return result.rows.map((row) => ({
        changeCount: Number(row.change_count),
        companyName: row.company_name,
        effectiveOn: row.effective_on,
        id: row.id,
        reason: row.reason,
        revisedQuoteCount: Number(row.revised_quote_count),
        revisionNumber: row.revision_number,
        revisionRoute: row.revision_route,
        status: row.status,
      }))
    },

    async listEngineeringChangeNotes(organizationCode: string) {
      const result = await pool.query<{
        decision_count: string
        description: string
        ecn_number: string
        effective_on: string | null
        id: string
        item_id: string
        item_uid: string
        reason: string
        status: string
      }>(
        `
          SELECT ecn.id, ecn.ecn_number, ecn.item_id, ecn.status,
            ecn.reason, ecn.effective_on::text, item.uid AS item_uid,
            item.description,
            count(decision.id)::text AS decision_count
          FROM sales.engineering_change_notes ecn
          JOIN core.organizations organization
            ON organization.id = ecn.organization_id
          JOIN catalog.items item ON item.id = ecn.item_id
          LEFT JOIN sales.engineering_change_decisions decision
            ON decision.engineering_change_note_id = ecn.id
          WHERE lower(organization.code) = lower($1)
          GROUP BY ecn.id, item.uid, item.description
          ORDER BY ecn.created_at DESC, ecn.id DESC
        `,
        [organizationCode]
      )
      return result.rows.map((row) => ({
        decisionCount: Number(row.decision_count),
        description: row.description,
        ecnNumber: row.ecn_number,
        effectiveOn: row.effective_on,
        id: row.id,
        itemId: row.item_id,
        itemUid: row.item_uid,
        reason: row.reason,
        status: row.status,
      }))
    },

    async listRevisionReferenceData(organizationCode: string) {
      const organization = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
        [organizationCode]
      )
      const organizationId = organization.rows[0]?.id
      if (!organizationId) {
        return {
          activePrices: [],
          customers: [],
          items: [],
          organizationId: null,
        }
      }
      const [activePrices, customers, items] = await Promise.all([
        pool.query<{
          approved_price_usd: string
          company_name: string
          customer_part_code: string | null
          id: string
          quote_number: string
          uid: string
        }>(
          `
            SELECT quote.id, quote.quote_number, quote.customer_part_code,
              quote.approved_price_usd, customer.company_name, item.uid
            FROM sales.quote_items quote
            JOIN sales.customers customer ON customer.id = quote.customer_id
            JOIN catalog.items item ON item.id = quote.item_id
            WHERE quote.organization_id = $1 AND quote.is_active
              AND quote.status IN ('Sent', 'Accepted')
            ORDER BY customer.company_name, item.uid, quote.created_at DESC
          `,
          [organizationId]
        ),
        pool.query<{ company_name: string; id: string }>(
          `
            SELECT id, company_name FROM sales.customers
            WHERE organization_id = $1 AND status = 'Active'
            ORDER BY company_name, id
          `,
          [organizationId]
        ),
        pool.query<{ description: string; id: string; uid: string }>(
          `
            SELECT id, uid, description FROM catalog.items
            WHERE organization_id = $1
            ORDER BY uid, id
          `,
          [organizationId]
        ),
      ])
      return {
        activePrices: activePrices.rows.map((row) => ({
          approvedPriceUsd: asNumber(row.approved_price_usd),
          companyName: row.company_name,
          customerPartCode: row.customer_part_code,
          id: row.id,
          quoteNumber: row.quote_number,
          uid: row.uid,
        })),
        customers: customers.rows.map((row) => ({
          companyName: row.company_name,
          id: row.id,
        })),
        items: items.rows,
        organizationId,
      }
    },

    async listPricingCorrections(organizationCode: string) {
      const result = await pool.query<{
        created_at: Date
        id: string
        reason: string
        requested_action: string
        status: string
        target_id: string
        target_table: string
      }>(
        `
          SELECT correction.id, correction.target_table,
            correction.target_id, correction.requested_action,
            correction.reason, correction.status, correction.created_at
          FROM audit.pricing_correction_requests correction
          JOIN core.organizations organization
            ON organization.id = correction.organization_id
          WHERE lower(organization.code) = lower($1)
          ORDER BY correction.created_at DESC, correction.id DESC
        `,
        [organizationCode]
      )
      return result.rows.map((row) => ({
        createdAt: row.created_at,
        id: row.id,
        reason: row.reason,
        requestedAction: row.requested_action,
        status: row.status,
        targetId: row.target_id,
        targetTable: row.target_table,
      }))
    },

    async listCorrectionCandidates(organizationCode: string) {
      const organization = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
        [organizationCode]
      )
      const organizationId = organization.rows[0]?.id
      if (!organizationId) {
        return { designHandoffs: [], organizationId: null, products: [] }
      }
      const [designHandoffs, products] = await Promise.all([
        pool.query<{
          design_task_id: string
          enquiry_number: string
          line_number: number
          part_reference: string | null
        }>(
          `
            SELECT design.id AS design_task_id, enquiry.enquiry_number,
              enquiry_item.line_number,
              coalesce(design.quoted_part_uid, design.internal_drawing_no)
                AS part_reference
            FROM sales.design_tasks design
            JOIN sales.enquiry_items enquiry_item
              ON enquiry_item.id = design.enquiry_item_id
            JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
            WHERE design.organization_id = $1
              AND design.design_status IN ('Design Complete', 'Not Required')
              AND design.next_stage_status = 'Started'
            ORDER BY enquiry.enquiry_number, enquiry_item.line_number,
              design.id
          `,
          [organizationId]
        ),
        pool.query<{
          description: string
          id: string
          item_type: string
          uid: string
        }>(
          `
            SELECT item.id, item.uid, item.description, item.item_type
            FROM catalog.items item
            WHERE item.organization_id = $1
              AND (item.lifecycle_status = 'Q' OR item.uid_kind = 'QUOTE')
              AND NOT EXISTS (
                SELECT 1 FROM sales.quote_items quote
                WHERE quote.item_id = item.id
              )
              AND NOT EXISTS (
                SELECT 1 FROM catalog.bom_lines bom
                WHERE bom.component_item_id = item.id
              )
              AND NOT EXISTS (
                SELECT 1 FROM sales.design_tasks design
                WHERE design.matched_product_id = item.id
              )
            ORDER BY item.uid, item.id
          `,
          [organizationId]
        ),
      ])
      return {
        designHandoffs: designHandoffs.rows.map((row) => ({
          designTaskId: row.design_task_id,
          enquiryNumber: row.enquiry_number,
          lineNumber: row.line_number,
          partReference: row.part_reference,
        })),
        organizationId,
        products: products.rows.map((row) => ({
          description: row.description,
          id: row.id,
          itemType: row.item_type,
          uid: row.uid,
        })),
      }
    },

    async createBulkPriceRevision(input: {
      actorUserId?: string | null
      customerId?: string | null
      effectiveOn: string
      organizationId: string
      reason: string
      revisionRoute:
        | "Customer Parameter Bulk Revision"
        | "Product Parameter Bulk Revision"
    }) {
      return transaction(pool, async (client) => {
        if (!asText(input.reason)) {
          throw new Error("Bulk revision reason is required.")
        }
        if (
          input.revisionRoute === "Customer Parameter Bulk Revision" &&
          !input.customerId
        ) {
          throw new Error("Customer is required for a customer revision.")
        }
        if (input.customerId) {
          const customer = await client.query(
            "SELECT id FROM sales.customers WHERE id = $1 AND organization_id = $2",
            [input.customerId, input.organizationId]
          )
          if (!customer.rows[0]) {
            throw new Error("Bulk revision customer was not found.")
          }
        }
        const revisionNumber = await nextRevisionNumber(
          client,
          input.organizationId,
          "BPR"
        )
        const created = await client.query<{ id: string; status: string }>(
          `
            INSERT INTO sales.bulk_price_revisions (
              organization_id, revision_number, status, reason, effective_on,
              customer_id, revision_route, created_by_user_id,
              updated_by_user_id, source_system, source_table, source_id,
              source_payload
            )
            VALUES (
              $1, $2, 'Pending Costing', $3, $4, $5, $6, $7, $7,
              'mrm-dashboard', 'bulk_price_revisions', $8, $9
            )
            RETURNING id, status
          `,
          [
            input.organizationId,
            revisionNumber,
            input.reason.trim(),
            input.effectiveOn,
            input.customerId ?? null,
            input.revisionRoute,
            input.actorUserId ?? null,
            randomUUID(),
            input,
          ]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "bulk_price_revision.created",
          metadata: { revisionNumber, revisionRoute: input.revisionRoute },
          organizationId: input.organizationId,
          targetId: created.rows[0]!.id,
          targetTable: "bulk_price_revisions",
        })
        return {
          id: created.rows[0]!.id,
          revisionNumber,
          status: created.rows[0]!.status,
        }
      })
    },

    async stageBulkPriceRevisionChange(input: {
      actorUserId?: string | null
      bulkPriceRevisionId: string
      fieldName: string
      newValue: number
      notes?: string | null
      selectedQuoteItemIds: string[]
    }) {
      return transaction(pool, async (client) => {
        const revision = await client.query<{
          customer_id: string | null
          organization_id: string
          revision_route: string
          status: string
        }>(
          "SELECT organization_id, customer_id, revision_route, status FROM sales.bulk_price_revisions WHERE id = $1 FOR UPDATE",
          [input.bulkPriceRevisionId]
        )
        const row = revision.rows[0]
        if (!row || row.status === "Completed") {
          throw new Error("Open bulk revision was not found.")
        }
        if (!fieldLabels[input.fieldName]) {
          throw new Error("Unsupported bulk revision field.")
        }
        if (
          row.revision_route === "Product Parameter Bulk Revision" &&
          !productFields.has(input.fieldName)
        ) {
          throw new Error(
            "Product revisions can only stage product-level parameters."
          )
        }
        if (!input.selectedQuoteItemIds.length) {
          throw new Error("Select at least one active price row.")
        }
        const valid = await client.query<{ id: string; price: string }>(
          `
            SELECT id, approved_price_usd AS price
            FROM sales.quote_items
            WHERE id = ANY($1::uuid[]) AND organization_id = $2
              AND is_active AND status IN ('Sent', 'Accepted')
              AND ($3::uuid IS NULL OR customer_id = $3)
            FOR UPDATE
          `,
          [input.selectedQuoteItemIds, row.organization_id, row.customer_id]
        )
        if (valid.rows.length !== new Set(input.selectedQuoteItemIds).size) {
          throw new Error("One or more selected prices are no longer active.")
        }
        const createdIds: string[] = []
        for (const quote of valid.rows) {
          const created = await client.query<{ id: string }>(
            `
              INSERT INTO sales.bulk_price_revision_changes (
                organization_id, bulk_price_revision_id, prior_quote_item_id,
                old_price, new_price, field_name, field_label, new_value,
                selection_json, selected_count, notes, created_by_user_id,
                source_system, source_table, source_id, source_payload
              )
              VALUES (
                $1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $11,
                'mrm-dashboard', 'bulk_price_revision_changes', $12, $13
              )
              RETURNING id
            `,
            [
              row.organization_id,
              input.bulkPriceRevisionId,
              quote.id,
              quote.price,
              input.fieldName,
              fieldLabels[input.fieldName],
              input.newValue,
              JSON.stringify(input.selectedQuoteItemIds),
              input.selectedQuoteItemIds.length,
              input.notes ?? null,
              input.actorUserId ?? null,
              randomUUID(),
              input,
            ]
          )
          createdIds.push(created.rows[0]!.id)
        }
        return { changeIds: createdIds, selectedCount: valid.rows.length }
      })
    },

    async completeBulkPriceRevision(input: {
      actorUserId?: string | null
      bulkPriceRevisionId: string
    }) {
      return transaction(pool, async (client) => {
        const revision = await client.query<{
          organization_id: string
          status: string
        }>(
          "SELECT organization_id, status FROM sales.bulk_price_revisions WHERE id = $1 FOR UPDATE",
          [input.bulkPriceRevisionId]
        )
        const row = revision.rows[0]
        if (!row || row.status === "Completed") {
          throw new Error("Open bulk revision was not found.")
        }
        const changes = await client.query<{
          field_name: string
          id: string
          new_value: string
          old_price: string
          prior_quote_item_id: string
        }>(
          `
            SELECT id, prior_quote_item_id, old_price, field_name, new_value
            FROM sales.bulk_price_revision_changes
            WHERE bulk_price_revision_id = $1
              AND replacement_quote_item_id IS NULL
            ORDER BY created_at, id
            FOR UPDATE
          `,
          [input.bulkPriceRevisionId]
        )
        if (!changes.rows.length) {
          throw new Error("Add at least one bulk change before completing.")
        }
        const selectedIds = changes.rows.map(
          (change) => change.prior_quote_item_id
        )
        const affected = await collectQuoteAncestors(client, selectedIds)
        const overrides = new Map<string, QuoteOverride>()
        for (const change of changes.rows) {
          overrides.set(change.prior_quote_item_id, {
            fieldName: change.field_name,
            value: asNumber(change.new_value),
          })
          if (productFields.has(change.field_name)) {
            await client.query(
              `
                UPDATE catalog.items item
                SET ${change.field_name} = $1, updated_by_user_id = $2,
                  updated_at = now(), row_version = row_version + 1
                FROM sales.quote_items quote
                WHERE quote.id = $3 AND item.id = quote.item_id
              `,
              [
                asNumber(change.new_value),
                input.actorUserId ?? null,
                change.prior_quote_item_id,
              ]
            )
          }
        }
        const cache = new Map<string, RevisedQuote>()
        const roots = [...affected]
        for (const quoteId of roots) {
          const parents = await activeParentQuoteIds(client, quoteId)
          if (!parents.some((parent) => affected.has(parent))) {
            await createRevisedQuote(client, {
              actorUserId: input.actorUserId,
              affectedQuoteIds: affected,
              cache,
              overrides,
              quoteItemId: quoteId,
              sourceKind: "Bulk Revision",
              sourceRecordId: input.bulkPriceRevisionId,
            })
          }
        }
        const finalIds = [...cache.values()].map(
          (quote) => quote.replacementQuoteItemId
        )
        for (const [oldQuoteId, revised] of cache) {
          const staged = changes.rows.find(
            (change) => change.prior_quote_item_id === oldQuoteId
          )
          if (staged) {
            await client.query(
              `
                UPDATE sales.bulk_price_revision_changes
                SET replacement_quote_item_id = $1, new_price = $2,
                  applied_at = now(), final_quote_item_ids_json = $3,
                  calculation_evidence = $4
                WHERE id = $5
              `,
              [
                revised.replacementQuoteItemId,
                revised.newPrice,
                JSON.stringify(finalIds),
                { propagatedQuoteCount: cache.size },
                staged.id,
              ]
            )
          } else {
            const old = await getQuote(client, oldQuoteId)
            await client.query(
              `
                INSERT INTO sales.bulk_price_revision_changes (
                  organization_id, bulk_price_revision_id,
                  prior_quote_item_id, replacement_quote_item_id, old_price,
                  new_price, field_name, field_label, new_value,
                  selection_json, selected_count, applied_at,
                  final_quote_item_ids_json, calculation_evidence,
                  created_by_user_id, source_system, source_table, source_id,
                  source_payload
                )
                VALUES (
                  $1, $2, $3, $4, $5, $6, 'derived_parent_refresh',
                  'Derived parent refresh', $6, '[]', 0, now(), $7, $8, $9,
                  'mrm-dashboard', 'bulk_price_revision_changes', $10, $11
                )
              `,
              [
                row.organization_id,
                input.bulkPriceRevisionId,
                oldQuoteId,
                revised.replacementQuoteItemId,
                old.approved_price_usd,
                revised.newPrice,
                JSON.stringify(finalIds),
                { propagatedFrom: selectedIds },
                input.actorUserId ?? null,
                randomUUID(),
                { derived: true },
              ]
            )
          }
        }
        await client.query(
          `
            UPDATE sales.bulk_price_revisions
            SET status = 'Completed', applied_at = now(), completed_at = now(),
              updated_by_user_id = $1, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $2
          `,
          [input.actorUserId ?? null, input.bulkPriceRevisionId]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "bulk_price_revision.completed",
          metadata: { revisedQuoteCount: cache.size },
          organizationId: row.organization_id,
          targetId: input.bulkPriceRevisionId,
          targetTable: "bulk_price_revisions",
        })
        return { revisedQuoteCount: cache.size, status: "Completed" }
      })
    },

    async createEngineeringChangeNote(input: {
      actorUserId?: string | null
      effectiveOn?: string | null
      itemId: string
      organizationId: string
      reason: string
    }) {
      return transaction(pool, async (client) => {
        const item = await client.query(
          "SELECT id FROM catalog.items WHERE id = $1 AND organization_id = $2",
          [input.itemId, input.organizationId]
        )
        if (!item.rows[0]) {
          throw new Error("Product was not found for ECN.")
        }
        const ecnNumber = await nextRevisionNumber(
          client,
          input.organizationId,
          "ECN"
        )
        const created = await client.query<{ id: string; status: string }>(
          `
            INSERT INTO sales.engineering_change_notes (
              organization_id, ecn_number, item_id, status, reason,
              effective_on, created_by_user_id, updated_by_user_id,
              source_system, source_table, source_id, source_payload
            )
            VALUES (
              $1, $2, $3, 'Pending Design', $4, $5, $6, $6,
              'mrm-dashboard', 'engineering_change_notes', $7, $8
            )
            RETURNING id, status
          `,
          [
            input.organizationId,
            ecnNumber,
            input.itemId,
            input.reason.trim(),
            input.effectiveOn ?? null,
            input.actorUserId ?? null,
            randomUUID(),
            input,
          ]
        )
        return {
          ecnNumber,
          id: created.rows[0]!.id,
          status: created.rows[0]!.status,
        }
      })
    },

    async completeEngineeringChangeDesign(input: {
      actorUserId?: string | null
      engineeringChangeNoteId: string
      itemPatch: { description?: string }
    }) {
      return transaction(pool, async (client) => {
        const ecn = await client.query<{
          item_id: string
          organization_id: string
          status: string
        }>(
          "SELECT organization_id, item_id, status FROM sales.engineering_change_notes WHERE id = $1 FOR UPDATE",
          [input.engineeringChangeNoteId]
        )
        const row = ecn.rows[0]
        if (!row || row.status !== "Pending Design") {
          throw new Error("Pending-design ECN was not found.")
        }
        const before = await client.query<Record<string, unknown>>(
          "SELECT * FROM catalog.items WHERE id = $1 FOR UPDATE",
          [row.item_id]
        )
        const description = asText(input.itemPatch.description)
        if (description) {
          await client.query(
            `
              UPDATE catalog.items
              SET description = $1, updated_by_user_id = $2,
                updated_at = now(), row_version = row_version + 1
              WHERE id = $3
            `,
            [description, input.actorUserId ?? null, row.item_id]
          )
        }
        const after = await client.query<Record<string, unknown>>(
          "SELECT * FROM catalog.items WHERE id = $1",
          [row.item_id]
        )
        await client.query(
          `
            UPDATE sales.engineering_change_notes
            SET status = 'Pending Costing', design_before = $1,
              design_after = $2, design_completed_at = now(),
              updated_by_user_id = $3, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $4
          `,
          [
            before.rows[0],
            after.rows[0],
            input.actorUserId ?? null,
            input.engineeringChangeNoteId,
          ]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "engineering_change.design_completed",
          organizationId: row.organization_id,
          targetId: input.engineeringChangeNoteId,
          targetTable: "engineering_change_notes",
        })
        return { id: input.engineeringChangeNoteId, status: "Pending Costing" }
      })
    },

    async listEngineeringChangeAffectedPrices(engineeringChangeNoteId: string) {
      const result = await pool.query<{
        approved_price_usd: string
        customer_part_code: string
        quote_item_id: string
      }>(
        `
          WITH RECURSIVE ecn AS (
            SELECT item_id
            FROM sales.engineering_change_notes
            WHERE id = $1
          ), quote_tree AS (
            SELECT root.id AS root_quote_item_id, root.id AS quote_item_id,
              root.item_id
            FROM sales.quote_items root
            WHERE root.is_active
              AND root.status IN ('Sent', 'Accepted')
              AND NULLIF(btrim(root.customer_part_code), '') IS NOT NULL
            UNION ALL
            SELECT quote_tree.root_quote_item_id,
              component.child_quote_item_id, component.component_item_id
            FROM quote_tree
            JOIN sales.quote_product_snapshots snapshot
              ON snapshot.quote_item_id = quote_tree.quote_item_id
            JOIN sales.quote_package_components component
              ON component.quote_product_snapshot_id = snapshot.id
            WHERE component.child_quote_item_id IS NOT NULL
          )
          SELECT DISTINCT root.id AS quote_item_id,
            root.customer_part_code, root.approved_price_usd
          FROM quote_tree
          JOIN ecn ON ecn.item_id = quote_tree.item_id
          JOIN sales.quote_items root
            ON root.id = quote_tree.root_quote_item_id
          ORDER BY root.customer_part_code, root.id
        `,
        [engineeringChangeNoteId]
      )
      return result.rows.map((row) => ({
        approvedPriceUsd: asNumber(row.approved_price_usd),
        customerPartCode: row.customer_part_code,
        quoteItemId: row.quote_item_id,
      }))
    },

    async applyEngineeringChangeDecision(input: {
      actorUserId?: string | null
      decision: "Keep Price Same" | "Revise Price"
      engineeringChangeNoteId: string
      newProfitPercent?: number
      notes?: string | null
      sourceQuoteItemId: string
    }) {
      return transaction(pool, async (client) => {
        const ecn = await client.query<{
          item_id: string
          organization_id: string
          status: string
        }>(
          "SELECT organization_id, item_id, status FROM sales.engineering_change_notes WHERE id = $1 FOR UPDATE",
          [input.engineeringChangeNoteId]
        )
        const row = ecn.rows[0]
        if (!row || row.status !== "Pending Costing") {
          throw new Error("Pending-costing ECN was not found.")
        }
        const existing = await client.query(
          "SELECT id FROM sales.engineering_change_decisions WHERE engineering_change_note_id = $1 AND source_quote_item_id = $2",
          [input.engineeringChangeNoteId, input.sourceQuoteItemId]
        )
        if (existing.rows[0]) {
          throw new Error("This affected price already has an ECN decision.")
        }
        const source = await getQuote(client, input.sourceQuoteItemId, true)
        const affected = new Set([input.sourceQuoteItemId])
        const overrides = new Map<string, QuoteOverride>()
        if (input.decision === "Revise Price") {
          if (input.newProfitPercent === undefined) {
            throw new Error("Revised profit is required.")
          }
          overrides.set(input.sourceQuoteItemId, {
            fieldName: "profit_percent",
            value: input.newProfitPercent,
          })
        }
        const cache = new Map<string, RevisedQuote>()
        const revised = await createRevisedQuote(client, {
          actorUserId: input.actorUserId,
          affectedQuoteIds: affected,
          cache,
          overrides,
          quoteItemId: input.sourceQuoteItemId,
          sourceKind: "ECN",
          sourceRecordId: input.engineeringChangeNoteId,
        })
        await client.query(
          `
            INSERT INTO sales.engineering_change_decisions (
              organization_id, engineering_change_note_id, affected_item_id,
              decision, old_value, new_value, decided_by_user_id,
              source_quote_item_id, replacement_quote_item_id, old_price,
              new_price, old_profit_percent, new_profit_percent, notes,
              source_system, source_table, source_id, source_payload
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
              $14, 'mrm-dashboard', 'engineering_change_decisions', $15, $16
            )
          `,
          [
            row.organization_id,
            input.engineeringChangeNoteId,
            row.item_id,
            input.decision,
            {
              price: asNumber(source.approved_price_usd),
              profitPercent: asNumber(source.profit_percent),
            },
            {
              price: revised.newPrice,
              profitPercent:
                input.newProfitPercent ?? asNumber(source.profit_percent),
            },
            input.actorUserId ?? null,
            input.sourceQuoteItemId,
            revised.replacementQuoteItemId,
            source.approved_price_usd,
            revised.newPrice,
            source.profit_percent,
            input.newProfitPercent ?? source.profit_percent,
            input.notes ?? null,
            randomUUID(),
            input,
          ]
        )
        const affectedPrices = await client.query<{ count: string }>(
          `
            WITH RECURSIVE quote_tree AS (
              SELECT root.id AS root_quote_item_id, root.id AS quote_item_id,
                root.item_id
              FROM sales.quote_items root
              WHERE root.is_active
                AND root.status IN ('Sent', 'Accepted')
                AND NULLIF(btrim(root.customer_part_code), '') IS NOT NULL
              UNION ALL
              SELECT quote_tree.root_quote_item_id,
                component.child_quote_item_id, component.component_item_id
              FROM quote_tree
              JOIN sales.quote_product_snapshots snapshot
                ON snapshot.quote_item_id = quote_tree.quote_item_id
              JOIN sales.quote_package_components component
                ON component.quote_product_snapshot_id = snapshot.id
              WHERE component.child_quote_item_id IS NOT NULL
            )
            SELECT count(DISTINCT root_quote_item_id)::text AS count
            FROM quote_tree
            WHERE item_id = $1
          `,
          [row.item_id]
        )
        const decisions = await client.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM sales.engineering_change_decisions WHERE engineering_change_note_id = $1",
          [input.engineeringChangeNoteId]
        )
        const completed =
          Number(decisions.rows[0]!.count) >=
          Math.max(1, Number(affectedPrices.rows[0]!.count))
        if (completed) {
          await client.query(
            `
              UPDATE sales.engineering_change_notes
              SET status = 'Completed', completed_at = now(),
                updated_by_user_id = $1, updated_at = now(),
                row_version = row_version + 1
              WHERE id = $2
            `,
            [input.actorUserId ?? null, input.engineeringChangeNoteId]
          )
        }
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "engineering_change.price_decided",
          metadata: {
            decision: input.decision,
            replacementQuoteItemId: revised.replacementQuoteItemId,
          },
          organizationId: row.organization_id,
          targetId: input.engineeringChangeNoteId,
          targetTable: "engineering_change_notes",
        })
        return {
          newPrice: revised.newPrice,
          replacementQuoteItemId: revised.replacementQuoteItemId,
          status: completed ? "Completed" : "Pending Costing",
        }
      })
    },

    async reverseDesignCostingHandoff(input: {
      actorUserId?: string | null
      designTaskId: string
      remarks?: string | null
    }) {
      return transaction(pool, async (client) => {
        const result = await client.query<{
          design_status: string
          enquiry_item_id: string
          enquiry_number: string
          line_number: number
          next_stage_status: string
          organization_id: string
          part_reference: string | null
        }>(
          `
            SELECT design.enquiry_item_id, design.organization_id,
              design.design_status, design.next_stage_status,
              coalesce(design.quoted_part_uid, design.internal_drawing_no)
                AS part_reference,
              enquiry.enquiry_number, enquiry_item.line_number
            FROM sales.design_tasks design
            JOIN sales.enquiry_items enquiry_item
              ON enquiry_item.id = design.enquiry_item_id
            JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
            WHERE design.id = $1
            FOR UPDATE OF design
          `,
          [input.designTaskId]
        )
        const design = result.rows[0]
        if (!design) {
          throw new Error("Design correction candidate was not found.")
        }
        if (
          !["Design Complete", "Not Required"].includes(design.design_status) ||
          design.next_stage_status !== "Started"
        ) {
          throw new Error(
            "Only a completed, just-started Design-to-Costing handoff can be reversed."
          )
        }
        await client.query(
          `
            UPDATE sales.design_tasks
            SET next_stage_status = 'Not Started', updated_by_user_id = $1,
              updated_at = now(), row_version = row_version + 1
            WHERE id = $2
          `,
          [input.actorUserId ?? null, input.designTaskId]
        )
        const reference = `${design.enquiry_number} / Line ${design.line_number} / ${design.part_reference ?? "-"}`
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          afterState: { nextStageStatus: "Not Started" },
          beforeState: { nextStageStatus: "Started" },
          eventType: "pricing_correction.design_costing_handoff_reversed",
          metadata: {
            correctionType: "Reverse Costing Handoff",
            designTaskId: input.designTaskId,
            entityType: "design_tasks",
            newValue: "Not Started",
            previousValue: "Started",
            reference,
            remarks: asText(input.remarks) || null,
          },
          organizationId: design.organization_id,
          reason: asText(input.remarks) || null,
          targetId: design.enquiry_item_id,
          targetTable: "design_tasks",
        })
        return {
          designTaskId: input.designTaskId,
          nextStageStatus: "Not Started",
        }
      })
    },

    async reverseProductEntry(input: {
      actorUserId?: string | null
      itemId: string
      remarks?: string | null
    }) {
      return transaction(pool, async (client) => {
        const result = await client.query<{
          description: string
          item_type: string
          lifecycle_status: string
          organization_id: string
          uid: string
          uid_kind: string
        }>(
          `
            SELECT organization_id, uid, uid_kind, lifecycle_status,
              description, item_type
            FROM catalog.items
            WHERE id = $1
            FOR UPDATE
          `,
          [input.itemId]
        )
        const item = result.rows[0]
        if (!item) {
          throw new Error("Quoted product correction candidate was not found.")
        }
        if (item.lifecycle_status !== "Q" && item.uid_kind !== "QUOTE") {
          throw new Error("Only an unused quoted product entry can be reversed.")
        }
        const blockers = await client.query<{
          bom_component_count: string
          design_match_count: string
          quote_count: string
        }>(
          `
            SELECT
              (SELECT count(*)::text FROM sales.quote_items
                WHERE item_id = $1) AS quote_count,
              (SELECT count(*)::text FROM catalog.bom_lines
                WHERE component_item_id = $1) AS bom_component_count,
              (SELECT count(*)::text FROM sales.design_tasks
                WHERE matched_product_id = $1) AS design_match_count
          `,
          [input.itemId]
        )
        const blocker = blockers.rows[0]!
        if (Number(blocker.quote_count) > 0) {
          throw new Error("Quoted product is already used by a quote.")
        }
        if (Number(blocker.bom_component_count) > 0) {
          throw new Error("Quoted product is already used as a BOM component.")
        }
        if (Number(blocker.design_match_count) > 0) {
          throw new Error("Quoted product is already used as a design match.")
        }
        await client.query(
          "DELETE FROM catalog.bom_lines WHERE parent_item_id = $1",
          [input.itemId]
        )
        await client.query("DELETE FROM catalog.items WHERE id = $1", [
          input.itemId,
        ])
        const beforeState = {
          itemType: item.item_type,
          status: item.lifecycle_status,
          uid: item.uid,
        }
        const reference = `${item.uid} / ${item.description}`
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          afterState: { value: "Deleted" },
          beforeState,
          eventType: "pricing_correction.product_entry_reversed",
          metadata: {
            correctionType: "Reverse Product Entry",
            entityType: "products",
            newValue: "Deleted",
            previousValue: beforeState,
            reference,
            remarks: asText(input.remarks) || null,
          },
          organizationId: item.organization_id,
          reason: asText(input.remarks) || null,
          targetId: input.itemId,
          targetSchema: "catalog",
          targetTable: "items",
        })
        return { deleted: true, itemId: input.itemId }
      })
    },

    async recordPricingCorrection(input: {
      actorUserId?: string | null
      organizationId: string
      reason: string
      requestedAction: string
      targetId: string
      targetTable: string
    }) {
      return transaction(pool, async (client) => {
        if (input.targetTable !== "quote_items") {
          throw new Error("Unsupported historical correction target.")
        }
        if (!asText(input.reason) || !asText(input.requestedAction)) {
          throw new Error("Correction action and reason are required.")
        }
        const target = await client.query<{ id: string }>(
          `
            SELECT id FROM sales.quote_items
            WHERE id = $1 AND organization_id = $2
            FOR SHARE
          `,
          [input.targetId, input.organizationId]
        )
        if (!target.rows[0]) {
          throw new Error("Historical correction target is outside this organization.")
        }
        const created = await client.query<{ id: string; status: string }>(
          `
            INSERT INTO audit.pricing_correction_requests (
              organization_id, target_table, target_id, requested_action,
              reason, status, created_by_user_id, source_system, source_table,
              source_id, evidence
            )
            VALUES (
              $1, $2, $3, $4, $5, 'Quarantined', $6, 'mrm-dashboard',
              'pricing_correction_requests', $7, $8
            )
            RETURNING id, status
          `,
          [
            input.organizationId,
            input.targetTable,
            input.targetId,
            input.requestedAction,
            input.reason,
            input.actorUserId ?? null,
            randomUUID(),
            { immutableTarget: true },
          ]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "pricing_correction.quarantined",
          metadata: {
            reason: input.reason,
            requestedAction: input.requestedAction,
          },
          organizationId: input.organizationId,
          targetId: created.rows[0]!.id,
          targetSchema: "audit",
          targetTable: "pricing_correction_requests",
        })
        return created.rows[0]!
      })
    },
  }
}
