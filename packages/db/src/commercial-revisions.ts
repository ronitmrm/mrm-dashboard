import { randomUUID } from "node:crypto"

import type { Pool, PoolClient } from "pg"

import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"
import { calculateCosting } from "./pricing-calculation"

type RepositoryOptions = RepositoryPoolOptions

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

type ProductRow = {
  alloy_premium: string
  annealing: string
  assembly_operation_cost: string
  buffing: string
  burning_loss_percent: string
  casting: string
  checking: string
  deburring: string
  description: string
  direct_purchase_price_per_piece: string
  extrusion_cost: string
  forging_cost: string
  id: string
  item_type: string
  machining_cost: string
  marking: string
  overhead_cost: string
  pieces_per_kg: string
  plating: string
  pricing_method: string
  product_cost_inr: string
  production_type: string | null
  rejection_percent: string
  remarks: string | null
  sealant: string
  uid: string
  washing: string
  weight_100_pcs: string
}

type QuoteOverride = Map<string, number>

type RevisedQuote = {
  newPrice: number
  newProfitPercent: number
  replacementQuoteItemId: string
}

export const bulkRevisionFields = {
  casting: { label: "Casting", route: "product", valueType: "number" },
  scrap_rate: {
    label: "Scrap Rate (INR/kg)",
    route: "customer",
    valueType: "number",
  },
  alloy_premium: {
    label: "Alloy Premium (INR/kg)",
    route: "product",
    valueType: "number",
  },
  ext_cost: {
    label: "Extrusion Cost (INR/kg)",
    route: "product",
    valueType: "number",
  },
  forging_cost: {
    label: "Forging Cost (INR/kg)",
    route: "product",
    valueType: "number",
  },
  machining_cost: {
    label: "M/c Cost (INR/kg)",
    route: "product",
    valueType: "number",
  },
  washing: {
    label: "Washing (INR/kg)",
    route: "product",
    valueType: "number",
  },
  checking: {
    label: "Checking (INR/kg)",
    route: "product",
    valueType: "number",
  },
  marking: {
    label: "Marking (INR/kg)",
    route: "product",
    valueType: "number",
  },
  plating: {
    label: "Plating (INR/kg)",
    route: "product",
    valueType: "number",
  },
  annealing: {
    label: "Annealing (INR/kg)",
    route: "product",
    valueType: "number",
  },
  deburring: {
    label: "Deburring (INR/kg)",
    route: "product",
    valueType: "number",
  },
  buffing: {
    label: "Buffing (INR/kg)",
    route: "product",
    valueType: "number",
  },
  sealant: {
    label: "Sealant (INR/kg)",
    route: "product",
    valueType: "number",
  },
  assembly_operation_cost: {
    label: "Package Assembly Cost (INR/kg)",
    route: "product",
    valueType: "number",
  },
  packing_cost: {
    label: "Packing Cost (INR/kg)",
    route: "customer",
    valueType: "number",
  },
  shipping_cost: {
    label: "Shipping Cost (INR/kg)",
    route: "customer",
    valueType: "number",
  },
  overhead_cost: {
    label: "Overhead Cost (INR/kg)",
    route: "product",
    valueType: "number",
  },
  purchase_times: {
    label: "OR / Purchase Times",
    route: "customer",
    valueType: "number",
  },
  profit_percent: {
    label: "Profit %",
    route: "customer",
    valueType: "percent",
  },
  conversion_rate: {
    label: "FX / Conversion Rate",
    route: "customer",
    valueType: "number",
  },
} as const

type BulkRevisionFieldName = keyof typeof bulkRevisionFields

const productFields = new Set<BulkRevisionFieldName>([
  "casting",
  "alloy_premium",
  "ext_cost",
  "forging_cost",
  "machining_cost",
  "washing",
  "checking",
  "marking",
  "plating",
  "annealing",
  "deburring",
  "buffing",
  "sealant",
  "assembly_operation_cost",
  "overhead_cost",
])

const customerFields = new Set<BulkRevisionFieldName>([
  "scrap_rate",
  "packing_cost",
  "shipping_cost",
  "purchase_times",
  "profit_percent",
  "conversion_rate",
])

const productColumnByField: Partial<Record<BulkRevisionFieldName, string>> = {
  alloy_premium: "alloy_premium",
  annealing: "annealing",
  assembly_operation_cost: "assembly_operation_cost",
  buffing: "buffing",
  casting: "casting",
  checking: "checking",
  deburring: "deburring",
  ext_cost: "extrusion_cost",
  forging_cost: "forging_cost",
  machining_cost: "machining_cost",
  marking: "marking",
  overhead_cost: "overhead_cost",
  plating: "plating",
  sealant: "sealant",
  washing: "washing",
}

const lockedBulkProcessFields = new Set<BulkRevisionFieldName>([
  "washing",
  "checking",
  "marking",
  "plating",
  "annealing",
  "deburring",
  "buffing",
  "sealant",
  "assembly_operation_cost",
])

const bulkProcessFieldAliases: Partial<
  Record<BulkRevisionFieldName, string[]>
> = {
  annealing: ["annealing", "anneling"],
  assembly_operation_cost: ["assembly", "package process", "package assembly"],
  buffing: ["buffing", "buff"],
  checking: ["checking", "inspection", "quality checking"],
  deburring: ["deburring", "debbring"],
  marking: ["marking", "mark"],
  plating: ["plating", "plate"],
  sealant: ["sealant", "sealing"],
  washing: ["washing", "wash"],
}

function isBulkRevisionField(value: string): value is BulkRevisionFieldName {
  return value in bulkRevisionFields
}

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

async function getProduct(client: PoolClient, itemId: string, lock = false) {
  const result = await client.query<ProductRow>(
    `SELECT * FROM catalog.items WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [itemId]
  )
  if (!result.rows[0]) {
    throw new Error("Revision product was not found.")
  }
  return result.rows[0]
}

function productSnapshot(product: ProductRow) {
  return {
    alloyPremium: asNumber(product.alloy_premium),
    annealing: asNumber(product.annealing),
    assemblyOperationCost: asNumber(product.assembly_operation_cost),
    buffing: asNumber(product.buffing),
    burningLossPercent: asNumber(product.burning_loss_percent),
    casting: asNumber(product.casting, 1),
    checking: asNumber(product.checking),
    deburring: asNumber(product.deburring),
    description: product.description,
    directPurchasePricePerPiece: asNumber(
      product.direct_purchase_price_per_piece
    ),
    extrusionCost: asNumber(product.extrusion_cost),
    forgingCost: asNumber(product.forging_cost),
    itemType: product.item_type,
    machiningCost: asNumber(product.machining_cost),
    marking: asNumber(product.marking),
    overheadCost: asNumber(product.overhead_cost),
    piecesPerKg: asNumber(product.pieces_per_kg),
    plating: asNumber(product.plating),
    pricingMethod: product.pricing_method,
    productCostInr: asNumber(product.product_cost_inr),
    productionType: product.production_type,
    rejectionPercent: asNumber(product.rejection_percent),
    remarks: product.remarks,
    sealant: asNumber(product.sealant),
    uid: product.uid,
    washing: asNumber(product.washing),
    weight100Pcs: asNumber(product.weight_100_pcs),
  }
}

function productWithOverrides(
  product: ProductRow,
  override?: QuoteOverride
): ProductRow {
  if (!override) return product
  const revised = { ...product }
  for (const [fieldName, value] of override) {
    if (!isBulkRevisionField(fieldName)) continue
    const column = productColumnByField[fieldName]
    if (column) {
      ;(revised as unknown as Record<string, unknown>)[column] = String(value)
    }
  }
  return revised
}

function overrideNumber(
  override: QuoteOverride | undefined,
  fieldName: string,
  fallback: unknown
) {
  return override?.get(fieldName) ?? asNumber(fallback)
}

function processTextAllowsField(
  processText: string | null,
  fieldName: BulkRevisionFieldName
) {
  const normalized = asText(processText).toLowerCase()
  return (bulkProcessFieldAliases[fieldName] ?? []).some((alias) =>
    normalized.includes(alias)
  )
}

async function quoteAllowsBulkProcessField(
  client: PoolClient,
  quoteItemId: string,
  fieldName: BulkRevisionFieldName
) {
  const column = productColumnByField[fieldName]
  if (!column) return false
  const result = await client.query<{
    current_value: string
    item_type: string
    remarks: string | null
  }>(
    `
      WITH RECURSIVE quote_tree AS (
        SELECT quote.id, quote.item_id
        FROM sales.quote_items quote
        WHERE quote.id = $1
        UNION
        SELECT child.id, child.item_id
        FROM quote_tree parent
        JOIN sales.quote_product_snapshots snapshot
          ON snapshot.quote_item_id = parent.id
        JOIN sales.quote_package_components component
          ON component.quote_product_snapshot_id = snapshot.id
        JOIN sales.quote_items child
          ON child.id = component.child_quote_item_id
      )
      SELECT item.item_type, item.remarks, item.${column}::text AS current_value
      FROM quote_tree
      JOIN catalog.items item ON item.id = quote_tree.item_id
    `,
    [quoteItemId]
  )
  return result.rows.some((row) => {
    if (
      fieldName === "assembly_operation_cost" &&
      !["Package", "Assembly"].includes(row.item_type)
    ) {
      return false
    }
    return (
      asNumber(row.current_value) > 0 ||
      processTextAllowsField(row.remarks, fieldName)
    )
  })
}

function revisedCalculation(
  quote: QuoteRow,
  productInput: ProductRow,
  components: ComponentRow[],
  revisedChildren: Map<string, RevisedQuote>,
  override?: QuoteOverride
) {
  const oldPrice = asNumber(quote.approved_price_usd, asNumber(quote.rate_usd))
  const product = productWithOverrides(productInput, override)
  const conversionRate = overrideNumber(
    override,
    "conversion_rate",
    quote.conversion_rate
  )
  const profit = overrideNumber(
    override,
    "profit_percent",
    quote.profit_percent
  )
  const calculation = { ...quote.calculation_json }
  const targetPriceUsd = override?.get("__target_price_usd")

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
    const piecesPerKg =
      asNumber(product.weight_100_pcs) > 0
        ? 1000 / asNumber(product.weight_100_pcs)
        : asNumber(product.pieces_per_kg)
    const storedProcessBase = asNumber(
      quote.calculation_json.packageProcessCostPerPiece,
      asNumber(quote.calculation_json.totalA)
    )
    const processBase =
      override?.has("assembly_operation_cost") && piecesPerKg > 0
        ? asNumber(product.assembly_operation_cost) / piecesPerKg
        : storedProcessBase
    const rejectionPercent = asNumber(product.rejection_percent)
    let revisedProfit = profit
    if (targetPriceUsd !== undefined && processBase > 0) {
      const targetBeforeRejection =
        (targetPriceUsd * conversionRate) / (1 + rejectionPercent)
      revisedProfit =
        (targetBeforeRejection - childQuoteTotal - processBase) / processBase
    }
    const profitB = processBase * revisedProfit
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
      profit: revisedProfit,
      totalRateInr,
      totalRateUsd:
        targetPriceUsd ??
        (conversionRate > 0 ? totalRateInr / conversionRate : 0),
    }
  }

  const canUseCanonicalCalculation =
    asNumber(product.weight_100_pcs) > 0 ||
    asNumber(product.product_cost_inr) > 0 ||
    asNumber(product.direct_purchase_price_per_piece) > 0
  if (!canUseCanonicalCalculation) {
    if (!override || override.size === 0) {
      return {
        calculation,
        profit,
        totalRateInr: asNumber(quote.total_rate_inr),
        totalRateUsd: oldPrice,
      }
    }
    const oldProfit = asNumber(quote.profit_percent)
    const oldTotalInr = asNumber(quote.total_rate_inr)
    let totalRateInr = oldTotalInr
    if (override.has("profit_percent")) {
      const totalA = asNumber(quote.calculation_json.totalA)
      const fixedAfterProfit = oldTotalInr - totalA * (1 + oldProfit)
      totalRateInr = totalA * (1 + profit) + fixedAfterProfit
    } else {
      for (const [fieldName, value] of override) {
        if (fieldName.startsWith("__")) continue
        const quoteField =
          fieldName === "ext_cost"
            ? "extrusion_cost"
            : fieldName === "overhead_cost"
              ? "overhead_cost_input"
              : fieldName
        const current = asNumber(
          quote[quoteField as keyof QuoteRow] ??
            quote.snapshot_product_json[fieldName]
        )
        totalRateInr += value - current
      }
    }
    const totalRateUsd =
      targetPriceUsd ??
      (conversionRate > 0 ? Math.max(0, totalRateInr) / conversionRate : 0)
    return {
      calculation: { ...calculation, totalRateInr },
      profit,
      totalRateInr: targetPriceUsd
        ? targetPriceUsd * conversionRate
        : Math.max(0, totalRateInr),
      totalRateUsd,
    }
  }

  const storedCost =
    product.pricing_method === "Direct Purchase"
      ? asNumber(product.direct_purchase_price_per_piece)
      : asNumber(product.product_cost_inr)
  const assembledPartInr = asNumber(quote.assembled_part_inr)
  const base =
    storedCost > 0
      ? {
          profitB: storedCost * profit,
          totalA: storedCost,
          totalAPlusB: storedCost * (1 + profit),
          totalRateInr: storedCost * (1 + profit) + assembledPartInr,
        }
      : calculateCosting(
          {
            annealing: asNumber(product.annealing),
            assemblyOperationCost: 0,
            buffing: asNumber(product.buffing),
            burningLossPercent: asNumber(product.burning_loss_percent),
            casting: asNumber(product.casting, 1),
            checking: asNumber(product.checking),
            deburring: asNumber(product.deburring),
            machiningCost: asNumber(product.machining_cost),
            marking: asNumber(product.marking),
            overheadCost: asNumber(product.overhead_cost),
            plating: asNumber(product.plating),
            rejectionPercent: asNumber(product.rejection_percent),
            sealant: asNumber(product.sealant),
            washing: asNumber(product.washing),
            weight100Pcs: asNumber(product.weight_100_pcs),
          },
          {
            alloyPremium: asNumber(product.alloy_premium),
            assembledPartInr,
            conversionRate,
            extCost: asNumber(product.extrusion_cost),
            forgingCost:
              product.production_type?.toLowerCase() === "barstock"
                ? 0
                : asNumber(product.forging_cost),
            overheadCost: overrideNumber(
              override,
              "overhead_cost_input",
              quote.overhead_cost_input
            ),
            packingCost: overrideNumber(
              override,
              "packing_cost",
              quote.packing_cost
            ),
            profitPercent: profit,
            purchaseTimes: overrideNumber(
              override,
              "purchase_times",
              quote.purchase_times
            ),
            scrapRate: overrideNumber(override, "scrap_rate", quote.scrap_rate),
            shippingCost: overrideNumber(
              override,
              "shipping_cost",
              quote.shipping_cost
            ),
          }
        )
  let revisedProfit = profit
  if (targetPriceUsd !== undefined && asNumber(base.totalA) > 0) {
    revisedProfit =
      (targetPriceUsd * conversionRate -
        assembledPartInr -
        asNumber(base.totalA)) /
      asNumber(base.totalA)
  }
  const profitB = asNumber(base.totalA) * revisedProfit
  const totalAPlusB = asNumber(base.totalA) + profitB
  const totalRateInr = totalAPlusB + assembledPartInr
  return {
    calculation: {
      ...calculation,
      ...base,
      profitB,
      totalAPlusB,
      totalRateInr,
    },
    profit: revisedProfit,
    totalRateInr,
    totalRateUsd:
      targetPriceUsd ??
      (conversionRate > 0 ? totalRateInr / conversionRate : 0),
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
  const product = await getProduct(client, quote.item_id)
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
    product,
    components,
    revisedChildren,
    input.overrides.get(input.quoteItemId)
  )
  const override = input.overrides.get(quote.id)
  const revisedProduct = productWithOverrides(product, override)
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
        shipping_terms, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        assembled_part_inr, $13, $14, $2, $2, $15, price_lineage_key,
        $16, $16, 'mrm-dashboard', 'quote_revisions', $17, $18
      FROM sales.quote_items
      WHERE id = $19
      RETURNING id
    `,
    [
      nextRevision.rows[0]!.revision,
      revised.totalRateUsd,
      overrideNumber(override, "scrap_rate", quote.scrap_rate),
      asNumber(revisedProduct.alloy_premium),
      asNumber(revisedProduct.extrusion_cost),
      asNumber(revisedProduct.forging_cost),
      overrideNumber(override, "packing_cost", quote.packing_cost),
      overrideNumber(override, "shipping_cost", quote.shipping_cost),
      asNumber(quote.overhead_cost_input),
      overrideNumber(override, "purchase_times", quote.purchase_times),
      revised.profit,
      overrideNumber(override, "conversion_rate", quote.conversion_rate),
      asNumber(revised.calculation.rateInr, revised.totalRateInr),
      revised.totalRateInr,
      revised.calculation,
      input.actorUserId ?? null,
      sourceId,
      {
        appliedOverrides: override ? Object.fromEntries(override) : {},
        revisionOrder: input.cache.size + 1,
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
        overhead_cost, $2, $3, $4, calculation_version, $5,
        $6, $7, 'mrm-dashboard', 'quote_revision_snapshots', $8, $9
      FROM sales.quote_product_snapshots
      WHERE quote_item_id = $10
      RETURNING id
    `,
    [
      replacementQuoteItemId,
      asNumber(revised.calculation.rejectionCost),
      revised.totalRateInr,
      revised.totalRateInr,
      productSnapshot(revisedProduct),
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
      ? childRevision.newPrice *
        overrideNumber(override, "conversion_rate", quote.conversion_rate)
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
    newProfitPercent: revised.profit,
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

type EngineeringChangeBomLine = {
  componentItemId: string
  notes?: string | null
  quantity: number
}

type EngineeringChangeDesignPatch = {
  bomLines?: EngineeringChangeBomLine[]
  casting?: number
  description?: string
  dieCode?: string | null
  itemType?: string
  materialGradeId?: string | null
  productionType?: string | null
  remarks?: string | null
  rodSize?: string | null
  rodTypeId?: string | null
  weight100Pcs?: number
}

type EngineeringChangeProductCostingPatch = {
  alloyPremium?: number
  annealing?: number
  assemblyOperationCost?: number
  buffing?: number
  burningLossPercent?: number
  checking?: number
  deburring?: number
  directPurchasePricePerKg?: number
  directPurchasePricePerPiece?: number
  extrusionCost?: number
  forgingCost?: number
  machiningCost?: number
  marking?: number
  overheadCost?: number
  piecesPerKg?: number
  plating?: number
  pricingMethod?: string
  productCostInr?: number
  rejectionPercent?: number
  sealant?: number
  washing?: number
}

const designPatchColumns: Record<
  Exclude<keyof EngineeringChangeDesignPatch, "bomLines">,
  string
> = {
  casting: "casting",
  description: "description",
  dieCode: "die_code",
  itemType: "item_type",
  materialGradeId: "material_grade_id",
  productionType: "production_type",
  remarks: "remarks",
  rodSize: "rod_size",
  rodTypeId: "rod_type_id",
  weight100Pcs: "weight_100_pcs",
}

const productCostingPatchColumns: Record<
  keyof EngineeringChangeProductCostingPatch,
  string
> = {
  alloyPremium: "alloy_premium",
  annealing: "annealing",
  assemblyOperationCost: "assembly_operation_cost",
  buffing: "buffing",
  burningLossPercent: "burning_loss_percent",
  checking: "checking",
  deburring: "deburring",
  directPurchasePricePerKg: "direct_purchase_price_per_kg",
  directPurchasePricePerPiece: "direct_purchase_price_per_piece",
  extrusionCost: "extrusion_cost",
  forgingCost: "forging_cost",
  machiningCost: "machining_cost",
  marking: "marking",
  overheadCost: "overhead_cost",
  piecesPerKg: "pieces_per_kg",
  plating: "plating",
  pricingMethod: "pricing_method",
  productCostInr: "product_cost_inr",
  rejectionPercent: "rejection_percent",
  sealant: "sealant",
  washing: "washing",
}

async function applyAllowlistedItemPatch(
  client: PoolClient,
  itemId: string,
  patch: Record<string, unknown>,
  columns: Record<string, string>,
  actorUserId?: string | null
) {
  const entries = Object.entries(patch).filter(
    ([key, value]) => key in columns && value !== undefined
  )
  if (!entries.length) return
  const assignments = entries.map(
    ([key], index) => `${columns[key]} = $${index + 1}`
  )
  const values = entries.map(([, value]) => value)
  await client.query(
    `
      UPDATE catalog.items
      SET ${assignments.join(", ")}, updated_by_user_id = $${values.length + 1},
        updated_at = now(), row_version = row_version + 1
      WHERE id = $${values.length + 2}
    `,
    [...values, actorUserId ?? null, itemId]
  )
}

async function itemAndBomEvidence(client: PoolClient, itemId: string) {
  const [item, bom] = await Promise.all([
    client.query<Record<string, unknown>>(
      "SELECT * FROM catalog.items WHERE id = $1",
      [itemId]
    ),
    client.query<{
      component_item_id: string
      component_uid: string
      notes: string | null
      quantity: string
      sequence: number
    }>(
      `
        SELECT line.component_item_id, component.uid AS component_uid,
          line.quantity::text, line.notes, line.sequence
        FROM catalog.bom_lines line
        JOIN catalog.items component ON component.id = line.component_item_id
        WHERE line.parent_item_id = $1
        ORDER BY line.sequence, line.created_at, line.id
      `,
      [itemId]
    ),
  ])
  return {
    bomLines: bom.rows.map((line) => ({
      componentItemId: line.component_item_id,
      componentUid: line.component_uid,
      notes: line.notes,
      quantity: asNumber(line.quantity),
      sequence: line.sequence,
    })),
    item: item.rows[0] ?? {},
  }
}

async function replaceEngineeringChangeBom(
  client: PoolClient,
  input: {
    actorUserId?: string | null
    bomLines: EngineeringChangeBomLine[]
    itemId: string
    organizationId: string
  }
) {
  const parent = await getProduct(client, input.itemId, true)
  if (!["Package", "Assembly"].includes(parent.item_type)) {
    throw new Error("Only Package or Assembly products can have an ECN BOM.")
  }
  const seen = new Set<string>()
  for (const [sequence, line] of input.bomLines.entries()) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new Error("ECN BOM quantity must be greater than zero.")
    }
    if (
      line.componentItemId === input.itemId ||
      seen.has(line.componentItemId)
    ) {
      throw new Error(
        "ECN BOM components must be unique and cannot be self-referential."
      )
    }
    seen.add(line.componentItemId)
    const component = await client.query<{ id: string }>(
      "SELECT id FROM catalog.items WHERE id = $1 AND organization_id = $2",
      [line.componentItemId, input.organizationId]
    )
    if (!component.rows[0]) {
      throw new Error("ECN BOM component is outside this organization.")
    }
    const cycle = await client.query(
      `
        WITH RECURSIVE descendants AS (
          SELECT component_item_id
          FROM catalog.bom_lines
          WHERE parent_item_id = $1
          UNION
          SELECT line.component_item_id
          FROM descendants
          JOIN catalog.bom_lines line
            ON line.parent_item_id = descendants.component_item_id
        )
        SELECT 1 FROM descendants WHERE component_item_id = $2 LIMIT 1
      `,
      [line.componentItemId, input.itemId]
    )
    if (cycle.rows[0]) {
      throw new Error("ECN BOM change would create a cycle.")
    }
    input.bomLines[sequence] = line
  }
  await client.query(
    "DELETE FROM catalog.bom_lines WHERE parent_item_id = $1",
    [input.itemId]
  )
  for (const [sequence, line] of input.bomLines.entries()) {
    await client.query(
      `
        INSERT INTO catalog.bom_lines (
          organization_id, parent_item_id, component_item_id, quantity, notes,
          sequence, created_by_user_id, updated_by_user_id, source_system,
          source_table, source_id, source_payload
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $7, 'mrm-dashboard',
          'engineering_change_bom_lines', $8, $9
        )
      `,
      [
        input.organizationId,
        input.itemId,
        line.componentItemId,
        line.quantity,
        line.notes ?? null,
        sequence,
        input.actorUserId ?? null,
        randomUUID(),
        { engineeringChange: true },
      ]
    )
  }
}

async function activeAffectedQuoteIds(
  client: PoolClient,
  itemId: string,
  organizationId: string
) {
  const result = await client.query<{ quote_item_id: string }>(
    `
      WITH RECURSIVE quote_tree AS (
        SELECT root.id AS root_quote_item_id, root.id AS quote_item_id,
          root.item_id
        FROM sales.quote_items root
        WHERE root.organization_id = $2 AND root.is_active
          AND root.status IN ('Sent', 'Accepted')
          AND NULLIF(btrim(root.customer_part_code), '') IS NOT NULL
        UNION
        SELECT quote_tree.root_quote_item_id,
          component.child_quote_item_id, component.component_item_id
        FROM quote_tree
        JOIN sales.quote_product_snapshots snapshot
          ON snapshot.quote_item_id = quote_tree.quote_item_id
        JOIN sales.quote_package_components component
          ON component.quote_product_snapshot_id = snapshot.id
        WHERE component.child_quote_item_id IS NOT NULL
      )
      SELECT DISTINCT root_quote_item_id AS quote_item_id
      FROM quote_tree
      WHERE item_id = $1
      ORDER BY root_quote_item_id
    `,
    [itemId, organizationId]
  )
  return result.rows.map((row) => row.quote_item_id)
}

async function collectAffectedQuotePath(
  client: PoolClient,
  rootQuoteItemId: string,
  affectedItemId: string,
  depth = 0,
  visiting = new Set<string>()
): Promise<{ affected: Set<string>; containsAffectedItem: boolean }> {
  if (depth > 20) {
    throw new Error("ECN quote tree exceeds the supported depth of 20.")
  }
  if (visiting.has(rootQuoteItemId)) {
    throw new Error("ECN quote tree contains a cycle.")
  }
  const nextVisiting = new Set(visiting)
  nextVisiting.add(rootQuoteItemId)
  const quote = await getQuote(client, rootQuoteItemId)
  const affected = new Set<string>()
  let containsAffectedItem = quote.item_id === affectedItemId
  for (const component of await getComponents(client, rootQuoteItemId)) {
    if (!component.child_quote_item_id) continue
    const child = await collectAffectedQuotePath(
      client,
      component.child_quote_item_id,
      affectedItemId,
      depth + 1,
      nextVisiting
    )
    if (child.containsAffectedItem) {
      containsAffectedItem = true
      for (const id of child.affected) affected.add(id)
    }
  }
  if (containsAffectedItem) affected.add(rootQuoteItemId)
  return { affected, containsAffectedItem }
}

async function previewRevisedQuote(
  client: PoolClient,
  input: {
    affectedQuoteIds: Set<string>
    cache: Map<string, { newPrice: number; newProfitPercent: number }>
    overrides: Map<string, QuoteOverride>
    quoteItemId: string
    visiting?: Set<string>
  }
): Promise<{ newPrice: number; newProfitPercent: number }> {
  const cached = input.cache.get(input.quoteItemId)
  if (cached) return cached
  const visiting = input.visiting ?? new Set<string>()
  if (visiting.has(input.quoteItemId)) {
    throw new Error("Quote package cycle detected during ECN preview.")
  }
  const nextVisiting = new Set(visiting)
  nextVisiting.add(input.quoteItemId)
  const quote = await getQuote(client, input.quoteItemId)
  const product = await getProduct(client, quote.item_id)
  const components = await getComponents(client, input.quoteItemId)
  const revisedChildren = new Map<string, RevisedQuote>()
  for (const component of components) {
    if (
      component.child_quote_item_id &&
      input.affectedQuoteIds.has(component.child_quote_item_id)
    ) {
      const child = await previewRevisedQuote(client, {
        ...input,
        quoteItemId: component.child_quote_item_id,
        visiting: nextVisiting,
      })
      revisedChildren.set(component.child_quote_item_id, {
        ...child,
        replacementQuoteItemId: component.child_quote_item_id,
      })
    }
  }
  const revised = revisedCalculation(
    quote,
    product,
    components,
    revisedChildren,
    input.overrides.get(input.quoteItemId)
  )
  const result = {
    newPrice: revised.totalRateUsd,
    newProfitPercent: revised.profit,
  }
  input.cache.set(input.quoteItemId, result)
  return result
}

export function createCommercialRevisionsRepository(options: RepositoryOptions) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

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
            count(DISTINCT change.stage_group_id)::text AS change_count,
            count(DISTINCT change.replacement_quote_item_id)::text
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

    async listBulkPriceRevisionStages(bulkPriceRevisionId: string) {
      const result = await pool.query<{
        field_label: string
        field_name: string
        new_value: string
        notes: string | null
        preview_rows: Array<{
          newPrice: number
          oldPrice: number
          quoteItemId: string
        }>
        selected_count: number
        skipped_count: number
        stage_group_id: string
      }>(
        `
          SELECT change.stage_group_id, change.field_name,
            change.field_label, change.new_value::text,
            max(change.selected_count)::integer AS selected_count,
            max(change.skipped_count)::integer AS skipped_count,
            max(change.notes) AS notes,
            jsonb_agg(change.preview_json ORDER BY change.created_at, change.id)
              AS preview_rows
          FROM sales.bulk_price_revision_changes change
          WHERE change.bulk_price_revision_id = $1
            AND change.replacement_quote_item_id IS NULL
          GROUP BY change.stage_group_id, change.field_name,
            change.field_label, change.new_value
          ORDER BY min(change.created_at), change.stage_group_id
        `,
        [bulkPriceRevisionId]
      )
      return result.rows.map((row) => ({
        fieldLabel: row.field_label,
        fieldName: row.field_name,
        newValue: asNumber(row.new_value),
        notes: row.notes,
        previewRows: row.preview_rows,
        selectedCount: row.selected_count,
        skippedCount: row.skipped_count,
        stageGroupId: row.stage_group_id,
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
        item_type: string
        item_uid: string
        reason: string
        status: string
      }>(
        `
          SELECT ecn.id, ecn.ecn_number, ecn.item_id, ecn.status,
            ecn.reason, ecn.effective_on::text, item.uid AS item_uid,
            item.description, item.item_type,
            count(decision.id)::text AS decision_count
          FROM sales.engineering_change_notes ecn
          JOIN core.organizations organization
            ON organization.id = ecn.organization_id
          JOIN catalog.items item ON item.id = ecn.item_id
          LEFT JOIN sales.engineering_change_decisions decision
            ON decision.engineering_change_note_id = ecn.id
          WHERE lower(organization.code) = lower($1)
          GROUP BY ecn.id, item.uid, item.description, item.item_type
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
        itemType: row.item_type,
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
          SELECT register.*
          FROM (
            SELECT correction.id, correction.target_table,
              correction.target_id::text AS target_id,
              correction.requested_action, correction.reason,
              correction.status, correction.created_at
            FROM audit.pricing_correction_requests correction
            JOIN core.organizations organization
              ON organization.id = correction.organization_id
            WHERE lower(organization.code) = lower($1)

            UNION ALL

            SELECT event.id, event.target_table, event.target_id::text,
              coalesce(
                event.metadata->>'correctionType',
                event.event_type
              ) AS requested_action,
              coalesce(
                event.reason,
                event.metadata->>'remarks',
                'Workflow correction'
              ) AS reason,
              'Applied' AS status, event.occurred_at AS created_at
            FROM audit.events event
            JOIN core.organizations organization
              ON organization.id = event.organization_id
            WHERE lower(organization.code) = lower($1)
              AND event.event_type IN (
                'pricing_correction.design_costing_handoff_reversed',
                'pricing_correction.product_entry_reversed',
                'enquiry_item.technical_revision_matched'
              )
          ) register
          ORDER BY register.created_at DESC, register.id DESC
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
          company_name: string
          description: string
          design_task_id: string
          design_status: string
          enquiry_number: string
          item_type: string
          line_number: number
          next_stage_status: string
          part: string | null
          part_reference: string | null
          quote_count: string
        }>(
          `
            SELECT design.id AS design_task_id, enquiry.enquiry_number,
              enquiry_item.line_number,
              coalesce(design.quoted_part_uid, design.internal_drawing_no)
                AS part_reference,
              customer.company_name, enquiry_item.customer_part_code AS part,
              enquiry_item.description, design.design_status,
              design.next_stage_status, design.item_type,
              count(quote.id)::text AS quote_count
            FROM sales.design_tasks design
            JOIN sales.enquiry_items enquiry_item
              ON enquiry_item.id = design.enquiry_item_id
            JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
            JOIN sales.customers customer ON customer.id = enquiry.customer_id
            LEFT JOIN sales.quote_items quote
              ON quote.enquiry_item_id = enquiry_item.id
            WHERE design.organization_id = $1
              AND design.design_status IN ('Design Complete', 'Not Required')
              AND design.next_stage_status = 'Started'
            GROUP BY design.id, enquiry.enquiry_number,
              enquiry_item.line_number, customer.company_name,
              enquiry_item.customer_part_code, enquiry_item.description
            ORDER BY enquiry.enquiry_number, enquiry_item.line_number,
              design.id
          `,
          [organizationId]
        ),
        pool.query<{
          description: string
          id: string
          item_type: string
          component_bom_count: string
          design_uid_reference_count: string
          matched_design_count: string
          parent_bom_count: string
          quote_count: string
          uid: string
        }>(
          `
            SELECT item.id, item.uid, item.description, item.item_type,
              (SELECT count(*)::text FROM sales.quote_items quote
                WHERE quote.item_id = item.id) AS quote_count,
              (SELECT count(*)::text FROM catalog.bom_lines bom
                WHERE bom.parent_item_id = item.id) AS parent_bom_count,
              (SELECT count(*)::text FROM catalog.bom_lines bom
                WHERE bom.component_item_id = item.id) AS component_bom_count,
              (SELECT count(*)::text FROM sales.design_tasks design
                WHERE design.matched_product_id = item.id)
                AS matched_design_count,
              (SELECT count(*)::text FROM sales.design_tasks design
                WHERE coalesce(
                  design.quoted_part_uid,
                  design.internal_drawing_no
                ) = item.uid) AS design_uid_reference_count
            FROM catalog.items item
            WHERE item.organization_id = $1
              AND (item.lifecycle_status = 'Q' OR item.uid_kind = 'QUOTE')
            ORDER BY item.uid, item.id
          `,
          [organizationId]
        ),
      ])
      return {
        designHandoffs: designHandoffs.rows.map((row) => ({
          companyName: row.company_name,
          description: row.description,
          designTaskId: row.design_task_id,
          designStatus: row.design_status,
          enquiryNumber: row.enquiry_number,
          itemType: row.item_type,
          lineNumber: row.line_number,
          nextStageStatus: row.next_stage_status,
          part: row.part,
          partReference: row.part_reference,
          quoteCount: Number(row.quote_count),
        })),
        organizationId,
        products: products.rows.map((row) => ({
          blockerCounts: {
            componentBom: Number(row.component_bom_count),
            designUidReference: Number(row.design_uid_reference_count),
            matchedDesign: Number(row.matched_design_count),
            parentBom: Number(row.parent_bom_count),
            quotes: Number(row.quote_count),
          },
          canReverse:
            Number(row.quote_count) === 0 &&
            Number(row.component_bom_count) === 0 &&
            Number(row.matched_design_count) === 0,
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
        if (!isBulkRevisionField(input.fieldName)) {
          throw new Error("Unsupported bulk revision field.")
        }
        const field = bulkRevisionFields[input.fieldName]
        if (
          row.revision_route === "Product Parameter Bulk Revision" &&
          !productFields.has(input.fieldName)
        ) {
          throw new Error(
            "Product revisions can only stage product-level parameters."
          )
        }
        if (
          row.revision_route === "Customer Parameter Bulk Revision" &&
          !customerFields.has(input.fieldName)
        ) {
          throw new Error(
            "Customer revisions can only stage customer-level parameters."
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
        const eligible = []
        for (const quote of valid.rows) {
          if (
            !lockedBulkProcessFields.has(input.fieldName) ||
            (await quoteAllowsBulkProcessField(
              client,
              quote.id,
              input.fieldName
            ))
          ) {
            eligible.push(quote)
          }
        }
        const skippedCount = valid.rows.length - eligible.length
        if (!eligible.length) {
          throw new Error(
            `${field.label} is not active in any selected product.`
          )
        }
        const stageGroupId = randomUUID()
        const notes =
          skippedCount > 0
            ? [
                asText(input.notes) || null,
                `${skippedCount} selected product(s) were skipped because ${field.label} is not active there.`,
              ]
                .filter(Boolean)
                .join(" ")
            : (input.notes ?? null)
        const createdIds: string[] = []
        for (const quote of eligible) {
          const source = await getQuote(client, quote.id)
          const product = await getProduct(client, source.item_id)
          const components = await getComponents(client, quote.id)
          const override = new Map<string, number>([
            [input.fieldName, input.newValue],
          ])
          const preview = revisedCalculation(
            source,
            product,
            components,
            new Map(),
            override
          )
          const previewJson = {
            newPrice: preview.totalRateUsd,
            oldPrice: asNumber(quote.price),
            quoteItemId: quote.id,
          }
          const created = await client.query<{ id: string }>(
            `
              INSERT INTO sales.bulk_price_revision_changes (
                organization_id, bulk_price_revision_id, prior_quote_item_id,
                old_price, new_price, field_name, field_label, new_value,
                selection_json, selected_count, skipped_count, stage_group_id,
                preview_json, notes, created_by_user_id, source_system,
                source_table, source_id, source_payload
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                $14, $15, 'mrm-dashboard', 'bulk_price_revision_changes',
                $16, $17
              )
              RETURNING id
            `,
            [
              row.organization_id,
              input.bulkPriceRevisionId,
              quote.id,
              quote.price,
              preview.totalRateUsd,
              input.fieldName,
              field.label,
              input.newValue,
              JSON.stringify(eligible.map((row) => row.id)),
              eligible.length,
              skippedCount,
              stageGroupId,
              previewJson,
              notes,
              input.actorUserId ?? null,
              randomUUID(),
              { ...input, eligibleQuoteItemIds: eligible.map((row) => row.id) },
            ]
          )
          createdIds.push(created.rows[0]!.id)
        }
        return {
          changeIds: createdIds,
          selectedCount: eligible.length,
          skippedCount,
          stageGroupId,
        }
      })
    },

    async deleteBulkPriceRevisionStage(input: {
      actorUserId?: string | null
      bulkPriceRevisionId: string
      stageGroupId: string
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
        const deleted = await client.query(
          `
            DELETE FROM sales.bulk_price_revision_changes
            WHERE bulk_price_revision_id = $1 AND stage_group_id = $2
              AND replacement_quote_item_id IS NULL
          `,
          [input.bulkPriceRevisionId, input.stageGroupId]
        )
        if (!deleted.rowCount) {
          throw new Error("Staged bulk change was not found.")
        }
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "bulk_price_revision.stage_deleted",
          metadata: {
            deletedCount: deleted.rowCount,
            stageGroupId: input.stageGroupId,
          },
          organizationId: row.organization_id,
          targetId: input.bulkPriceRevisionId,
          targetTable: "bulk_price_revisions",
        })
        return { deletedCount: deleted.rowCount }
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
          if (!isBulkRevisionField(change.field_name)) {
            throw new Error("Unsupported staged bulk revision field.")
          }
          const quoteOverrides =
            overrides.get(change.prior_quote_item_id) ??
            new Map<string, number>()
          quoteOverrides.set(change.field_name, asNumber(change.new_value))
          overrides.set(change.prior_quote_item_id, quoteOverrides)
          const productColumn = productColumnByField[change.field_name]
          if (productFields.has(change.field_name) && productColumn) {
            await client.query(
              `
                UPDATE catalog.items item
                SET ${productColumn} = $1, updated_by_user_id = $2,
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
        let revisionOrder = 0
        for (const [oldQuoteId, revised] of cache) {
          revisionOrder += 1
          const staged = changes.rows.filter(
            (change) => change.prior_quote_item_id === oldQuoteId
          )
          if (staged.length) {
            await client.query(
              `
                UPDATE sales.bulk_price_revision_changes
                SET replacement_quote_item_id = $1, new_price = $2,
                  applied_at = now(), final_quote_item_ids_json = $3,
                  calculation_evidence = $4
                WHERE id = ANY($5::uuid[])
              `,
              [
                revised.replacementQuoteItemId,
                revised.newPrice,
                JSON.stringify(finalIds),
                {
                  propagatedQuoteCount: cache.size,
                  revisionOrder,
                },
                staged.map((change) => change.id),
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
                { propagatedFrom: selectedIds, revisionOrder },
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
      itemPatch: EngineeringChangeDesignPatch
    }) {
      return transaction(pool, async (client) => {
        const ecn = await client.query<{
          affected_quote_item_ids_json: string[]
          item_id: string
          organization_id: string
          status: string
        }>(
          "SELECT organization_id, item_id, status, affected_quote_item_ids_json FROM sales.engineering_change_notes WHERE id = $1 FOR UPDATE",
          [input.engineeringChangeNoteId]
        )
        const row = ecn.rows[0]
        if (!row || row.status !== "Pending Design") {
          throw new Error("Pending-design ECN was not found.")
        }
        await getProduct(client, row.item_id, true)
        const before = await itemAndBomEvidence(client, row.item_id)
        const { bomLines, ...itemPatch } = input.itemPatch
        await applyAllowlistedItemPatch(
          client,
          row.item_id,
          itemPatch,
          designPatchColumns,
          input.actorUserId
        )
        if (bomLines) {
          await replaceEngineeringChangeBom(client, {
            actorUserId: input.actorUserId,
            bomLines,
            itemId: row.item_id,
            organizationId: row.organization_id,
          })
        }
        const after = await itemAndBomEvidence(client, row.item_id)
        await client.query(
          `
            UPDATE sales.engineering_change_notes
            SET status = 'Pending Product Costing', design_before = $1,
              design_after = $2, design_completed_at = now(),
              updated_by_user_id = $3, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $4
          `,
          [
            before,
            after,
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
        return {
          id: input.engineeringChangeNoteId,
          status: "Pending Product Costing",
        }
      })
    },

    async completeEngineeringChangeProductCosting(input: {
      actorUserId?: string | null
      engineeringChangeNoteId: string
      itemPatch: EngineeringChangeProductCostingPatch
    }) {
      return transaction(pool, async (client) => {
        const ecn = await client.query<{
          affected_quote_item_ids_json: string[]
          item_id: string
          organization_id: string
          status: string
        }>(
          "SELECT organization_id, item_id, status, affected_quote_item_ids_json FROM sales.engineering_change_notes WHERE id = $1 FOR UPDATE",
          [input.engineeringChangeNoteId]
        )
        const row = ecn.rows[0]
        if (!row || row.status !== "Pending Product Costing") {
          throw new Error("Pending-product-costing ECN was not found.")
        }
        const before = await itemAndBomEvidence(client, row.item_id)
        await applyAllowlistedItemPatch(
          client,
          row.item_id,
          input.itemPatch,
          productCostingPatchColumns,
          input.actorUserId
        )
        const after = await itemAndBomEvidence(client, row.item_id)
        const affectedQuoteItemIds = await activeAffectedQuoteIds(
          client,
          row.item_id,
          row.organization_id
        )
        const status =
          affectedQuoteItemIds.length > 0 ? "Pending Costing" : "Completed"
        await client.query(
          `
            UPDATE sales.engineering_change_notes
            SET status = $1, product_costing_before = $2,
              product_costing_after = $3, product_costing_completed_at = now(),
              affected_quote_item_ids_json = $4,
              completed_at = CASE WHEN $1 = 'Completed' THEN now() ELSE NULL END,
              updated_by_user_id = $5, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $6
          `,
          [
            status,
            before,
            after,
            JSON.stringify(affectedQuoteItemIds),
            input.actorUserId ?? null,
            input.engineeringChangeNoteId,
          ]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "engineering_change.product_costing_completed",
          metadata: { affectedPriceCount: affectedQuoteItemIds.length, status },
          organizationId: row.organization_id,
          targetId: input.engineeringChangeNoteId,
          targetTable: "engineering_change_notes",
        })
        return {
          affectedPriceCount: affectedQuoteItemIds.length,
          id: input.engineeringChangeNoteId,
          status,
        }
      })
    },

    async listEngineeringChangeAffectedPrices(engineeringChangeNoteId: string) {
      const client = await pool.connect()
      try {
        const ecn = await client.query<{
          affected_quote_item_ids_json: string[]
          item_id: string
          organization_id: string
        }>(
          `
            SELECT organization_id, item_id, affected_quote_item_ids_json
            FROM sales.engineering_change_notes
            WHERE id = $1
          `,
          [engineeringChangeNoteId]
        )
        const row = ecn.rows[0]
        if (!row) return []
        const affectedQuoteItemIds = row.affected_quote_item_ids_json.length
          ? row.affected_quote_item_ids_json
          : await activeAffectedQuoteIds(
              client,
              row.item_id,
              row.organization_id
            )
        if (!affectedQuoteItemIds.length) return []
        const prices = await client.query<{
          approved_price_usd: string
          customer_part_code: string
          decision: string | null
          new_price: string | null
          new_profit_percent: string | null
          quote_item_id: string
        }>(
          `
            SELECT quote.id AS quote_item_id, quote.customer_part_code,
              quote.approved_price_usd, decision.decision,
              decision.new_price, decision.new_profit_percent
            FROM sales.quote_items quote
            LEFT JOIN sales.engineering_change_decisions decision
              ON decision.engineering_change_note_id = $1
             AND decision.source_quote_item_id = quote.id
            WHERE quote.id = ANY($2::uuid[])
            ORDER BY quote.customer_part_code, quote.id
          `,
          [engineeringChangeNoteId, affectedQuoteItemIds]
        )
        const result = []
        for (const price of prices.rows) {
          const path = await collectAffectedQuotePath(
            client,
            price.quote_item_id,
            row.item_id
          )
          const revise = await previewRevisedQuote(client, {
            affectedQuoteIds: path.affected,
            cache: new Map(),
            overrides: new Map(),
            quoteItemId: price.quote_item_id,
          })
          const keepOverrides = new Map<string, QuoteOverride>([
            [
              price.quote_item_id,
              new Map([
                ["__target_price_usd", asNumber(price.approved_price_usd)],
              ]),
            ],
          ])
          const keep = await previewRevisedQuote(client, {
            affectedQuoteIds: path.affected,
            cache: new Map(),
            overrides: keepOverrides,
            quoteItemId: price.quote_item_id,
          })
          result.push({
            approvedPriceUsd: asNumber(price.approved_price_usd),
            customerPartCode: price.customer_part_code,
            decision: price.decision,
            keepSamePriceUsd: asNumber(price.approved_price_usd),
            keepSameProfitPercent: keep.newProfitPercent,
            newPrice:
              price.new_price === null ? null : asNumber(price.new_price),
            newProfitPercent:
              price.new_profit_percent === null
                ? null
                : asNumber(price.new_profit_percent),
            quoteItemId: price.quote_item_id,
            revisePriceUsd: revise.newPrice,
            reviseProfitPercent: revise.newProfitPercent,
          })
        }
        return result
      } finally {
        client.release()
      }
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
          affected_quote_item_ids_json: string[]
          item_id: string
          organization_id: string
          status: string
        }>(
          "SELECT organization_id, item_id, status, affected_quote_item_ids_json FROM sales.engineering_change_notes WHERE id = $1 FOR UPDATE",
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
        if (
          !row.affected_quote_item_ids_json.includes(input.sourceQuoteItemId)
        ) {
          throw new Error("This price is outside the ECN affected set.")
        }
        const source = await getQuote(client, input.sourceQuoteItemId, true)
        const path = await collectAffectedQuotePath(
          client,
          input.sourceQuoteItemId,
          row.item_id
        )
        if (!path.containsAffectedItem) {
          throw new Error("The affected ECN product is absent from this price.")
        }
        const overrides = new Map<string, QuoteOverride>()
        if (input.decision === "Keep Price Same") {
          overrides.set(
            input.sourceQuoteItemId,
            new Map([
              ["__target_price_usd", asNumber(source.approved_price_usd)],
            ])
          )
        }
        const cache = new Map<string, RevisedQuote>()
        const revised = await createRevisedQuote(client, {
          actorUserId: input.actorUserId,
          affectedQuoteIds: path.affected,
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
              profitPercent: revised.newProfitPercent,
            },
            input.actorUserId ?? null,
            input.sourceQuoteItemId,
            revised.replacementQuoteItemId,
            source.approved_price_usd,
            revised.newPrice,
            source.profit_percent,
            revised.newProfitPercent,
            input.notes ?? null,
            randomUUID(),
            input,
          ]
        )
        const decisions = await client.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM sales.engineering_change_decisions WHERE engineering_change_note_id = $1",
          [input.engineeringChangeNoteId]
        )
        const completed =
          Number(decisions.rows[0]!.count) >=
          row.affected_quote_item_ids_json.length
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
          newProfitPercent: revised.newProfitPercent,
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
          throw new Error(
            "Only an unused quoted product entry can be reversed."
          )
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
          throw new Error(
            "Historical correction target is outside this organization."
          )
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
