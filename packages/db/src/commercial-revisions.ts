import { randomUUID } from "node:crypto"

import type { PoolClient } from "pg"

import { selectorSearchTerm } from "./commercial-bounds"
import {
  assertApplicableProcessPrices,
  classifyDesignCostImpact,
  designProcessSelection,
  engineeringChangeStatusAfterApproval,
  processFieldIsApplicable,
  processesRequiredFromPayload,
} from "./design-control-domain"
import {
  repositoryPool,
  withTransaction as transaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"
import {
  calculateCosting,
  calculatePackageRevisionCostingFromBase,
  calculateProductBaseCost,
  calculateProductProcessCost,
  calculateStoredProductRevisionCosting,
  isForgingCostApplicable,
} from "./pricing-calculation"

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
  machining_price_per_piece: string
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
  source_payload: Record<string, unknown>
  uid: string
  washing: string
  weight_100_pcs: string
}

type QuoteOverride = Map<string, number>

const productBulkPriceDecisionField = "customer_price_decision"
const bulkRevisionTableLimit = 10_000

type RevisedQuote = {
  newPrice: number
  newProfitPercent: number
  replacementQuoteItemId: string
}

type QuoteGraph = {
  componentsByQuoteId: Map<string, ComponentRow[]>
  nextRevisionByQuoteId: Map<string, number>
  productsById: Map<string, ProductRow>
  quotesById: Map<string, QuoteRow>
}

export const bulkRevisionFields = {
  casting: {
    label: "Blank Piece Weight ( gm )",
    route: "product",
    valueType: "number",
  },
  rejection_percent: {
    label: "Rejection %",
    route: "product",
    valueType: "percent",
  },
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
  "rejection_percent",
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
  rejection_percent: "rejection_percent",
  sealant: "sealant",
  washing: "washing",
}

const lockedBulkProcessFields = new Set<BulkRevisionFieldName>([
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
])

const productProcessCostFields = new Set<BulkRevisionFieldName>([
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

function isBulkRevisionField(value: string): value is BulkRevisionFieldName {
  return value in bulkRevisionFields
}

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const asText = (value: unknown) =>
  typeof value === "string" ? value.trim() : ""

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

async function collectQuoteAncestors(
  client: PoolClient,
  selectedQuoteIds: string[]
) {
  if (!selectedQuoteIds.length) return new Set<string>()
  const result = await client.query<{ id: string }>(
    `
      WITH RECURSIVE affected(id) AS (
        SELECT unnest($1::uuid[])
        UNION
        SELECT parent.id
        FROM affected child
        JOIN sales.quote_package_components component
          ON component.child_quote_item_id = child.id
        JOIN sales.quote_product_snapshots snapshot
          ON snapshot.id = component.quote_product_snapshot_id
        JOIN sales.quote_items parent ON parent.id = snapshot.quote_item_id
        WHERE parent.is_active AND parent.status IN ('Sent', 'Accepted')
      )
      SELECT DISTINCT id FROM affected
    `,
    [selectedQuoteIds]
  )
  return new Set(result.rows.map((row) => row.id))
}

async function topLevelAffectedQuoteIds(
  client: PoolClient,
  affectedQuoteIds: Set<string>
) {
  const ids = [...affectedQuoteIds]
  if (!ids.length) return []
  const nested = await client.query<{ child_id: string }>(
    `
      SELECT DISTINCT component.child_quote_item_id AS child_id
      FROM sales.quote_package_components component
      JOIN sales.quote_product_snapshots snapshot
        ON snapshot.id = component.quote_product_snapshot_id
      JOIN sales.quote_items parent ON parent.id = snapshot.quote_item_id
      WHERE component.child_quote_item_id = ANY($1::uuid[])
        AND parent.id = ANY($1::uuid[])
        AND parent.is_active AND parent.status IN ('Sent', 'Accepted')
    `,
    [ids]
  )
  const nestedIds = new Set(nested.rows.map((row) => row.child_id))
  return ids.filter((id) => !nestedIds.has(id))
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
    machiningPricePerPiece: asNumber(product.machining_price_per_piece),
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
    if (fieldName === "__product_cost_inr") {
      revised.product_cost_inr = String(value)
      continue
    }
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

async function quoteAllowsBulkProcessField(
  client: PoolClient,
  quoteItemId: string,
  fieldName: BulkRevisionFieldName
) {
  const column = productColumnByField[fieldName]
  if (!column) return false
  const result = await client.query<{
    item_type: string
    source_payload: Record<string, unknown>
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
      SELECT item.item_type, item.source_payload
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
    return processFieldIsApplicable(
      fieldName,
      designProcessSelection({
        processesRequired: processesRequiredFromPayload(row.source_payload),
      })
    )
  })
}

function productAllowsBulkProcessField(
  product: ProductRow,
  fieldName: BulkRevisionFieldName
) {
  const column = productColumnByField[fieldName]
  if (!column) return false
  if (
    fieldName === "assembly_operation_cost" &&
    !["Package", "Assembly"].includes(product.item_type)
  ) {
    return false
  }
  return processFieldIsApplicable(
    fieldName,
    designProcessSelection({
      processesRequired: processesRequiredFromPayload(product.source_payload),
    })
  )
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
    const storedProcessBase = asNumber(
      quote.calculation_json.packageProcessCostPerPiece,
      asNumber(quote.calculation_json.totalA)
    )
    const hasProductProcessOverride = [...productProcessCostFields].some(
      (fieldName) => override?.has(fieldName)
    )
    const process = calculateProductProcessCost(productProcessInput(product))
    const processBase = hasProductProcessOverride
      ? process.processCostPerPiece
      : storedProcessBase
    const storedPiecesPerKg = asNumber(
      quote.snapshot_product_json.piecesPerKg,
      asNumber(product.pieces_per_kg, process.piecesPerKg)
    )
    const piecesPerKg = hasProductProcessOverride
      ? process.piecesPerKg
      : storedPiecesPerKg
    const rejectionPercent = asNumber(product.rejection_percent)
    const packageCosting = calculatePackageRevisionCostingFromBase({
      childQuoteTotal,
      conversionRate,
      packingCostPerKg: overrideNumber(
        override,
        "packing_cost",
        quote.packing_cost
      ),
      piecesPerKg,
      processCostPerPiece: processBase,
      profitPercent: profit,
      rejectionPercent,
      shippingCostPerKg: overrideNumber(
        override,
        "shipping_cost",
        quote.shipping_cost
      ),
      targetPriceUsd,
    })
    const packageBeforeRejection = childQuoteTotal + processBase
    return {
      calculation: {
        ...calculation,
        ...packageCosting,
        packageBeforeRejection,
        totalRodsCost: childQuoteTotal,
      },
      profit: packageCosting.profitPercent,
      totalRateInr: packageCosting.totalRateInr,
      totalRateUsd: packageCosting.rateUsd,
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
          fieldName === "ext_cost" ? "extrusion_cost" : fieldName
        const current =
          fieldName === "overhead_cost"
            ? asNumber(quote.snapshot_product_json.overheadCost)
            : asNumber(
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

  const directPurchaseCost = asNumber(
    product.direct_purchase_price_per_piece
  )
  const isDirectPurchase =
    product.pricing_method === "Direct Purchase" && directPurchaseCost > 0
  const assembledPartInr = asNumber(quote.assembled_part_inr)
  if (isDirectPurchase) {
    const direct = calculateStoredProductRevisionCosting({
      baseCostPerPiece: directPurchaseCost,
      conversionRate,
      packingCostPerKg: overrideNumber(
        override,
        "packing_cost",
        quote.packing_cost
      ),
      piecesPerKg: asNumber(product.pieces_per_kg),
      profitPercent: profit,
      rejectionPercent: asNumber(product.rejection_percent),
      shippingCostPerKg: overrideNumber(
        override,
        "shipping_cost",
        quote.shipping_cost
      ),
      targetPriceUsd,
    })
    return {
      calculation: {
        ...calculation,
        ...direct,
        totalRateInr: direct.rateInr,
      },
      profit: direct.profitPercent,
      totalRateInr: direct.rateInr,
      totalRateUsd: direct.rateUsd,
    }
  }
  const base = calculateCosting(
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
      forgingCost: !isForgingCostApplicable(
        typeof product.source_payload.productType === "string"
          ? product.source_payload.productType
          : product.production_type
      )
        ? 0
        : asNumber(product.forging_cost),
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
  const piecesPerKg = asNumber(base.piecesPerKg)
  const profitBasisPerPiece =
    piecesPerKg > 0 ? asNumber(base.totalA) / piecesPerKg : 0
  if (targetPriceUsd !== undefined && profitBasisPerPiece > 0) {
    revisedProfit =
      (targetPriceUsd * conversionRate -
        assembledPartInr -
        profitBasisPerPiece) /
      profitBasisPerPiece
  }
  const profitB = asNumber(base.totalA) * revisedProfit
  const totalAPlusB = asNumber(base.totalA) + profitB
  const rateInr = piecesPerKg > 0 ? totalAPlusB / piecesPerKg : 0
  const totalRateInr = rateInr + assembledPartInr
  return {
    calculation: {
      ...calculation,
      ...base,
      profitB,
      rateInr,
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
    quoteGraph?: QuoteGraph
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

  const quote = input.quoteGraph
    ? quoteFromGraph(input.quoteGraph, input.quoteItemId)
    : await getQuote(client, input.quoteItemId, true)
  const product = input.quoteGraph
    ? input.quoteGraph.productsById.get(quote.item_id)
    : await getProduct(client, quote.item_id)
  if (!product) throw new Error("Quote product was not found.")
  const components = input.quoteGraph
    ? (input.quoteGraph.componentsByQuoteId.get(input.quoteItemId) ?? [])
    : await getComponents(client, input.quoteItemId)
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
  const nextRevision = input.quoteGraph
    ? input.quoteGraph.nextRevisionByQuoteId.get(quote.id)
    : (
        await client.query<{ revision: number }>(
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
      ).rows[0]!.revision
  if (nextRevision === undefined) {
    throw new Error("Quote revision number was not loaded.")
  }
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
      nextRevision,
      revised.totalRateUsd,
      overrideNumber(override, "scrap_rate", quote.scrap_rate),
      asNumber(revisedProduct.alloy_premium),
      asNumber(revisedProduct.extrusion_cost),
      asNumber(revisedProduct.forging_cost),
      overrideNumber(override, "packing_cost", quote.packing_cost),
      overrideNumber(override, "shipping_cost", quote.shipping_cost),
      0,
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
        COALESCE(($5::jsonb->>'overheadCost')::numeric, 0), $2, $3, $4,
        calculation_version, $5,
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
  designDetails?: Record<string, unknown>
  description?: string
  dieCode?: string | null
  itemType?: string
  materialGradeId?: string | null
  productionType?: string | null
  remarks?: string | null
  rodSize?: string | null
  rodTypeId?: string | null
  sourcePayloadPatch?: Record<string, unknown>
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
  Exclude<
    keyof EngineeringChangeDesignPatch,
    "bomLines" | "designDetails" | "sourcePayloadPatch"
  >,
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
      component_design_revision: string | null
      component_item_id: string
      component_uid: string
      notes: string | null
      quantity: string
      sequence: number
    }>(
      `
        SELECT line.component_item_id, component.uid AS component_uid,
          line.quantity::text, line.notes, line.sequence,
          component_design.revision_label AS component_design_revision
        FROM catalog.bom_lines line
        JOIN catalog.items component ON component.id = line.component_item_id
        LEFT JOIN catalog.product_design_revisions component_design
          ON component_design.item_id = component.id
          AND component_design.is_current
        WHERE line.parent_item_id = $1
        ORDER BY line.sequence, line.created_at, line.id
      `,
      [itemId]
    ),
  ])
  return {
    bomLines: bom.rows.map((line) => ({
      componentItemId: line.component_item_id,
      componentDesignRevision: line.component_design_revision,
      componentUid: line.component_uid,
      notes: line.notes,
      quantity: asNumber(line.quantity),
      sequence: line.sequence,
    })),
    item: item.rows[0] ?? {},
  }
}

type AffectedParentDesignRevision = {
  revisionLabel: string
  uid: string
  weight: number
}

async function releaseAffectedParentDesignRevisions(
  client: PoolClient,
  input: {
    actorUserId?: string | null
    changedItemId: string
    changedRevisionLabel: string
    effectiveOn: string | null
    engineeringChangeNoteId: string
    organizationId: string
  }
): Promise<AffectedParentDesignRevision[]> {
  const ancestors = await client.query<{
    depth: number
    item_id: string
    uid: string
  }>(
    `
      WITH RECURSIVE ancestors AS (
        SELECT line.parent_item_id AS item_id, 1 AS depth,
          ARRAY[$1::uuid, line.parent_item_id] AS path
        FROM catalog.bom_lines line
        WHERE line.component_item_id = $1
        UNION ALL
        SELECT line.parent_item_id, ancestors.depth + 1,
          ancestors.path || line.parent_item_id
        FROM ancestors
        JOIN catalog.bom_lines line
          ON line.component_item_id = ancestors.item_id
        WHERE NOT line.parent_item_id = ANY(ancestors.path)
      )
      SELECT item.id AS item_id, item.uid, max(ancestors.depth)::integer AS depth
      FROM ancestors
      JOIN catalog.items item ON item.id = ancestors.item_id
      WHERE item.organization_id = $2
        AND item.item_type IN ('Package', 'Assembly')
        AND item.lifecycle_status = 'P'
      GROUP BY item.id, item.uid
      ORDER BY max(ancestors.depth), item.uid, item.id
    `,
    [input.changedItemId, input.organizationId]
  )
  if (!ancestors.rows.length) return []

  const changedItem = await client.query<{ uid: string }>(
    "SELECT uid FROM catalog.items WHERE id = $1",
    [input.changedItemId]
  )
  const changedUid = changedItem.rows[0]?.uid ?? input.changedItemId
  const released: AffectedParentDesignRevision[] = []

  for (const ancestor of ancestors.rows) {
    const currentResult = await client.query<{
      revision_id: string
      revision_number: number
      weight: string
    }>(
      `SELECT revision.id AS revision_id, revision.revision_number,
         item.weight_100_pcs::text AS weight
       FROM catalog.items item
       JOIN catalog.product_design_revisions revision
         ON revision.item_id = item.id AND revision.is_current
       WHERE item.id = $1 AND item.organization_id = $2
       FOR UPDATE OF item, revision`,
      [ancestor.item_id, input.organizationId]
    )
    const current = currentResult.rows[0]
    if (!current) {
      throw new Error(
        `Current Product Design revision was not found for parent ${ancestor.uid}.`
      )
    }
    const derivedWeightResult = await client.query<{ weight: string }>(
      `SELECT COALESCE(
         sum(line.quantity * component.weight_100_pcs), 0
       )::text AS weight
       FROM catalog.bom_lines line
       JOIN catalog.items component ON component.id = line.component_item_id
       WHERE line.parent_item_id = $1`,
      [ancestor.item_id]
    )
    const weight = asNumber(derivedWeightResult.rows[0]?.weight)
    const revisionNumber = current.revision_number + 1
    const revisionLabel = String(revisionNumber).padStart(2, "0")
    const reason = `Component ${changedUid} design revision ${input.changedRevisionLabel} released; ${ancestor.uid} weight recalculated from current BOM components.`

    await client.query(
      `UPDATE catalog.product_design_revisions
       SET status = 'Superseded', is_current = false WHERE id = $1`,
      [current.revision_id]
    )
    await client.query(
      `UPDATE catalog.items
       SET weight_100_pcs = $1,
         source_payload = jsonb_set(
           COALESCE(source_payload, '{}'::jsonb),
           '{currentDesignRevision}', to_jsonb($2::text), true
         ),
         updated_by_user_id = $3, updated_at = now(),
         row_version = row_version + 1
       WHERE id = $4`,
      [weight, revisionLabel, input.actorUserId ?? null, ancestor.item_id]
    )
    const evidence = await itemAndBomEvidence(client, ancestor.item_id)
    await client.query(
      `INSERT INTO catalog.product_design_revisions (
         organization_id, item_id, engineering_change_note_id,
         revision_number, revision_label, status, is_current,
         effective_on, change_reason, design_snapshot, bom_snapshot,
         created_by_user_id, approved_at, approved_by_user_id,
         released_at, source_system, source_table, source_id,
         source_payload
       ) VALUES (
         $1, $2, $3, $4, $5, 'Released', true, $6::date, $7, $8, $9,
         $10, now(), $10, now(), 'mrm-dashboard',
         'product_design_revisions', $11, $12
       )`,
      [
        input.organizationId,
        ancestor.item_id,
        input.engineeringChangeNoteId,
        revisionNumber,
        revisionLabel,
        input.effectiveOn,
        reason,
        JSON.stringify(evidence.item),
        JSON.stringify(evidence.bomLines),
        input.actorUserId ?? null,
        randomUUID(),
        JSON.stringify({
          propagatedFrom: {
            itemId: input.changedItemId,
            revisionLabel: input.changedRevisionLabel,
            uid: changedUid,
          },
        }),
      ]
    )
    released.push({ revisionLabel, uid: ancestor.uid, weight })
  }

  return released
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function proposedDesignEvidence(
  before: Awaited<ReturnType<typeof itemAndBomEvidence>>,
  patch: EngineeringChangeDesignPatch
) {
  const item = { ...before.item }
  for (const [key, value] of Object.entries(patch)) {
    const column = (designPatchColumns as Record<string, string>)[key]
    if (column && value !== undefined) item[column] = value
  }
  if (patch.sourcePayloadPatch) {
    item.source_payload = {
      ...record(item.source_payload),
      ...patch.sourcePayloadPatch,
    }
  }
  return {
    bomLines: patch.bomLines ?? before.bomLines,
    designDetails: patch.designDetails ?? {},
    item,
  }
}

function designCostDrivers(
  evidence: {
    bomLines?: Array<Record<string, unknown> | EngineeringChangeBomLine>
    item: Record<string, unknown>
  } & {
    designDetails?: Record<string, unknown>
  }
) {
  const item = evidence.item
  const payload = record(item.source_payload)
  const dossier = {
    ...record(payload.productDesignDossier),
    ...record(evidence.designDetails),
  }
  return {
    bom: (evidence.bomLines ?? []).map((line) => ({
      componentItemId: line.componentItemId,
      quantity: asNumber(line.quantity),
    })),
    casting: asNumber(dossier.casting ?? item.casting),
    category: dossier.category ?? payload.category,
    materialGradeId: dossier.materialGradeId ?? item.material_grade_id,
    processesRequired:
      dossier.processesRequired ?? payload.processesRequired ?? [],
    productType: dossier.productType ?? payload.productType,
    productionType: dossier.productionType ?? item.production_type,
    rodSize: dossier.rodSize ?? item.rod_size,
    rodTypeId: dossier.rodTypeId ?? item.rod_type_id,
    subcategory: dossier.subcategory ?? payload.subcategory,
    weight100Pcs: asNumber(dossier.weight100Pcs ?? item.weight_100_pcs),
  }
}

async function assertDesignHod(
  client: PoolClient,
  organizationId: string,
  actorUserId: string | null | undefined
) {
  if (!actorUserId) throw new Error("Design HOD approval requires a signed-in employee.")
  const result = await client.query(
    `
      SELECT 1
      FROM identity.employee_links employee_link
      JOIN recruitment.posts post
        ON post.organization_id = employee_link.organization_id
       AND lower(btrim(post.employee_code)) =
         lower(btrim(employee_link.employee_code))
      JOIN recruitment.departments department ON department.id = post.department_id
      JOIN recruitment.designations designation
        ON designation.id = post.designation_id
      WHERE employee_link.user_id = $1
        AND employee_link.organization_id = $2
        AND post.status = 'Occupied'
        AND (lower(department.code) = 'design'
          OR lower(department.name) = 'design')
        AND (lower(designation.code) IN ('hod', 'h.o.d.')
          OR designation.name ~* '(^|[^a-z])(hod|head of department)([^a-z]|$)')
      LIMIT 1
    `,
    [actorUserId, organizationId]
  )
  if (!result.rows[0]) {
    throw new Error("Only the occupied Design HOD may approve or reject ECN Design revisions.")
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

async function activeAffectedQuotePathIds(
  client: PoolClient,
  itemIds: string[],
  organizationId: string
) {
  if (!itemIds.length) return []
  const result = await client.query<{ quote_item_id: string }>(
    `
      WITH RECURSIVE quote_tree AS (
        SELECT root.id AS root_quote_item_id, root.id AS quote_item_id,
          root.item_id, ARRAY[root.id]::uuid[] AS quote_path, 0 AS depth
        FROM sales.quote_items root
        WHERE root.organization_id = $2 AND root.is_active
          AND root.status IN ('Sent', 'Accepted')
          AND NULLIF(btrim(root.customer_part_code), '') IS NOT NULL
        UNION ALL
        SELECT quote_tree.root_quote_item_id,
          component.child_quote_item_id, component.component_item_id,
          quote_tree.quote_path || component.child_quote_item_id,
          quote_tree.depth + 1
        FROM quote_tree
        JOIN sales.quote_product_snapshots snapshot
          ON snapshot.quote_item_id = quote_tree.quote_item_id
        JOIN sales.quote_package_components component
          ON component.quote_product_snapshot_id = snapshot.id
        WHERE component.child_quote_item_id IS NOT NULL
          AND quote_tree.depth < 20
          AND NOT component.child_quote_item_id = ANY(quote_tree.quote_path)
      ), affected_paths AS (
        SELECT DISTINCT unnest(quote_path) AS quote_item_id
        FROM quote_tree
        WHERE item_id = ANY($1::uuid[])
      )
      SELECT quote_item_id
      FROM affected_paths
      ORDER BY quote_item_id
    `,
    [itemIds, organizationId]
  )
  return result.rows.map((row) => row.quote_item_id)
}

function productProcessInput(product: ProductRow) {
  return {
    annealing: asNumber(product.annealing),
    assemblyOperationCost: asNumber(product.assembly_operation_cost),
    buffing: asNumber(product.buffing),
    checking: asNumber(product.checking),
    deburring: asNumber(product.deburring),
    machiningCost: asNumber(product.machining_cost),
    marking: asNumber(product.marking),
    overheadCost: asNumber(product.overhead_cost),
    plating: asNumber(product.plating),
    sealant: asNumber(product.sealant),
    washing: asNumber(product.washing),
    weight100Pcs: asNumber(product.weight_100_pcs),
  }
}

async function productComponentCostPerPiece(
  client: PoolClient,
  productId: string
) {
  const result = await client.query<{ component_cost: string }>(
    `
      SELECT COALESCE(sum(
        line.quantity * CASE
          WHEN child.pricing_method = 'Direct Purchase'
            THEN child.direct_purchase_price_per_piece
          ELSE child.product_cost_inr
        END
      ), 0)::text AS component_cost
      FROM catalog.bom_lines line
      JOIN catalog.items child ON child.id = line.component_item_id
      WHERE line.parent_item_id = $1
    `,
    [productId]
  )
  return asNumber(result.rows[0]?.component_cost)
}

async function calculatedProductBase(client: PoolClient, product: ProductRow) {
  return calculateProductBaseCost({
    ...productProcessInput(product),
    componentCostPerPiece: await productComponentCostPerPiece(
      client,
      product.id
    ),
    directPurchasePricePerPiece: asNumber(
      product.direct_purchase_price_per_piece
    ),
    isBomParent: ["Package", "Assembly"].includes(product.item_type),
    pricingMethod: product.pricing_method,
  })
}

async function recalculateProductBaseAndAncestors(
  client: PoolClient,
  itemIds: string[],
  actorUserId?: string | null
) {
  const affected = await client.query<{ depth: number; item_id: string }>(
    `
      WITH RECURSIVE affected(item_id, depth, path) AS (
        SELECT selected.item_id, 0, ARRAY[selected.item_id]::uuid[]
        FROM unnest($1::uuid[]) selected(item_id)
        UNION ALL
        SELECT line.parent_item_id, affected.depth + 1,
          affected.path || line.parent_item_id
        FROM affected
        JOIN catalog.bom_lines line ON line.component_item_id = affected.item_id
        WHERE affected.depth < 20
          AND NOT line.parent_item_id = ANY(affected.path)
      )
      SELECT item_id, max(depth)::integer AS depth
      FROM affected
      GROUP BY item_id
      ORDER BY max(depth), item_id
    `,
    [itemIds]
  )
  for (const affectedProduct of affected.rows) {
    const product = await getProduct(client, affectedProduct.item_id, true)
    const productCostInr = await calculatedProductBase(client, product)
    const piecesPerKg =
      asNumber(product.weight_100_pcs) > 0
        ? 1000 / asNumber(product.weight_100_pcs)
        : asNumber(product.pieces_per_kg)
    await client.query(
      `
        UPDATE catalog.items
        SET product_cost_inr = $1, pieces_per_kg = $2,
          updated_by_user_id = $3, updated_at = now(),
          row_version = row_version + 1
        WHERE id = $4
      `,
      [productCostInr, piecesPerKg, actorUserId ?? null, product.id]
    )
  }
  return affected.rows.map((row) => row.item_id)
}

async function loadQuoteGraph(
  client: PoolClient,
  rootQuoteItemIds: string[],
  lockQuotes = false
): Promise<QuoteGraph> {
  const quotes = await client.query<QuoteRow & { next_revision: number }>(
    `
      WITH RECURSIVE quote_tree (quote_item_id) AS (
        SELECT unnest($1::uuid[])
        UNION
        SELECT component.child_quote_item_id
        FROM quote_tree
        JOIN sales.quote_product_snapshots snapshot
          ON snapshot.quote_item_id = quote_tree.quote_item_id
        JOIN sales.quote_package_components component
          ON component.quote_product_snapshot_id = snapshot.id
        WHERE component.child_quote_item_id IS NOT NULL
      )
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
        snapshot.calculation_json AS snapshot_calculation_json,
        (
          SELECT COALESCE(max(revision.revision), 0)::integer + 1
          FROM sales.quote_items revision
          WHERE revision.organization_id = quote.organization_id
            AND revision.quote_number = quote.quote_number
        ) AS next_revision
      FROM quote_tree
      JOIN sales.quote_items quote ON quote.id = quote_tree.quote_item_id
      JOIN sales.quote_product_snapshots snapshot
        ON snapshot.quote_item_id = quote.id
      ${lockQuotes ? "FOR UPDATE OF quote" : ""}
    `,
    [rootQuoteItemIds]
  )
  const quoteIds = quotes.rows.map((quote) => quote.id)
  const productIds = [...new Set(quotes.rows.map((quote) => quote.item_id))]
  const components = await client.query<
    ComponentRow & { quote_item_id: string }
  >(
    `
      SELECT snapshot.quote_item_id, component.id,
        component.component_item_id, component.component_uid,
        component.description, component.quantity, component.unit_cost,
        component.extended_cost, component.sequence,
        component.child_quote_item_id
      FROM sales.quote_product_snapshots snapshot
      JOIN sales.quote_package_components component
        ON component.quote_product_snapshot_id = snapshot.id
      WHERE snapshot.quote_item_id = ANY($1::uuid[])
      ORDER BY snapshot.quote_item_id, component.sequence,
        component.created_at, component.id
    `,
    [quoteIds]
  )
  const products = await client.query<ProductRow>(
    "SELECT * FROM catalog.items WHERE id = ANY($1::uuid[])",
    [productIds]
  )
  const componentsByQuoteId = new Map<string, ComponentRow[]>()
  for (const component of components.rows) {
    const current = componentsByQuoteId.get(component.quote_item_id) ?? []
    current.push(component)
    componentsByQuoteId.set(component.quote_item_id, current)
  }
  return {
    componentsByQuoteId,
    nextRevisionByQuoteId: new Map(
      quotes.rows.map((quote) => [quote.id, quote.next_revision])
    ),
    productsById: new Map(
      products.rows.map((product) => [product.id, product])
    ),
    quotesById: new Map(quotes.rows.map((quote) => [quote.id, quote])),
  }
}

function quoteFromGraph(graph: QuoteGraph, quoteItemId: string) {
  const quote = graph.quotesById.get(quoteItemId)
  if (!quote) throw new Error("Quote revision source was not found.")
  return quote
}

function collectAffectedQuotePathFromGraph(
  graph: QuoteGraph,
  rootQuoteItemId: string,
  affectedItemId: string,
  depth = 0,
  visiting = new Set<string>()
): { affected: Set<string>; containsAffectedItem: boolean } {
  if (depth > 20) {
    throw new Error("ECN quote tree exceeds the supported depth of 20.")
  }
  if (visiting.has(rootQuoteItemId)) {
    throw new Error("ECN quote tree contains a cycle.")
  }
  const nextVisiting = new Set(visiting)
  nextVisiting.add(rootQuoteItemId)
  const quote = quoteFromGraph(graph, rootQuoteItemId)
  const affected = new Set<string>()
  let containsAffectedItem = quote.item_id === affectedItemId
  for (const component of graph.componentsByQuoteId.get(rootQuoteItemId) ??
    []) {
    if (!component.child_quote_item_id) continue
    const child = collectAffectedQuotePathFromGraph(
      graph,
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

function previewRevisedQuoteFromGraph(
  graph: QuoteGraph,
  input: {
    affectedQuoteIds: Set<string>
    cache: Map<string, { newPrice: number; newProfitPercent: number }>
    overrides: Map<string, QuoteOverride>
    quoteItemId: string
    visiting?: Set<string>
  }
): { newPrice: number; newProfitPercent: number } {
  const cached = input.cache.get(input.quoteItemId)
  if (cached) return cached
  const visiting = input.visiting ?? new Set<string>()
  if (visiting.has(input.quoteItemId)) {
    throw new Error("Quote package cycle detected during ECN preview.")
  }
  const nextVisiting = new Set(visiting)
  nextVisiting.add(input.quoteItemId)
  const quote = quoteFromGraph(graph, input.quoteItemId)
  const product = graph.productsById.get(quote.item_id)
  if (!product) throw new Error("Revision product was not found.")
  const components = graph.componentsByQuoteId.get(input.quoteItemId) ?? []
  const revisedChildren = new Map<string, RevisedQuote>()
  for (const component of components) {
    if (
      component.child_quote_item_id &&
      input.affectedQuoteIds.has(component.child_quote_item_id)
    ) {
      const child = previewRevisedQuoteFromGraph(graph, {
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

type PreparedProductRevision = {
  affectedQuoteIds: Set<string>
  productOverridesById: Map<string, QuoteOverride>
  rootQuoteItemIds: string[]
}

async function preparedProductRevision(
  client: PoolClient,
  bulkPriceRevisionId: string
): Promise<PreparedProductRevision> {
  const changes = await client.query<{
    field_name: string
    final_quote_item_ids_json: unknown
    new_value: string
    source_payload: Record<string, unknown> | null
  }>(
    `
      SELECT field_name, new_value, final_quote_item_ids_json, source_payload
      FROM sales.bulk_price_revision_changes
      WHERE bulk_price_revision_id = $1
        AND applied_at IS NOT NULL
        AND replacement_quote_item_id IS NULL
      ORDER BY created_at, id
    `,
    [bulkPriceRevisionId]
  )
  const affectedQuoteIds = new Set<string>()
  const productOverridesById = new Map<string, QuoteOverride>()
  for (const change of changes.rows) {
    if (
      !isBulkRevisionField(change.field_name) ||
      !productFields.has(change.field_name)
    ) {
      continue
    }
    const productItemId = asText(change.source_payload?.productItemId)
    if (!productItemId) continue
    const overrides = productOverridesById.get(productItemId) ?? new Map()
    overrides.set(change.field_name, asNumber(change.new_value))
    productOverridesById.set(productItemId, overrides)
    if (Array.isArray(change.final_quote_item_ids_json)) {
      for (const value of change.final_quote_item_ids_json) {
        if (typeof value === "string") affectedQuoteIds.add(value)
      }
    }
  }
  if (!productOverridesById.size || !affectedQuoteIds.size) {
    throw new Error("Prepared Product parameters were not found.")
  }
  return {
    affectedQuoteIds,
    productOverridesById,
    rootQuoteItemIds: await topLevelAffectedQuoteIds(client, affectedQuoteIds),
  }
}

async function preparedProductRevisionPreview(
  client: PoolClient,
  bulkPriceRevisionId: string,
  rootQuoteItemIds: string[]
) {
  const prepared = await preparedProductRevision(client, bulkPriceRevisionId)
  const graph = await loadQuoteGraph(client, rootQuoteItemIds)
  const productOverridesById = new Map<string, QuoteOverride>()
  for (const [
    productItemId,
    stagedOverrides,
  ] of prepared.productOverridesById) {
    const product = graph.productsById.get(productItemId)
    if (!product) continue
    const overrides = new Map(stagedOverrides)
    overrides.set(
      "__product_cost_inr",
      await calculatedProductBase(
        client,
        productWithOverrides(product, stagedOverrides)
      )
    )
    productOverridesById.set(productItemId, overrides)
  }
  const quoteOverrides = new Map<string, QuoteOverride>()
  for (const quote of graph.quotesById.values()) {
    const productOverrides = productOverridesById.get(quote.item_id)
    if (productOverrides) {
      quoteOverrides.set(quote.id, new Map(productOverrides))
    }
  }
  return { ...prepared, graph, quoteOverrides }
}

function previewPreparedProductRevisionPrice(
  prepared: Awaited<ReturnType<typeof preparedProductRevisionPreview>>,
  quoteItemId: string,
  targetPriceUsd?: number
) {
  const overrides = new Map(
    [...prepared.quoteOverrides].map(([id, values]) => [id, new Map(values)])
  )
  if (targetPriceUsd !== undefined) {
    const rootOverrides = overrides.get(quoteItemId) ?? new Map()
    rootOverrides.set("__target_price_usd", targetPriceUsd)
    overrides.set(quoteItemId, rootOverrides)
  }
  return previewRevisedQuoteFromGraph(prepared.graph, {
    affectedQuoteIds: prepared.affectedQuoteIds,
    cache: new Map(),
    overrides,
    quoteItemId,
  })
}

export function createCommercialRevisionsRepository(
  options: RepositoryPoolOptions
) {
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

    async listProductBulkPriceRevisionsBounded(
      organizationCode: string,
      options: { limit?: number } = {}
    ) {
      const limit = Math.min(Math.max(Math.trunc(options.limit ?? 200), 1), 200)
      const result = await pool.query<{
        active_price_count: string
        change_count: string
        company_name: string | null
        effective_on: string
        id: string
        reason: string
        revision_number: string
        revision_route: string
        revised_quote_count: string
        status: string
        total_count: string
      }>(
        `
          WITH organization AS (
            SELECT id FROM core.organizations
            WHERE lower(code) = lower($1)
          ), active_prices AS (
            SELECT count(*) AS active_price_count
            FROM sales.quote_items quote
            WHERE quote.organization_id = (SELECT id FROM organization)
              AND quote.is_active AND quote.status IN ('Sent', 'Accepted')
          )
          SELECT revision.id, revision.revision_number, revision.status,
            revision.reason, revision.effective_on::text,
            revision.revision_route, NULL::text AS company_name,
            count(DISTINCT change.stage_group_id)::text AS change_count,
            count(DISTINCT change.replacement_quote_item_id)::text
              AS revised_quote_count,
            max(active_prices.active_price_count)::text AS active_price_count,
            count(*) OVER()::text AS total_count
          FROM sales.bulk_price_revisions revision
          JOIN organization ON organization.id = revision.organization_id
          CROSS JOIN active_prices
          LEFT JOIN sales.bulk_price_revision_changes change
            ON change.bulk_price_revision_id = revision.id
          WHERE revision.revision_route = 'Product Parameter Bulk Revision'
            AND revision.status NOT IN ('Completed', 'Pending Customer Costing')
          GROUP BY revision.id
          ORDER BY revision.created_at DESC, revision.id DESC
          LIMIT $2
        `,
        [organizationCode.trim(), limit]
      )
      const total = Number(result.rows[0]?.total_count ?? 0)
      return {
        coverage: {
          limit,
          returned: result.rows.length,
          total,
          truncated: result.rows.length < total,
        },
        rows: result.rows.map((row) => ({
          activePriceCount: Number(row.active_price_count),
          changeCount: Number(row.change_count),
          companyName: row.company_name,
          effectiveOn: row.effective_on,
          id: row.id,
          reason: row.reason,
          revisedQuoteCount: Number(row.revised_quote_count),
          revisionNumber: row.revision_number,
          revisionRoute: row.revision_route,
          status: row.status,
        })),
      }
    },

    async getProductBulkPriceRevision(
      organizationCode: string,
      bulkPriceRevisionId: string
    ) {
      const result = await pool.query<{
        active_price_count: string
        change_count: string
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
            revision.revision_route,
            count(DISTINCT change.stage_group_id)::text AS change_count,
            count(DISTINCT change.replacement_quote_item_id)::text
              AS revised_quote_count,
            (
              SELECT count(*)::text
              FROM sales.quote_items quote
              WHERE quote.organization_id = revision.organization_id
                AND quote.is_active AND quote.status IN ('Sent', 'Accepted')
            ) AS active_price_count
          FROM sales.bulk_price_revisions revision
          JOIN core.organizations organization
            ON organization.id = revision.organization_id
          LEFT JOIN sales.bulk_price_revision_changes change
            ON change.bulk_price_revision_id = revision.id
          WHERE lower(organization.code) = lower($1)
            AND revision.id = $2
            AND revision.revision_route = 'Product Parameter Bulk Revision'
            AND revision.status NOT IN ('Completed', 'Pending Customer Costing')
          GROUP BY revision.id
        `,
        [organizationCode.trim(), bulkPriceRevisionId]
      )
      const row = result.rows[0]
      return row
        ? {
            activePriceCount: Number(row.active_price_count),
            changeCount: Number(row.change_count),
            companyName: null,
            effectiveOn: row.effective_on,
            id: row.id,
            reason: row.reason,
            revisedQuoteCount: Number(row.revised_quote_count),
            revisionNumber: row.revision_number,
            revisionRoute: row.revision_route,
            status: row.status,
          }
        : null
    },

    async getProductBulkRevisionSummary(organizationCode: string) {
      const result = await pool.query<{
        active_price_count: string
        open_revision_count: string
        organization_id: string
        staged_change_count: string
      }>(
        `
          WITH organization AS (
            SELECT id FROM core.organizations
            WHERE lower(code) = lower($1)
          ), revisions AS (
            SELECT revision.id
            FROM sales.bulk_price_revisions revision
            JOIN organization ON organization.id = revision.organization_id
            WHERE revision.revision_route = 'Product Parameter Bulk Revision'
              AND revision.status NOT IN (
                'Completed', 'Pending Customer Costing'
              )
          ), active_prices AS (
            SELECT count(*) AS active_price_count
            FROM sales.quote_items quote
            WHERE quote.organization_id = (SELECT id FROM organization)
              AND quote.is_active AND quote.status IN ('Sent', 'Accepted')
          )
          SELECT organization.id AS organization_id,
            count(DISTINCT revisions.id)::text AS open_revision_count,
            count(DISTINCT change.stage_group_id)::text AS staged_change_count,
            (max(active_prices.active_price_count) *
              count(DISTINCT revisions.id))::text AS active_price_count
          FROM organization
          CROSS JOIN active_prices
          LEFT JOIN revisions ON true
          LEFT JOIN sales.bulk_price_revision_changes change
            ON change.bulk_price_revision_id = revisions.id
          GROUP BY organization.id
        `,
        [organizationCode.trim()]
      )
      const row = result.rows[0]
      return {
        activePriceCount: Number(row?.active_price_count ?? 0),
        openRevisionCount: Number(row?.open_revision_count ?? 0),
        organizationId: row?.organization_id ?? null,
        stagedChangeCount: Number(row?.staged_change_count ?? 0),
      }
    },

    async listCustomerBulkPriceRevisionsBounded(
      organizationCode: string,
      options: { limit?: number } = {}
    ) {
      const limit = Math.min(Math.max(Math.trunc(options.limit ?? 200), 1), 200)
      const result = await pool.query<{
        active_price_count: string
        change_count: string
        company_name: string | null
        effective_on: string
        id: string
        reason: string
        revision_number: string
        revision_route: string
        revised_quote_count: string
        status: string
        total_count: string
      }>(
        `
          WITH organization AS (
            SELECT id FROM core.organizations
            WHERE lower(code) = lower($1)
          ), active_by_customer AS (
            SELECT quote.customer_id, count(*) AS active_price_count
            FROM sales.quote_items quote
            WHERE quote.organization_id = (SELECT id FROM organization)
              AND quote.is_active AND quote.status IN ('Sent', 'Accepted')
            GROUP BY quote.customer_id
          ), active_total AS (
            SELECT coalesce(sum(active_price_count), 0) AS active_price_count
            FROM active_by_customer
          )
          SELECT revision.id, revision.revision_number, revision.status,
            revision.reason, revision.effective_on::text,
            revision.revision_route, customer.company_name,
            count(DISTINCT change.stage_group_id)::text AS change_count,
            count(DISTINCT change.replacement_quote_item_id)::text
              AS revised_quote_count,
            max(CASE
              WHEN revision.customer_id IS NULL
                THEN active_total.active_price_count
              ELSE coalesce(active_by_customer.active_price_count, 0)
            END)::text AS active_price_count,
            count(*) OVER()::text AS total_count
          FROM sales.bulk_price_revisions revision
          JOIN organization ON organization.id = revision.organization_id
          LEFT JOIN sales.customers customer
            ON customer.id = revision.customer_id
          LEFT JOIN active_by_customer
            ON active_by_customer.customer_id = revision.customer_id
          CROSS JOIN active_total
          LEFT JOIN sales.bulk_price_revision_changes change
            ON change.bulk_price_revision_id = revision.id
          WHERE revision.status <> 'Completed'
            AND revision.revision_route IN (
              'Customer Parameter Bulk Revision',
              'Customer Parameter Costing Only',
              'Bulk Revision'
            )
          GROUP BY revision.id, customer.company_name
          ORDER BY revision.created_at DESC, revision.id DESC
          LIMIT $2
        `,
        [organizationCode.trim(), limit]
      )
      const total = Number(result.rows[0]?.total_count ?? 0)
      return {
        coverage: {
          limit,
          returned: result.rows.length,
          total,
          truncated: result.rows.length < total,
        },
        rows: result.rows.map((row) => ({
          activePriceCount: Number(row.active_price_count),
          changeCount: Number(row.change_count),
          companyName: row.company_name,
          effectiveOn: row.effective_on,
          id: row.id,
          reason: row.reason,
          revisedQuoteCount: Number(row.revised_quote_count),
          revisionNumber: row.revision_number,
          revisionRoute: row.revision_route,
          status: row.status,
        })),
      }
    },

    async getCustomerBulkPriceRevision(
      organizationCode: string,
      bulkPriceRevisionId: string
    ) {
      const result = await pool.query<{
        active_price_count: string
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
              AS revised_quote_count,
            (
              SELECT count(*)::text
              FROM sales.quote_items quote
              WHERE quote.organization_id = revision.organization_id
                AND quote.is_active AND quote.status IN ('Sent', 'Accepted')
                AND (
                  revision.customer_id IS NULL
                  OR quote.customer_id = revision.customer_id
                )
            ) AS active_price_count
          FROM sales.bulk_price_revisions revision
          JOIN core.organizations organization
            ON organization.id = revision.organization_id
          LEFT JOIN sales.customers customer
            ON customer.id = revision.customer_id
          LEFT JOIN sales.bulk_price_revision_changes change
            ON change.bulk_price_revision_id = revision.id
          WHERE lower(organization.code) = lower($1)
            AND revision.id = $2
            AND revision.revision_route IN (
              'Customer Parameter Bulk Revision',
              'Customer Parameter Costing Only',
              'Bulk Revision'
            )
          GROUP BY revision.id, customer.company_name
        `,
        [organizationCode.trim(), bulkPriceRevisionId]
      )
      const row = result.rows[0]
      return row
        ? {
            activePriceCount: Number(row.active_price_count),
            changeCount: Number(row.change_count),
            companyName: row.company_name,
            effectiveOn: row.effective_on,
            id: row.id,
            reason: row.reason,
            revisedQuoteCount: Number(row.revised_quote_count),
            revisionNumber: row.revision_number,
            revisionRoute: row.revision_route,
            status: row.status,
          }
        : null
    },

    async getCustomerBulkRevisionSummary(organizationCode: string) {
      const result = await pool.query<{
        active_price_count: string
        commercial_only_revision: string
        open_revision_count: string
      }>(
        `
          WITH organization AS (
            SELECT id FROM core.organizations
            WHERE lower(code) = lower($1)
          ), revisions AS (
            SELECT revision.*
            FROM sales.bulk_price_revisions revision
            JOIN organization ON organization.id = revision.organization_id
            WHERE revision.status <> 'Completed'
              AND revision.revision_route IN (
                'Customer Parameter Bulk Revision',
                'Customer Parameter Costing Only',
                'Bulk Revision'
              )
          ), active_by_customer AS (
            SELECT quote.customer_id, count(*) AS active_price_count
            FROM sales.quote_items quote
            WHERE quote.organization_id = (SELECT id FROM organization)
              AND quote.is_active AND quote.status IN ('Sent', 'Accepted')
            GROUP BY quote.customer_id
          ), active_total AS (
            SELECT coalesce(sum(active_price_count), 0) AS active_price_count
            FROM active_by_customer
          )
          SELECT count(*)::text AS open_revision_count,
            count(*)::text AS commercial_only_revision,
            coalesce(sum(CASE
              WHEN revisions.customer_id IS NULL
                THEN active_total.active_price_count
              ELSE coalesce(active_by_customer.active_price_count, 0)
            END), 0)::text AS active_price_count
          FROM revisions
          LEFT JOIN active_by_customer
            ON active_by_customer.customer_id = revisions.customer_id
          CROSS JOIN active_total
        `,
        [organizationCode.trim()]
      )
      const row = result.rows[0]!
      return {
        activePriceCount: Number(row.active_price_count),
        commercialOnlyRevision: Number(row.commercial_only_revision),
        openRevisionCount: Number(row.open_revision_count),
      }
    },

    async listCustomerBulkRevisionReferenceData(
      organizationCode: string,
      options: { limit?: number; query?: string } = {}
    ) {
      const limit = Math.min(Math.max(Math.trunc(options.limit ?? 200), 1), 200)
      const search = selectorSearchTerm(options.query ?? "")
      const organization = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
        [organizationCode.trim()]
      )
      const organizationId = organization.rows[0]?.id ?? null
      if (!organizationId) {
        return {
          coverage: { limit, returned: 0, total: 0, truncated: false },
          organizationId: null,
          rows: [],
        }
      }
      const result = await pool.query<{
        company_name: string
        customer_uid: string
        id: string
        total_count: string
      }>(
        `
          SELECT customer.id, customer.customer_uid, customer.company_name,
            count(*) OVER()::text AS total_count
          FROM sales.customers customer
          WHERE customer.organization_id = $1
            AND customer.status = 'Active'
            AND EXISTS (
              SELECT 1
              FROM sales.quote_items quote
              WHERE quote.customer_id = customer.id
                AND quote.organization_id = customer.organization_id
                AND quote.is_active
                AND quote.status IN ('Sent', 'Accepted')
            )
            AND (
              $2 = ''
              OR lower(btrim(customer.customer_uid)) = $2
              OR lower(btrim(customer.company_name)) = $2
              OR (
                $3::text IS NOT NULL
                AND lower(customer.customer_uid || ' ' || customer.company_name)
                  LIKE $3 ESCAPE '\\'
              )
            )
          ORDER BY
            CASE
              WHEN lower(btrim(customer.customer_uid)) = $2 THEN 0
              WHEN lower(btrim(customer.company_name)) = $2 THEN 1
              ELSE 2
            END,
            customer.company_name, customer.id
          LIMIT $4
        `,
        [organizationId, search.query, search.containsPattern, limit]
      )
      const total = Number(result.rows[0]?.total_count ?? 0)
      return {
        coverage: {
          limit,
          returned: result.rows.length,
          total,
          truncated: result.rows.length < total,
        },
        organizationId,
        rows: result.rows.map((row) => ({
          companyName: row.company_name,
          customerUid: row.customer_uid,
          id: row.id,
        })),
      }
    },

    async listBulkPriceRevisionActivePricesBounded(
      bulkPriceRevisionId: string,
      options: { limit?: number; query?: string } = {}
    ) {
      const limit = Math.min(
        Math.max(Math.trunc(options.limit ?? 200), 1),
        bulkRevisionTableLimit
      )
      const search = selectorSearchTerm(options.query ?? "")
      const result = await pool.query<{
        approved_price_usd: string
        category: string | null
        company_name: string
        conversion_rate: string
        customer_part_code: string | null
        description: string
        id: string
        packing_cost: string
        profit_percent: string
        purchase_times: string
        quote_number: string
        scrap_rate: string
        shipping_cost: string
        subcategory: string | null
        total_count: string
        uid: string
      }>(
        `
          WITH revision AS (
            SELECT organization_id, customer_id
            FROM sales.bulk_price_revisions
            WHERE id = $1
          )
          SELECT quote.id, quote.quote_number, quote.customer_part_code,
            quote.approved_price_usd, quote.scrap_rate, quote.packing_cost,
            quote.shipping_cost, quote.purchase_times, quote.profit_percent,
            quote.conversion_rate, customer.company_name, item.uid,
            item.description,
            COALESCE(
              NULLIF(btrim(profile.category), ''),
              NULLIF(btrim(item.source_payload ->> 'category'), ''),
              NULLIF(btrim(design.internal_part_category), '')
            ) AS category,
            COALESCE(
              NULLIF(btrim(profile.sub_category), ''),
              NULLIF(btrim(item.source_payload ->> 'subcategory'), ''),
              NULLIF(btrim(design.internal_part_sub_category), '')
            ) AS subcategory,
            count(*) OVER()::text AS total_count
          FROM sales.quote_items quote
          JOIN revision ON revision.organization_id = quote.organization_id
          JOIN sales.customers customer ON customer.id = quote.customer_id
          JOIN catalog.items item ON item.id = quote.item_id
          LEFT JOIN catalog.website_product_profiles profile
            ON profile.item_id = item.id
          LEFT JOIN sales.design_tasks design
            ON design.id::text = item.source_payload ->> 'designTaskId'
          WHERE quote.is_active AND quote.status IN ('Sent', 'Accepted')
            AND (
              revision.customer_id IS NULL
              OR quote.customer_id = revision.customer_id
            )
            AND (
              $2 = ''
              OR lower(btrim(coalesce(quote.customer_part_code, ''))) = $2
              OR lower(btrim(quote.quote_number)) = $2
              OR lower(btrim(item.uid)) = $2
              OR (
                $3::text IS NOT NULL
                AND lower(
                  coalesce(quote.customer_part_code, '') || ' ' ||
                  quote.quote_number || ' ' || item.uid || ' ' ||
                  item.description
                ) LIKE $3 ESCAPE '\\'
              )
            )
          ORDER BY
            CASE
              WHEN lower(btrim(coalesce(quote.customer_part_code, ''))) = $2
                THEN 0
              WHEN lower(btrim(quote.quote_number)) = $2 THEN 1
              WHEN lower(btrim(item.uid)) = $2 THEN 2
              ELSE 3
            END,
            customer.company_name, item.uid,
            quote.sent_at DESC NULLS LAST, quote.updated_at DESC, quote.id DESC
          LIMIT $4
        `,
        [bulkPriceRevisionId, search.query, search.containsPattern, limit]
      )
      const total = Number(result.rows[0]?.total_count ?? 0)
      return {
        coverage: {
          limit,
          returned: result.rows.length,
          total,
          truncated: result.rows.length < total,
        },
        rows: result.rows.map((row) => ({
          approvedPriceUsd: asNumber(row.approved_price_usd),
          companyName: row.company_name,
          category: row.category,
          conversionRate: asNumber(row.conversion_rate),
          customerPartCode: row.customer_part_code,
          description: row.description,
          id: row.id,
          packingCost: asNumber(row.packing_cost),
          profitPercent: asNumber(row.profit_percent),
          purchaseTimes: asNumber(row.purchase_times, 1),
          quoteNumber: row.quote_number,
          scrapRate: asNumber(row.scrap_rate),
          shippingCost: asNumber(row.shipping_cost),
          uid: row.uid,
          subcategory: row.subcategory,
        })),
      }
    },

    async getProductBulkRevisionCustomerCosting(
      bulkPriceRevisionId: string,
      options: { limit?: number; query?: string } = {}
    ) {
      const limit = Math.min(
        Math.max(Math.trunc(options.limit ?? 200), 1),
        bulkRevisionTableLimit
      )
      const search = selectorSearchTerm(options.query ?? "")
      const client = await pool.connect()
      try {
        const revisionResult = await client.query<{
          effective_on: string
          id: string
          reason: string
          revision_number: string
          status: string
        }>(
          `
            SELECT id, revision_number, status, reason, effective_on::text
            FROM sales.bulk_price_revisions
            WHERE id = $1
              AND revision_route = 'Product Parameter Bulk Revision'
              AND status = 'Pending Customer Costing'
          `,
          [bulkPriceRevisionId]
        )
        const revision = revisionResult.rows[0]
        if (!revision) return null
        const prepared = await preparedProductRevision(
          client,
          bulkPriceRevisionId
        )
        const decisionSummary = await client.query<{ count: string }>(
          `
            SELECT count(DISTINCT prior_quote_item_id)::text AS count
            FROM sales.bulk_price_revision_changes
            WHERE bulk_price_revision_id = $1
              AND field_name = $2
              AND prior_quote_item_id = ANY($3::uuid[])
          `,
          [
            bulkPriceRevisionId,
            productBulkPriceDecisionField,
            prepared.rootQuoteItemIds,
          ]
        )
        const prices = await client.query<{
          approved_price_usd: string
          category: string | null
          company_name: string
          customer_part_code: string | null
          decision: string | null
          description: string
          profit_percent: string
          quote_item_id: string
          subcategory: string | null
          total_count: string
          uid: string
        }>(
          `
            WITH roots AS (
              SELECT unnest($1::uuid[]) AS quote_item_id
            )
            SELECT quote.id AS quote_item_id, quote.customer_part_code,
              quote.approved_price_usd, quote.profit_percent,
              customer.company_name, item.uid, item.description,
              COALESCE(
                NULLIF(btrim(profile.category), ''),
                NULLIF(btrim(item.source_payload ->> 'category'), ''),
                NULLIF(btrim(design.internal_part_category), '')
              ) AS category,
              COALESCE(
                NULLIF(btrim(profile.sub_category), ''),
                NULLIF(btrim(item.source_payload ->> 'subcategory'), ''),
                NULLIF(btrim(design.internal_part_sub_category), '')
              ) AS subcategory,
              decision.source_payload->>'customerDecision' AS decision,
              count(*) OVER()::text AS total_count
            FROM roots
            JOIN sales.quote_items quote ON quote.id = roots.quote_item_id
            JOIN sales.customers customer ON customer.id = quote.customer_id
            JOIN catalog.items item ON item.id = quote.item_id
            LEFT JOIN catalog.website_product_profiles profile
              ON profile.item_id = item.id
            LEFT JOIN sales.design_tasks design
              ON design.id::text = item.source_payload ->> 'designTaskId'
            LEFT JOIN LATERAL (
              SELECT change.source_payload
              FROM sales.bulk_price_revision_changes change
              WHERE change.bulk_price_revision_id = $2
                AND change.prior_quote_item_id = quote.id
                AND change.field_name = $3
              ORDER BY change.created_at DESC, change.id DESC
              LIMIT 1
            ) decision ON true
            WHERE quote.is_active AND quote.status IN ('Sent', 'Accepted')
              AND (
                $4 = ''
                OR lower(btrim(coalesce(quote.customer_part_code, ''))) = $4
                OR lower(btrim(item.uid)) = $4
                OR (
                  $5::text IS NOT NULL
                  AND lower(
                    customer.company_name || ' ' ||
                    coalesce(quote.customer_part_code, '') || ' ' ||
                    item.uid || ' ' || item.description
                  ) LIKE $5 ESCAPE '\\'
                )
              )
            ORDER BY customer.company_name, item.uid, quote.id
            LIMIT $6
          `,
          [
            prepared.rootQuoteItemIds,
            bulkPriceRevisionId,
            productBulkPriceDecisionField,
            search.query,
            search.containsPattern,
            limit,
          ]
        )
        const preview = await preparedProductRevisionPreview(
          client,
          bulkPriceRevisionId,
          prices.rows.map((price) => price.quote_item_id)
        )
        const rows = prices.rows.map((price) => {
          const approvedPriceUsd = asNumber(price.approved_price_usd)
          const revise = previewPreparedProductRevisionPrice(
            preview,
            price.quote_item_id
          )
          const keep = previewPreparedProductRevisionPrice(
            preview,
            price.quote_item_id,
            approvedPriceUsd
          )
          return {
            approvedPriceUsd,
            category: price.category,
            companyName: price.company_name,
            currentProfitPercent: asNumber(price.profit_percent),
            customerPartCode: price.customer_part_code,
            decision: price.decision,
            description: price.description,
            keepSamePriceUsd: approvedPriceUsd,
            keepSameProfitPercent: keep.newProfitPercent,
            quoteItemId: price.quote_item_id,
            revisePriceUsd: revise.newPrice,
            reviseProfitPercent: revise.newProfitPercent,
            subcategory: price.subcategory,
            uid: price.uid,
          }
        })
        const total = Number(prices.rows[0]?.total_count ?? 0)
        return {
          affectedPriceCount: prepared.rootQuoteItemIds.length,
          coverage: {
            limit,
            returned: rows.length,
            total,
            truncated: rows.length < total,
          },
          decidedPriceCount: Number(decisionSummary.rows[0]?.count ?? 0),
          revision: {
            effectiveOn: revision.effective_on,
            id: revision.id,
            reason: revision.reason,
            revisionNumber: revision.revision_number,
            status: revision.status,
          },
          rows,
        }
      } finally {
        client.release()
      }
    },

    async applyProductBulkRevisionPriceDecision(input: {
      actorUserId?: string | null
      bulkPriceRevisionId: string
      decision: "Keep Price Same" | "Revise Price"
      notes?: string | null
      sourceQuoteItemId: string
    }) {
      return transaction(pool, async (client) => {
        const revision = await client.query<{
          organization_id: string
          status: string
        }>(
          `
            SELECT organization_id, status
            FROM sales.bulk_price_revisions
            WHERE id = $1
              AND revision_route = 'Product Parameter Bulk Revision'
            FOR UPDATE
          `,
          [input.bulkPriceRevisionId]
        )
        const row = revision.rows[0]
        if (!row || row.status !== "Pending Customer Costing") {
          throw new Error(
            "Pending Product revision Customer Costing was not found."
          )
        }
        const prepared = await preparedProductRevision(
          client,
          input.bulkPriceRevisionId
        )
        if (!prepared.rootQuoteItemIds.includes(input.sourceQuoteItemId)) {
          throw new Error(
            "This price is outside the Product revision affected set."
          )
        }
        const existing = await client.query(
          `
            SELECT id
            FROM sales.bulk_price_revision_changes
            WHERE bulk_price_revision_id = $1
              AND prior_quote_item_id = $2
              AND field_name = $3
          `,
          [
            input.bulkPriceRevisionId,
            input.sourceQuoteItemId,
            productBulkPriceDecisionField,
          ]
        )
        if (existing.rows[0]) {
          throw new Error("This affected price already has a decision.")
        }
        const source = await getQuote(client, input.sourceQuoteItemId)
        const preview = await preparedProductRevisionPreview(
          client,
          input.bulkPriceRevisionId,
          [input.sourceQuoteItemId]
        )
        const approvedPriceUsd = asNumber(source.approved_price_usd)
        const revised = previewPreparedProductRevisionPrice(
          preview,
          input.sourceQuoteItemId,
          input.decision === "Keep Price Same" ? approvedPriceUsd : undefined
        )
        const stageGroupId = randomUUID()
        await client.query(
          `
            INSERT INTO sales.bulk_price_revision_changes (
              organization_id, bulk_price_revision_id, prior_quote_item_id,
              old_price, new_price, field_name, field_label, new_value,
              selection_json, selected_count, skipped_count, stage_group_id,
              preview_json, notes, created_by_user_id, source_system,
              source_table, source_id, source_payload
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, 'Customer Price Decision', $7,
              $8, 1, 0, $9, $10, $11, $12, 'mrm-dashboard',
              'bulk_price_revision_changes', $13, $14
            )
          `,
          [
            row.organization_id,
            input.bulkPriceRevisionId,
            input.sourceQuoteItemId,
            approvedPriceUsd,
            revised.newPrice,
            productBulkPriceDecisionField,
            revised.newProfitPercent,
            JSON.stringify([input.sourceQuoteItemId]),
            stageGroupId,
            {
              newPrice: revised.newPrice,
              newProfitPercent: revised.newProfitPercent,
              oldPrice: approvedPriceUsd,
              oldProfitPercent: asNumber(source.profit_percent),
              quoteItemId: input.sourceQuoteItemId,
            },
            input.notes ?? null,
            input.actorUserId ?? null,
            randomUUID(),
            {
              customerDecision: input.decision,
              sourceQuoteItemId: input.sourceQuoteItemId,
              targetProfitPercent: revised.newProfitPercent,
            },
          ]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "bulk_price_revision.customer_price_decided",
          metadata: {
            decision: input.decision,
            sourceQuoteItemId: input.sourceQuoteItemId,
          },
          organizationId: row.organization_id,
          targetId: input.bulkPriceRevisionId,
          targetTable: "bulk_price_revisions",
        })
        return {
          decision: input.decision,
          newPriceUsd: revised.newPrice,
          newProfitPercent: revised.newProfitPercent,
          sourceQuoteItemId: input.sourceQuoteItemId,
        }
      })
    },

    async listProductBulkRevisionActivePricesBounded(
      bulkPriceRevisionId: string,
      options: { limit?: number; query?: string } = {}
    ) {
      const limit = Math.min(
        Math.max(Math.trunc(options.limit ?? 200), 1),
        bulkRevisionTableLimit
      )
      const search = selectorSearchTerm(options.query ?? "")
      const result = await pool.query<{
        affected_price_count: string
        alloy_premium: string
        annealing: string
        assembly_operation_cost: string
        buffing: string
        casting: string
        category: string | null
        checking: string
        deburring: string
        description: string
        ext_cost: string
        forging_cost: string
        id: string
        item_type: string
        machining_cost: string
        marking: string
        overhead_cost: string
        pieces_per_kg: string
        plating: string
        product_cost_inr: string
        production_type: string | null
        rejection_percent: string
        sealant: string
        subcategory: string | null
        total_count: string
        uid: string
        washing: string
        weight_100_pcs: string
      }>(
        `
          WITH RECURSIVE revision AS (
            SELECT organization_id
            FROM sales.bulk_price_revisions
            WHERE id = $1
              AND revision_route = 'Product Parameter Bulk Revision'
              AND status NOT IN ('Completed', 'Pending Customer Costing')
          ), quote_tree AS (
            SELECT quote.id AS root_quote_item_id, quote.id AS quote_item_id,
              quote.item_id, ARRAY[quote.id]::uuid[] AS quote_path, 0 AS depth
            FROM sales.quote_items quote
            JOIN revision ON revision.organization_id = quote.organization_id
            WHERE quote.is_active AND quote.status IN ('Sent', 'Accepted')
              AND NULLIF(btrim(quote.customer_part_code), '') IS NOT NULL
            UNION ALL
            SELECT quote_tree.root_quote_item_id,
              component.child_quote_item_id, component.component_item_id,
              quote_tree.quote_path || component.child_quote_item_id,
              quote_tree.depth + 1
            FROM quote_tree
            JOIN sales.quote_product_snapshots snapshot
              ON snapshot.quote_item_id = quote_tree.quote_item_id
            JOIN sales.quote_package_components component
              ON component.quote_product_snapshot_id = snapshot.id
            WHERE component.child_quote_item_id IS NOT NULL
              AND quote_tree.depth < 20
              AND NOT component.child_quote_item_id = ANY(quote_tree.quote_path)
          ), products AS (
            SELECT item_id,
              count(DISTINCT root_quote_item_id)::text AS affected_price_count
            FROM quote_tree
            GROUP BY item_id
          ), filtered AS (
            SELECT item.id, item.uid, item.description, item.item_type,
              COALESCE(
                NULLIF(btrim(profile.category), ''),
                NULLIF(btrim(item.source_payload ->> 'category'), ''),
                NULLIF(btrim(design.internal_part_category), '')
              ) AS category,
              COALESCE(
                NULLIF(btrim(profile.sub_category), ''),
                NULLIF(btrim(item.source_payload ->> 'subcategory'), ''),
                NULLIF(btrim(design.internal_part_sub_category), '')
              ) AS subcategory,
              item.production_type, item.pieces_per_kg, item.weight_100_pcs,
              item.product_cost_inr, item.casting, item.alloy_premium,
              item.rejection_percent,
              item.extrusion_cost AS ext_cost, item.forging_cost,
              item.machining_cost, item.washing, item.checking, item.marking,
              item.plating, item.annealing, item.deburring, item.buffing,
              item.sealant, item.assembly_operation_cost, item.overhead_cost,
              products.affected_price_count
            FROM products
            JOIN catalog.items item ON item.id = products.item_id
            LEFT JOIN catalog.website_product_profiles profile
              ON profile.item_id = item.id
            LEFT JOIN sales.design_tasks design
              ON design.id::text = item.source_payload ->> 'designTaskId'
            WHERE (
              $2 = ''
              OR lower(btrim(item.uid)) = $2
              OR (
                $3::text IS NOT NULL
                AND lower(item.uid || ' ' || item.description || ' ' ||
                  item.item_type || ' ' || coalesce(item.production_type, ''))
                  LIKE $3 ESCAPE '\\'
              )
            )
          )
          SELECT filtered.*,
            count(*) OVER()::text AS total_count
          FROM filtered
          ORDER BY
            CASE
              WHEN lower(btrim(filtered.uid)) = $2 THEN 0
              ELSE 1
            END,
            filtered.uid, filtered.id
          LIMIT $4
        `,
        [bulkPriceRevisionId, search.query, search.containsPattern, limit]
      )
      const total = Number(result.rows[0]?.total_count ?? 0)
      return {
        coverage: {
          limit,
          returned: result.rows.length,
          total,
          truncated: result.rows.length < total,
        },
        rows: result.rows.map((row) => ({
          alloyPremium: asNumber(row.alloy_premium),
          annealing: asNumber(row.annealing),
          affectedPriceCount: Number(row.affected_price_count),
          assemblyOperationCost: asNumber(row.assembly_operation_cost),
          buffing: asNumber(row.buffing),
          casting: asNumber(row.casting),
          category: row.category,
          checking: asNumber(row.checking),
          deburring: asNumber(row.deburring),
          description: row.description,
          extCost: asNumber(row.ext_cost),
          forgingCost: asNumber(row.forging_cost),
          id: row.id,
          itemType: row.item_type,
          machiningCost: asNumber(row.machining_cost),
          marking: asNumber(row.marking),
          overheadCost: asNumber(row.overhead_cost),
          piecesPerKg: asNumber(row.pieces_per_kg),
          plating: asNumber(row.plating),
          productCostInr: asNumber(row.product_cost_inr),
          productionType: row.production_type,
          rejectionPercent: asNumber(row.rejection_percent),
          sealant: asNumber(row.sealant),
          subcategory: row.subcategory,
          uid: row.uid,
          washing: asNumber(row.washing),
          weight100Pcs: asNumber(row.weight_100_pcs),
        })),
      }
    },

    async listBulkPriceRevisionStages(bulkPriceRevisionId: string) {
      const result = await pool.query<{
        field_label: string
        field_name: string
        is_applied: boolean
        new_value: string
        notes: string | null
        preview_rows: Array<{
          newPrice: number
          oldPrice: number
          quoteItemId: string
        }>
        skipped_rows: Array<{
          itemId: string
          reason: string
          uid: string
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
            bool_or(change.applied_at IS NOT NULL) AS is_applied,
            max(change.notes) AS notes,
            (array_agg(change.source_payload ORDER BY change.created_at, change.id))[1]
              -> 'skippedRows' AS skipped_rows,
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
        isApplied: row.is_applied,
        newValue: asNumber(row.new_value),
        notes: row.notes,
        previewRows: row.preview_rows,
        skippedRows: row.skipped_rows ?? [],
        selectedCount: row.selected_count,
        skippedCount: row.skipped_count,
        stageGroupId: row.stage_group_id,
      }))
    },

    async listEngineeringChangeNotes(
      organizationCode: string,
      options: { limit?: number } = {}
    ) {
      const limit = Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 250)
      const result = await pool.query<{
        affected_price_count: number
        created_at: Date
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
            item.description, item.item_type, ecn.created_at,
            jsonb_array_length(ecn.affected_quote_item_ids_json)
              AS affected_price_count,
            count(decision.id)::text AS decision_count
          FROM sales.engineering_change_notes ecn
          JOIN core.organizations organization
            ON organization.id = ecn.organization_id
          JOIN catalog.items item ON item.id = ecn.item_id
          LEFT JOIN sales.engineering_change_decisions decision
            ON decision.engineering_change_note_id = ecn.id
          WHERE lower(organization.code) = lower($1)
          GROUP BY ecn.id, item.id
          ORDER BY ecn.created_at DESC, ecn.id DESC
          LIMIT $2
        `,
        [organizationCode, limit]
      )
      return result.rows.map((row) => ({
        affectedPriceCount: row.affected_price_count,
        createdAt: row.created_at,
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

    async getEngineeringChangeNote(
      organizationCode: string,
      engineeringChangeNoteId: string
    ) {
      const result = await pool.query<{
        affected_price_count: number
        created_at: Date
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
        cost_impact_drivers_json: string[]
        cost_impacting: boolean | null
        design_approved_at: Date | null
        design_approved_by: string | null
        design_rejection_remarks: string | null
        design_rejected_at: Date | null
        design_submitted_at: Date | null
        released_design_revision: string | null
        released_drawing_revision: string | null
        processes_required: string[]
      }>(
        `
          SELECT ecn.id, ecn.ecn_number, ecn.item_id, ecn.status,
            ecn.reason, ecn.effective_on::text, item.uid AS item_uid,
            item.description, item.item_type, ecn.created_at,
            ecn.design_submitted_at, ecn.design_approved_at,
            ecn.design_rejected_at, ecn.design_rejection_remarks,
            ecn.cost_impacting, ecn.cost_impact_drivers_json,
            ecn.source_payload ->> 'releasedDesignRevision'
              AS released_design_revision,
            ecn.source_payload ->> 'releasedDrawingRevision'
              AS released_drawing_revision,
            COALESCE(item.source_payload -> 'processesRequired', '[]'::jsonb)
              AS processes_required,
            max(COALESCE(approved.name, approved.email)) AS design_approved_by,
            jsonb_array_length(ecn.affected_quote_item_ids_json)
              AS affected_price_count,
            count(decision.id)::text AS decision_count
          FROM sales.engineering_change_notes ecn
          JOIN core.organizations organization
            ON organization.id = ecn.organization_id
          JOIN catalog.items item ON item.id = ecn.item_id
          LEFT JOIN sales.engineering_change_decisions decision
            ON decision.engineering_change_note_id = ecn.id
          LEFT JOIN identity.users approved
            ON approved.id = ecn.design_approved_by_user_id
          WHERE lower(organization.code) = lower($1) AND ecn.id = $2
          GROUP BY ecn.id, item.id
        `,
        [organizationCode, engineeringChangeNoteId]
      )
      const row = result.rows[0]
      return row
        ? {
            affectedPriceCount: row.affected_price_count,
            createdAt: row.created_at,
            decisionCount: Number(row.decision_count),
            description: row.description,
            costImpactDrivers: row.cost_impact_drivers_json,
            costImpacting: row.cost_impacting,
            designApprovedAt: row.design_approved_at,
            designApprovedBy: row.design_approved_by,
            designRejectionRemarks: row.design_rejection_remarks,
            designRejectedAt: row.design_rejected_at,
            designSubmittedAt: row.design_submitted_at,
            ecnNumber: row.ecn_number,
            effectiveOn: row.effective_on,
            id: row.id,
            itemId: row.item_id,
            itemType: row.item_type,
            itemUid: row.item_uid,
            reason: row.reason,
            processesRequired: row.processes_required,
            releasedDesignRevision: row.released_design_revision,
            releasedDrawingRevision: row.released_drawing_revision,
            status: row.status,
          }
        : null
    },

    async getEngineeringChangeDesignWorkspace(
      organizationCode: string,
      engineeringChangeNoteId: string
    ) {
      const root = await pool.query<{
        casting: string
        category: string | null
        checked_by: string | null
        description: string
        design_bom_completed: string | null
        design_remarks: string | null
        design_task_id: string | null
        designer_name: string | null
        die_code: string | null
        drawing_file_id: string | null
        drawing_file_name: string | null
        drawing_number: string | null
        drawing_requirement: string | null
        ecn_number: string
        fixture_approx_cost: string | null
        fixture_required: string | null
        gauges_required: string | null
        id: string
        inspection_approx_cost: string | null
        item_id: string
        item_source_payload: Record<string, unknown> | null
        item_type: string
        item_uid: string
        material_grade_id: string | null
        operation_notes: string | null
        organization_id: string
        production_type: string | null
        product_size: string | null
        reason: string
        remarks: string | null
        rod_size: string | null
        rod_type_id: string | null
        source_payload: Record<string, unknown>
        status: string
        subcategory: string | null
        target_completion_date: string | null
        tooling_approx_cost: string | null
        tooling_required: string | null
        weight_100_pcs: string
      }>(
        `
          SELECT ecn.id, ecn.ecn_number, ecn.reason, ecn.status,
            ecn.organization_id, ecn.source_payload,
            item.source_payload AS item_source_payload,
            item.id AS item_id, item.uid AS item_uid,
            item.description, item.item_type, item.production_type,
            item.material_grade_id, item.rod_type_id,
            item.weight_100_pcs::text, item.casting::text, item.rod_size,
            item.die_code, item.remarks,
            COALESCE(
              NULLIF(btrim(item.source_payload ->> 'productSize'), ''),
              NULLIF(btrim(profile.size), ''),
              NULLIF(btrim(design.internal_part_size), '')
            ) AS product_size,
            COALESCE(
              NULLIF(btrim(item.source_payload ->> 'category'), ''),
              NULLIF(btrim(profile.category), ''),
              NULLIF(btrim(design.internal_part_category), '')
            ) AS category,
            COALESCE(
              NULLIF(btrim(item.source_payload ->> 'subcategory'), ''),
              NULLIF(btrim(profile.sub_category), ''),
              NULLIF(btrim(design.internal_part_sub_category), '')
            ) AS subcategory,
            design.target_completion_date::text, design.designer_name,
            design.design_bom_completed, design.tooling_required,
            design.tooling_approx_cost::text, design.fixture_required,
            design.fixture_approx_cost::text, design.gauges_required,
            design.inspection_approx_cost::text, design.checked_by,
            design.operation_notes, design.design_remarks,
            design.id AS design_task_id,
            drawing.file_id AS drawing_file_id,
            drawing_file.file_name AS drawing_file_name,
            drawing.drawing_number,
            drawing.requirement_status AS drawing_requirement
          FROM sales.engineering_change_notes ecn
          JOIN core.organizations organization
            ON organization.id = ecn.organization_id
          JOIN catalog.items item ON item.id = ecn.item_id
          LEFT JOIN catalog.website_product_profiles profile
            ON profile.item_id = item.id
          LEFT JOIN sales.design_tasks design
            ON design.id::text = item.source_payload ->> 'designTaskId'
          LEFT JOIN catalog.drawing_revisions drawing
            ON drawing.item_id = item.id AND drawing.is_current
          LEFT JOIN core.files drawing_file ON drawing_file.id = drawing.file_id
          WHERE lower(organization.code) = lower($1) AND ecn.id = $2
          LIMIT 1
        `,
        [organizationCode, engineeringChangeNoteId]
      )
      const row = root.rows[0]
      if (!row) return null
      const bom = await pool.query<{
        category: string | null
        component_item_id: string
        description: string
        item_type: string
        notes: string | null
        quantity: string
        subcategory: string | null
        uid: string
      }>(
        `
          SELECT line.component_item_id, component.uid,
            component.description, component.item_type, line.quantity::text,
            line.notes,
            COALESCE(
              NULLIF(btrim(profile.category), ''),
              NULLIF(btrim(component.source_payload ->> 'category'), ''),
              NULLIF(btrim(design.internal_part_category), '')
            ) AS category,
            COALESCE(
              NULLIF(btrim(profile.sub_category), ''),
              NULLIF(btrim(component.source_payload ->> 'subcategory'), ''),
              NULLIF(btrim(design.internal_part_sub_category), '')
            ) AS subcategory
          FROM catalog.bom_lines line
          JOIN catalog.items component ON component.id = line.component_item_id
          LEFT JOIN catalog.website_product_profiles profile
            ON profile.item_id = component.id
          LEFT JOIN sales.design_tasks design
            ON design.id::text = component.source_payload ->> 'designTaskId'
          WHERE line.parent_item_id = $1
          ORDER BY line.sequence, line.created_at, line.id
        `,
        [row.item_id]
      )
      const storedDraft =
        row.source_payload &&
        typeof row.source_payload.designDraft === "object" &&
        row.source_payload.designDraft !== null &&
        !Array.isArray(row.source_payload.designDraft)
          ? (row.source_payload.designDraft as Record<string, unknown>)
          : {}
      const approvedDossier =
        row.item_source_payload &&
        typeof row.item_source_payload.productDesignDossier === "object" &&
        row.item_source_payload.productDesignDossier !== null &&
        !Array.isArray(row.item_source_payload.productDesignDossier)
          ? (row.item_source_payload.productDesignDossier as Record<
              string,
              unknown
            >)
          : {}
      const value = (key: string, fallback: unknown) =>
        storedDraft[key] === undefined
          ? approvedDossier[key] === undefined
            ? fallback
            : approvedDossier[key]
          : storedDraft[key]
      const storedBomLines = Array.isArray(storedDraft.bomLines)
        ? storedDraft.bomLines
            .filter(
              (line): line is Record<string, unknown> =>
                typeof line === "object" &&
                line !== null &&
                !Array.isArray(line)
            )
            .map((line) => ({
              componentItemId: asText(line.componentItemId),
              notes: asText(line.notes) || null,
              quantity: asNumber(line.quantity, 1),
            }))
            .filter((line) => line.componentItemId && line.quantity > 0)
        : null
      let bomLines = bom.rows.map((line) => ({
        category: line.category,
        componentItemId: line.component_item_id,
        description: line.description,
        itemType: line.item_type,
        notes: line.notes,
        quantity: asNumber(line.quantity, 1),
        subcategory: line.subcategory,
        uid: line.uid,
      }))
      if (storedBomLines) {
        const componentIds = storedBomLines.map((line) => line.componentItemId)
        const components = componentIds.length
          ? await pool.query<{
              description: string
              id: string
              item_type: string
              uid: string
            }>(
              `SELECT id, uid, description, item_type
               FROM catalog.items WHERE id = ANY($1::uuid[])`,
              [componentIds]
            )
          : { rows: [] }
        const componentById = new Map(
          components.rows.map((component) => [component.id, component] as const)
        )
        bomLines = storedBomLines.flatMap((line) => {
          const component = componentById.get(line.componentItemId)
          return component
            ? [
                {
                  category: null,
                  componentItemId: component.id,
                  description: component.description,
                  itemType: component.item_type,
                  notes: line.notes,
                  quantity: line.quantity,
                  subcategory: null,
                  uid: component.uid,
                },
              ]
            : []
        })
      }
      const attachments = row.design_task_id
        ? await pool.query<{ file_name: string; purpose: string }>(
            `
              SELECT file.file_name, link.purpose
              FROM core.file_links link
              JOIN core.files file ON file.id = link.file_id
              WHERE link.target_schema = 'sales'
                AND link.target_table = 'design_tasks'
                AND link.target_id = $1
                AND link.is_current
              ORDER BY file.created_at DESC, file.id DESC
            `,
            [row.design_task_id]
          )
        : { rows: [] }
      return {
        attachments: attachments.rows.map((attachment) => ({
          fileName: attachment.file_name,
          href: `/commercial/design/${row.design_task_id}/file/${encodeURIComponent(attachment.purpose)}`,
          purpose: attachment.purpose,
        })),
        bomLines,
        casting: asNumber(value("casting", row.casting)),
        category: asText(value("category", row.category)) || null,
        checkedBy: asText(value("checkedBy", row.checked_by)) || null,
        description: asText(value("description", row.description)),
        designBomCompleted:
          asText(value("designBomCompleted", row.design_bom_completed)) || "No",
        designRemarks:
          asText(value("designRemarks", row.design_remarks)) || null,
        designerName: asText(value("designerName", row.designer_name)) || null,
        dieCode: asText(value("dieCode", row.die_code)) || null,
        drawingFileId:
          asText(value("drawingFileId", row.drawing_file_id)) || null,
        drawingFileName:
          asText(value("drawingFileName", row.drawing_file_name)) || null,
        drawingFileHref: storedDraft.drawingFileId
          ? `/commercial/ecns/${row.id}/file/drawing_revision`
          : null,
        drawingNumber:
          asText(value("drawingNumber", row.drawing_number)) || row.item_uid,
        drawingRequirement:
          asText(value("drawingRequirement", row.drawing_requirement)) ||
          "Required",
        drawingRevisionRequested:
          value("drawingRevisionRequested", false) === true,
        ecnNumber: row.ecn_number,
        fixtureApproxCost: asNumber(
          value("fixtureApproxCost", row.fixture_approx_cost)
        ),
        fixtureRequired:
          asText(value("fixtureRequired", row.fixture_required)) || "No",
        gaugesRequired:
          asText(value("gaugesRequired", row.gauges_required)) || "No",
        id: row.id,
        inspectionApproxCost: asNumber(
          value("inspectionApproxCost", row.inspection_approx_cost)
        ),
        itemId: row.item_id,
        itemType: asText(value("itemType", row.item_type)),
        itemUid: row.item_uid,
        materialGradeId:
          asText(value("materialGradeId", row.material_grade_id)) || null,
        operationNotes:
          asText(value("operationNotes", row.operation_notes)) || null,
        organizationId: row.organization_id,
        productionType:
          asText(value("productionType", row.production_type)) || null,
        processesRequired: Array.isArray(
          value("processesRequired", row.item_source_payload?.processesRequired)
        )
          ? (value(
              "processesRequired",
              row.item_source_payload?.processesRequired
            ) as unknown[]).filter(
              (process): process is string => typeof process === "string"
            )
          : [],
        productSize: asText(value("productSize", row.product_size)) || null,
        reason: row.reason,
        remarks: asText(value("remarks", row.remarks)) || null,
        rodSize: asText(value("rodSize", row.rod_size)) || null,
        rodTypeId: asText(value("rodTypeId", row.rod_type_id)) || null,
        status: row.status,
        subcategory: asText(value("subcategory", row.subcategory)) || null,
        targetCompletionDate:
          asText(value("targetCompletionDate", row.target_completion_date)) ||
          null,
        toolingApproxCost: asNumber(
          value("toolingApproxCost", row.tooling_approx_cost)
        ),
        toolingRequired:
          asText(value("toolingRequired", row.tooling_required)) || "No",
        weight100Pcs: asNumber(value("weight100Pcs", row.weight_100_pcs)),
      }
    },

    async getEngineeringChangeMetrics(organizationCode: string) {
      const result = await pool.query<{
        completed_count: string
        open_count: string
        pending_costing_count: string
        pending_design_count: string
        pending_product_costing_count: string
        total_count: string
      }>(
        `
          SELECT count(*)::text AS total_count,
            count(*) FILTER (WHERE ecn.status <> 'Completed')::text AS open_count,
            count(*) FILTER (WHERE ecn.status IN (
              'Pending Design', 'Pending Design Approval'
            ))::text
              AS pending_design_count,
            count(*) FILTER (WHERE ecn.status = 'Pending Product Costing')::text
              AS pending_product_costing_count,
            count(*) FILTER (WHERE ecn.status = 'Pending Customer Costing')::text
              AS pending_costing_count,
            count(*) FILTER (WHERE ecn.status = 'Completed')::text
              AS completed_count
          FROM sales.engineering_change_notes ecn
          JOIN core.organizations organization
            ON organization.id = ecn.organization_id
          WHERE lower(organization.code) = lower($1)
        `,
        [organizationCode]
      )
      const row = result.rows[0]!
      return {
        completed: Number(row.completed_count),
        open: Number(row.open_count),
        pendingCosting: Number(row.pending_costing_count),
        pendingDesign: Number(row.pending_design_count),
        pendingProductCosting: Number(row.pending_product_costing_count),
        total: Number(row.total_count),
      }
    },

    async listEngineeringChangeReferenceData(organizationCode: string) {
      const organization = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
        [organizationCode]
      )
      const organizationId = organization.rows[0]?.id
      if (!organizationId) {
        return {
          items: [],
          materialGrades: [],
          organizationId: null,
          rodTypes: [],
        }
      }
      const [items, materialGrades, rodTypes] = await Promise.all([
        pool.query<{
          category: string | null
          description: string
          id: string
          item_type: string
          subcategory: string | null
          uid: string
        }>(
          `
          SELECT item.id, item.uid, item.description, item.item_type,
            COALESCE(
              NULLIF(btrim(item.source_payload ->> 'category'), ''),
              NULLIF(btrim(profile.category), ''),
              NULLIF(btrim(design.internal_part_category), '')
            ) AS category,
            COALESCE(
              NULLIF(btrim(item.source_payload ->> 'subcategory'), ''),
              NULLIF(btrim(profile.sub_category), ''),
              NULLIF(btrim(design.internal_part_sub_category), '')
            ) AS subcategory
          FROM catalog.items item
          LEFT JOIN catalog.website_product_profiles profile
            ON profile.item_id = item.id
          LEFT JOIN sales.design_tasks design
            ON design.id::text = item.source_payload ->> 'designTaskId'
          WHERE item.organization_id = $1
            AND item.uid_kind = 'INTERNAL' AND item.lifecycle_status = 'P'
          ORDER BY item.uid, item.id
        `,
          [organizationId]
        ),
        pool.query<{ id: string; name: string }>(
          `SELECT id, name FROM catalog.material_grades
           WHERE organization_id = $1 ORDER BY name, id`,
          [organizationId]
        ),
        pool.query<{ id: string; name: string }>(
          `SELECT id, name FROM catalog.rod_types
           WHERE organization_id = $1 ORDER BY name, id`,
          [organizationId]
        ),
      ])
      return {
        items: items.rows.map((row) => ({
          category: row.category,
          description: row.description,
          id: row.id,
          itemType: row.item_type,
          subcategory: row.subcategory,
          uid: row.uid,
        })),
        materialGrades: materialGrades.rows,
        organizationId,
        rodTypes: rodTypes.rows,
      }
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
      selectedProductIds?: string[]
      selectedQuoteItemIds?: string[]
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
        const isProductStage =
          row.revision_route === "Product Parameter Bulk Revision" &&
          row.status !== "Pending Customer Costing"
        if (
          row.revision_route === "Product Parameter Bulk Revision" &&
          row.status === "Pending Customer Costing"
        ) {
          throw new Error(
            "Use Keep Price Same or Revise Price for Product-origin Customer Costing."
          )
        }
        if (isProductStage && !productFields.has(input.fieldName)) {
          throw new Error(
            "Product revisions can only stage product-level parameters."
          )
        }
        if (!isProductStage && !customerFields.has(input.fieldName)) {
          throw new Error(
            "Customer revisions can only stage customer-level parameters."
          )
        }
        const selectedQuoteItemIds = input.selectedQuoteItemIds ?? []
        const selectedProductIds = input.selectedProductIds ?? []
        const valid: Array<{ id: string; itemId: string; price: string }> = []
        if (isProductStage) {
          let productIds = [...new Set(selectedProductIds)]
          if (!productIds.length && selectedQuoteItemIds.length) {
            const legacySelection = await client.query<{ item_id: string }>(
              `
                SELECT DISTINCT item_id
                FROM sales.quote_items
                WHERE id = ANY($1::uuid[]) AND organization_id = $2
              `,
              [selectedQuoteItemIds, row.organization_id]
            )
            productIds = legacySelection.rows.map((product) => product.item_id)
          }
          if (!productIds.length) {
            throw new Error("Select at least one product.")
          }
          const products = await client.query<ProductRow>(
            `
              SELECT *
              FROM catalog.items
              WHERE id = ANY($1::uuid[]) AND organization_id = $2
              FOR UPDATE
            `,
            [productIds, row.organization_id]
          )
          if (products.rows.length !== productIds.length) {
            throw new Error(
              "One or more selected products are no longer available."
            )
          }
          for (const product of products.rows) {
            const affectedQuoteIds = await activeAffectedQuoteIds(
              client,
              product.id,
              row.organization_id
            )
            if (!affectedQuoteIds.length) continue
            valid.push({
              id: affectedQuoteIds[0]!,
              itemId: product.id,
              price: product.product_cost_inr,
            })
          }
        } else {
          if (!selectedQuoteItemIds.length) {
            throw new Error("Select at least one active price row.")
          }
          const prices = await client.query<{
            id: string
            item_id: string
            price: string
          }>(
            `
              SELECT id, item_id, approved_price_usd AS price
              FROM sales.quote_items
              WHERE id = ANY($1::uuid[]) AND organization_id = $2
                AND is_active AND status IN ('Sent', 'Accepted')
                AND ($3::uuid IS NULL OR customer_id = $3)
              FOR UPDATE
            `,
            [selectedQuoteItemIds, row.organization_id, row.customer_id]
          )
          if (prices.rows.length !== new Set(selectedQuoteItemIds).size) {
            throw new Error("One or more selected prices are no longer active.")
          }
          valid.push(
            ...prices.rows.map((price) => ({
              id: price.id,
              itemId: price.item_id,
              price: price.price,
            }))
          )
        }
        const eligible: typeof valid = []
        const skippedRows: Array<{
          itemId: string
          reason: string
          uid: string
        }> = []
        for (const candidate of valid) {
          const product = await getProduct(client, candidate.itemId)
          const applicable =
            !lockedBulkProcessFields.has(input.fieldName) ||
            (isProductStage
              ? productAllowsBulkProcessField(product, input.fieldName)
              : await quoteAllowsBulkProcessField(
                  client,
                  candidate.id,
                  input.fieldName
                ))
          if (applicable) {
            eligible.push(candidate)
          } else {
            skippedRows.push({
              itemId: product.id,
              reason: `${field.label} is not selected in the released Design BOM.`,
              uid: product.uid,
            })
          }
        }
        const skippedCount = valid.length - eligible.length
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
          const product = await getProduct(client, quote.itemId)
          const override = new Map<string, number>([
            [input.fieldName, input.newValue],
          ])
          const preview = isProductStage
            ? {
                totalRateUsd: await calculatedProductBase(
                  client,
                  productWithOverrides(product, override)
                ),
              }
            : revisedCalculation(
                await getQuote(client, quote.id),
                product,
                await getComponents(client, quote.id),
                new Map(),
                override
              )
          const previewJson = {
            newPrice: preview.totalRateUsd,
            oldPrice: asNumber(quote.price),
            productItemId: quote.itemId,
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
              JSON.stringify(eligible.map((row) => row.itemId)),
              eligible.length,
              skippedCount,
              stageGroupId,
              previewJson,
              notes,
              input.actorUserId ?? null,
              randomUUID(),
              {
                ...input,
                eligibleProductIds: eligible.map((row) => row.itemId),
                eligibleQuoteItemIds: eligible.map((row) => row.id),
                productItemId: quote.itemId,
                skippedRows,
              },
            ]
          )
          createdIds.push(created.rows[0]!.id)
        }
        return {
          changeIds: createdIds,
          selectedCount: eligible.length,
          skippedCount,
          skippedRows,
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
          revision_route: string
          status: string
        }>(
          "SELECT organization_id, revision_route, status FROM sales.bulk_price_revisions WHERE id = $1 FOR UPDATE",
          [input.bulkPriceRevisionId]
        )
        const row = revision.rows[0]
        if (!row || row.status === "Completed") {
          throw new Error("Open bulk revision was not found.")
        }
        const target = await client.query<{
          applied_at: Date | null
          field_name: string
        }>(
          `
            SELECT field_name, applied_at
            FROM sales.bulk_price_revision_changes
            WHERE bulk_price_revision_id = $1 AND stage_group_id = $2
              AND replacement_quote_item_id IS NULL
            FOR UPDATE
          `,
          [input.bulkPriceRevisionId, input.stageGroupId]
        )
        const isPreparedProductStage =
          row.revision_route === "Product Parameter Bulk Revision" &&
          row.status === "Pending Customer Costing" &&
          target.rows.length > 0 &&
          target.rows.every(
            (change) =>
              change.applied_at &&
              isBulkRevisionField(change.field_name) &&
              productFields.has(change.field_name)
          )
        if (isPreparedProductStage) {
          const decisions = await client.query<{ count: string }>(
            `
              SELECT count(*)::text AS count
              FROM sales.bulk_price_revision_changes
              WHERE bulk_price_revision_id = $1 AND field_name = $2
            `,
            [input.bulkPriceRevisionId, productBulkPriceDecisionField]
          )
          if (Number(decisions.rows[0]?.count ?? 0) > 0) {
            throw new Error(
              "Prepared Product stages cannot be removed after customer price decisions begin."
            )
          }
        }
        const deleted = await client.query(
          `
            DELETE FROM sales.bulk_price_revision_changes
            WHERE bulk_price_revision_id = $1 AND stage_group_id = $2
              AND replacement_quote_item_id IS NULL
              AND ($3::boolean OR applied_at IS NULL)
          `,
          [
            input.bulkPriceRevisionId,
            input.stageGroupId,
            isPreparedProductStage,
          ]
        )
        if (!deleted.rowCount) {
          throw new Error("Staged bulk change was not found.")
        }
        if (isPreparedProductStage) {
          const remaining = await client.query<{ count: string }>(
            `
              SELECT count(*)::text AS count
              FROM sales.bulk_price_revision_changes
              WHERE bulk_price_revision_id = $1
                AND field_name = ANY($2::text[])
                AND replacement_quote_item_id IS NULL
            `,
            [input.bulkPriceRevisionId, [...productFields]]
          )
          if (Number(remaining.rows[0]?.count ?? 0) === 0) {
            await client.query(
              `
                UPDATE sales.bulk_price_revisions
                SET status = 'Pending Costing', updated_by_user_id = $1,
                  updated_at = now(), row_version = row_version + 1
                WHERE id = $2
              `,
              [input.actorUserId ?? null, input.bulkPriceRevisionId]
            )
          }
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
          revision_route: string
          status: string
        }>(
          "SELECT organization_id, revision_route, status FROM sales.bulk_price_revisions WHERE id = $1 FOR UPDATE",
          [input.bulkPriceRevisionId]
        )
        const row = revision.rows[0]
        if (!row || row.status === "Completed") {
          throw new Error("Open bulk revision was not found.")
        }
        const lockedRevision = row
        const changes = await client.query<{
          applied_at: Date | null
          field_name: string
          id: string
          new_value: string
          old_price: string
          prior_quote_item_id: string
          final_quote_item_ids_json: unknown
          source_payload: Record<string, unknown>
          stage_group_id: string
        }>(
          `
            SELECT id, prior_quote_item_id, old_price, field_name, new_value,
              stage_group_id, applied_at, final_quote_item_ids_json,
              source_payload
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

        const stageGroups = new Map<string, typeof changes.rows>()
        for (const change of changes.rows) {
          const group = stageGroups.get(change.stage_group_id) ?? []
          group.push(change)
          stageGroups.set(change.stage_group_id, group)
        }

        async function requireActivePrices(quoteIds: string[]) {
          const uniqueIds = [...new Set(quoteIds)]
          const active = await client.query<{ id: string }>(
            `
              SELECT id
              FROM sales.quote_items
              WHERE organization_id = $1 AND id = ANY($2::uuid[])
                AND is_active AND status IN ('Sent', 'Accepted')
              FOR UPDATE
            `,
            [lockedRevision.organization_id, uniqueIds]
          )
          if (active.rows.length !== uniqueIds.length) {
            throw new Error("One or more staged prices are no longer active.")
          }
          return uniqueIds
        }

        async function requireActiveAffectedPaths(quoteIds: string[]) {
          const uniqueIds = [...new Set(quoteIds)]
          const rootQuoteIds = await topLevelAffectedQuoteIds(
            client,
            new Set(uniqueIds)
          )
          await requireActivePrices(rootQuoteIds)
          return uniqueIds
        }

        async function productIdsForStage(group: typeof changes.rows) {
          const selectedProductIdSet = new Set(
            group
              .map((change) => asText(change.source_payload.productItemId))
              .filter(Boolean)
          )
          const legacyChanges = group.filter(
            (change) => !asText(change.source_payload.productItemId)
          )
          if (legacyChanges.length) {
            await requireActivePrices(
              legacyChanges.map((change) => change.prior_quote_item_id)
            )
            const normalized = await client.query<{ item_id: string }>(
              `
                UPDATE sales.bulk_price_revision_changes change
                SET source_payload = coalesce(change.source_payload, '{}'::jsonb)
                  || jsonb_build_object(
                    'productItemId', quote.item_id::text
                  )
                FROM sales.quote_items quote
                WHERE change.id = ANY($1::uuid[])
                  AND quote.id = change.prior_quote_item_id
                  AND quote.organization_id = $2
                RETURNING quote.item_id
              `,
              [
                legacyChanges.map((change) => change.id),
                lockedRevision.organization_id,
              ]
            )
            if (normalized.rows.length !== legacyChanges.length) {
              throw new Error(
                "Staged product selection is missing its product."
              )
            }
            for (const product of normalized.rows) {
              selectedProductIdSet.add(product.item_id)
            }
          }
          const selectedProductIds = [...selectedProductIdSet]
          if (!selectedProductIds.length) {
            throw new Error("Staged product selection is missing its product.")
          }
          return selectedProductIds
        }

        const isProductRoute =
          lockedRevision.revision_route === "Product Parameter Bulk Revision"
        const isProductStage =
          isProductRoute && lockedRevision.status !== "Pending Customer Costing"

        if (isProductStage) {
          for (const [stageGroupId, group] of stageGroups) {
            const fieldName = group[0]!.field_name
            if (
              !isBulkRevisionField(fieldName) ||
              !productFields.has(fieldName) ||
              group.some((change) => change.applied_at)
            ) {
              throw new Error(
                `Bulk stage ${stageGroupId} is not an unapplied product parameter.`
              )
            }
            const selectedProductIds = await productIdsForStage(group)
            if (!productColumnByField[fieldName]) {
              throw new Error("Unsupported staged product parameter.")
            }
            const affectedQuoteIds = await requireActiveAffectedPaths(
              await activeAffectedQuotePathIds(
                client,
                selectedProductIds,
                lockedRevision.organization_id
              )
            )
            await client.query(
              `
                UPDATE sales.bulk_price_revision_changes
                SET applied_at = now(), final_quote_item_ids_json = $1
                WHERE bulk_price_revision_id = $2 AND stage_group_id = $3
                  AND replacement_quote_item_id IS NULL
              `,
              [
                JSON.stringify(affectedQuoteIds),
                input.bulkPriceRevisionId,
                stageGroupId,
              ]
            )
          }
          await client.query(
            `
              UPDATE sales.bulk_price_revisions
              SET status = 'Pending Customer Costing', completed_at = NULL,
                updated_by_user_id = $1, updated_at = now(),
                row_version = row_version + 1
              WHERE id = $2
            `,
            [input.actorUserId ?? null, input.bulkPriceRevisionId]
          )
          await writeAuditEvent(client, {
            actorUserId: input.actorUserId,
            eventType: "bulk_price_revision.product_parameters_prepared",
            metadata: { stagedGroupCount: stageGroups.size },
            organizationId: lockedRevision.organization_id,
            targetId: input.bulkPriceRevisionId,
            targetTable: "bulk_price_revisions",
          })
          return {
            revisedQuoteCount: 0,
            status: "Pending Customer Costing",
          }
        }

        if (isProductRoute) {
          const prepared = await preparedProductRevision(
            client,
            input.bulkPriceRevisionId
          )
          const decidedQuoteIds = new Set(
            changes.rows
              .filter(
                (change) =>
                  change.field_name === productBulkPriceDecisionField &&
                  ["Keep Price Same", "Revise Price"].includes(
                    asText(change.source_payload.customerDecision)
                  )
              )
              .map((change) => change.prior_quote_item_id)
          )
          const missingDecisionCount = prepared.rootQuoteItemIds.filter(
            (quoteItemId) => !decidedQuoteIds.has(quoteItemId)
          ).length
          if (missingDecisionCount > 0) {
            throw new Error(
              `Record a customer price decision for all affected prices (${missingDecisionCount} remaining).`
            )
          }
        }

        const selectedIds = new Set<string>()
        const overrides = new Map<string, QuoteOverride>()
        const productStagesToPublish: Array<{
          fieldName: BulkRevisionFieldName
          newValue: number
          selectedProductIds: string[]
        }> = []
        for (const [stageGroupId, group] of stageGroups) {
          const fieldName = group[0]!.field_name
          if (fieldName === productBulkPriceDecisionField) {
            if (!isProductRoute || group.length !== 1) {
              throw new Error(
                `Bulk stage ${stageGroupId} is not a Product price decision.`
              )
            }
            const decision = asText(group[0]!.source_payload.customerDecision)
            if (!["Keep Price Same", "Revise Price"].includes(decision)) {
              throw new Error(
                `Bulk stage ${stageGroupId} has an invalid price decision.`
              )
            }
            const [quoteId] = await requireActivePrices([
              group[0]!.prior_quote_item_id,
            ])
            selectedIds.add(quoteId!)
            if (decision === "Keep Price Same") {
              const quoteOverrides = overrides.get(quoteId!) ?? new Map()
              quoteOverrides.set(
                "__target_price_usd",
                asNumber(group[0]!.old_price)
              )
              overrides.set(quoteId!, quoteOverrides)
            }
            continue
          }
          if (!isBulkRevisionField(fieldName)) {
            throw new Error("Unsupported staged bulk revision field.")
          }
          const isPreparedProductStage =
            isProductRoute &&
            productFields.has(fieldName) &&
            group.every((change) => change.applied_at)
          const isUnappliedCustomerStage =
            customerFields.has(fieldName) &&
            group.every((change) => !change.applied_at)
          if (
            (isProductRoute &&
              !isPreparedProductStage &&
              !isUnappliedCustomerStage) ||
            (!isProductRoute && !isUnappliedCustomerStage)
          ) {
            throw new Error(
              `Bulk stage ${stageGroupId} is not valid for customer costing.`
            )
          }
          const stagedQuoteIds = await requireActivePrices(
            group.map((change) => change.prior_quote_item_id)
          )
          const quoteIds = isPreparedProductStage
            ? await requireActiveAffectedPaths(
                group.flatMap((change) =>
                  Array.isArray(change.final_quote_item_ids_json)
                    ? change.final_quote_item_ids_json.filter(
                        (value): value is string => typeof value === "string"
                      )
                    : []
                )
              )
            : stagedQuoteIds
          const productStageQuoteIds = new Set<string>()
          if (isPreparedProductStage) {
            const selectedProductIds = await productIdsForStage(group)
            productStagesToPublish.push({
              fieldName,
              newValue: asNumber(group[0]!.new_value),
              selectedProductIds,
            })
            const matchingQuotes = await client.query<{ id: string }>(
              `
                SELECT id
                FROM sales.quote_items
                WHERE id = ANY($1::uuid[]) AND item_id = ANY($2::uuid[])
              `,
              [quoteIds, selectedProductIds]
            )
            for (const quote of matchingQuotes.rows) {
              productStageQuoteIds.add(quote.id)
            }
          }
          for (const quoteId of quoteIds) {
            selectedIds.add(quoteId)
            if (!isPreparedProductStage || productStageQuoteIds.has(quoteId)) {
              const quoteOverrides =
                overrides.get(quoteId) ?? new Map<string, number>()
              quoteOverrides.set(fieldName, asNumber(group[0]!.new_value))
              overrides.set(quoteId, quoteOverrides)
            }
          }
        }
        for (const productStage of productStagesToPublish) {
          const productColumn = productColumnByField[productStage.fieldName]
          if (!productColumn) {
            throw new Error("Unsupported staged product parameter.")
          }
          await client.query(
            `
              UPDATE catalog.items item
              SET ${productColumn} = $1, updated_by_user_id = $2,
                updated_at = now(), row_version = row_version + 1
              WHERE item.id = ANY($3::uuid[])
            `,
            [
              productStage.newValue,
              input.actorUserId ?? null,
              productStage.selectedProductIds,
            ]
          )
          await recalculateProductBaseAndAncestors(
            client,
            productStage.selectedProductIds,
            input.actorUserId
          )
        }
        const affected = await collectQuoteAncestors(client, [...selectedIds])
        const cache = new Map<string, RevisedQuote>()
        const roots = await topLevelAffectedQuoteIds(client, affected)
        for (const quoteId of roots) {
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
                  applied_at = COALESCE(applied_at, now()),
                  final_quote_item_ids_json = $3,
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
                lockedRevision.organization_id,
                input.bulkPriceRevisionId,
                oldQuoteId,
                revised.replacementQuoteItemId,
                old.approved_price_usd,
                revised.newPrice,
                JSON.stringify(finalIds),
                { propagatedFrom: [...selectedIds], revisionOrder },
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
          organizationId: lockedRevision.organization_id,
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
        const item = await client.query<{
          id: string
          lifecycle_status: string
          uid_kind: string
        }>(
          `
            SELECT id, uid_kind, lifecycle_status
            FROM catalog.items
            WHERE id = $1 AND organization_id = $2
          `,
          [input.itemId, input.organizationId]
        )
        if (!item.rows[0]) {
          throw new Error("Product was not found for ECN.")
        }
        if (
          item.rows[0].uid_kind !== "INTERNAL" ||
          item.rows[0].lifecycle_status !== "P"
        ) {
          throw new Error("ECN product must be an ordered internal product.")
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
        const after = proposedDesignEvidence(before, input.itemPatch)
        await client.query(
          `
            UPDATE sales.engineering_change_notes
            SET status = 'Pending Design Approval', design_before = $1,
              design_after = $2, design_submitted_at = now(),
              design_submitted_by_user_id = $3,
              design_approved_at = NULL, design_approved_by_user_id = NULL,
              design_rejected_at = NULL, design_rejected_by_user_id = NULL,
              design_rejection_remarks = NULL,
              source_payload = jsonb_set(
                COALESCE(source_payload, '{}'::jsonb),
                '{designSubmission}', $4::jsonb, true
              ),
              updated_by_user_id = $3, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $5
          `,
          [
            before,
            after,
            input.actorUserId ?? null,
            JSON.stringify({ itemPatch: input.itemPatch }),
            input.engineeringChangeNoteId,
          ]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "engineering_change.design_submitted",
          organizationId: row.organization_id,
          targetId: input.engineeringChangeNoteId,
          targetTable: "engineering_change_notes",
        })
        return {
          id: input.engineeringChangeNoteId,
          status: "Pending Design Approval",
        }
      })
    },

    async applyEngineeringChangeDesignReview(input: {
      actorUserId?: string | null
      decision: "Approve" | "Reject"
      engineeringChangeNoteId: string
      remarks?: string | null
    }) {
      return transaction(pool, async (client) => {
        const result = await client.query<{
          design_after: ReturnType<typeof proposedDesignEvidence>
          design_before: Awaited<ReturnType<typeof itemAndBomEvidence>>
          effective_on: string | null
          item_id: string
          organization_id: string
          reason: string
          source_payload: Record<string, unknown>
          status: string
        }>(
          `SELECT organization_id, item_id, status, reason,
             effective_on::text, source_payload, design_before, design_after
           FROM sales.engineering_change_notes WHERE id = $1 FOR UPDATE`,
          [input.engineeringChangeNoteId]
        )
        const row = result.rows[0]
        if (!row || row.status !== "Pending Design Approval") {
          throw new Error("Pending Design Approval ECN was not found.")
        }
        await assertDesignHod(client, row.organization_id, input.actorUserId)
        const submission = record(row.source_payload.designSubmission)
        const itemPatch = record(
          submission.itemPatch
        ) as EngineeringChangeDesignPatch

        if (input.decision === "Reject") {
          const remarks = asText(input.remarks)
          if (!remarks) throw new Error("Design rejection remarks are required.")
          await client.query(
            `
              UPDATE sales.engineering_change_notes
              SET status = 'Pending Design', design_rejected_at = now(),
                design_rejected_by_user_id = $1,
                design_rejection_remarks = $2,
                source_payload = jsonb_set(
                  COALESCE(source_payload, '{}'::jsonb),
                  '{designReviewHistory}',
                  COALESCE(source_payload -> 'designReviewHistory', '[]'::jsonb)
                    || jsonb_build_array(jsonb_build_object(
                      'decision', 'Reject', 'remarks', $2::text,
                      'actorUserId', $1::uuid, 'decidedAt', now()
                    )), true
                ),
                updated_by_user_id = $1, updated_at = now(),
                row_version = row_version + 1
              WHERE id = $3
            `,
            [input.actorUserId ?? null, remarks, input.engineeringChangeNoteId]
          )
          await writeAuditEvent(client, {
            actorUserId: input.actorUserId,
            eventType: "engineering_change.design_rejected",
            metadata: { remarks },
            organizationId: row.organization_id,
            targetId: input.engineeringChangeNoteId,
            targetTable: "engineering_change_notes",
          })
          return { id: input.engineeringChangeNoteId, status: "Pending Design" }
        }

        await getProduct(client, row.item_id, true)
        const { bomLines, designDetails, sourcePayloadPatch, ...productPatch } =
          itemPatch
        await applyAllowlistedItemPatch(
          client,
          row.item_id,
          productPatch,
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
        if (sourcePayloadPatch) {
          await client.query(
            `UPDATE catalog.items
             SET source_payload = COALESCE(source_payload, '{}'::jsonb) || $1::jsonb,
               updated_by_user_id = $2, updated_at = now(),
               row_version = row_version + 1
             WHERE id = $3`,
            [sourcePayloadPatch, input.actorUserId ?? null, row.item_id]
          )
        }
        const impact = classifyDesignCostImpact(
          designCostDrivers(row.design_before),
          designCostDrivers({
            ...row.design_after,
            designDetails: designDetails ?? row.design_after.designDetails,
          })
        )
        const currentRevision = await client.query<{
          id: string
          revision_number: number
        }>(
          `SELECT id, revision_number
           FROM catalog.product_design_revisions
           WHERE item_id = $1 AND is_current FOR UPDATE`,
          [row.item_id]
        )
        const current = currentRevision.rows[0]
        if (!current) throw new Error("Released Product Design revision was not found.")
        const revisionNumber = current.revision_number + 1
        const revisionLabel = String(revisionNumber).padStart(2, "0")
        await client.query(
          `UPDATE catalog.product_design_revisions
           SET status = 'Superseded', is_current = false WHERE id = $1`,
          [current.id]
        )
        await client.query(
          `UPDATE catalog.items
           SET source_payload = jsonb_set(
             COALESCE(source_payload, '{}'::jsonb),
             '{currentDesignRevision}', to_jsonb($1::text), true
           ), updated_by_user_id = $2, updated_at = now(),
             row_version = row_version + 1
           WHERE id = $3`,
          [revisionLabel, input.actorUserId ?? null, row.item_id]
        )
        const after = await itemAndBomEvidence(client, row.item_id)
        const releasedDesign = await client.query<{ id: string }>(
          `
            INSERT INTO catalog.product_design_revisions (
              organization_id, item_id, engineering_change_note_id,
              revision_number, revision_label, status, is_current,
              effective_on, change_reason, design_snapshot, bom_snapshot,
              created_by_user_id, approved_at, approved_by_user_id,
              released_at, source_system, source_table, source_id,
              source_payload
            ) VALUES (
              $1, $2, $3, $4, $5, 'Released', true, $6::date, $7, $8, $9,
              $10, now(), $10, now(), 'mrm-dashboard',
              'product_design_revisions', $11, $12
            )
            RETURNING id
          `,
          [
            row.organization_id,
            row.item_id,
            input.engineeringChangeNoteId,
            revisionNumber,
            revisionLabel,
            row.effective_on,
            row.reason,
            JSON.stringify(after.item),
            JSON.stringify(after.bomLines),
            input.actorUserId ?? null,
            randomUUID(),
            JSON.stringify({ designDetails: designDetails ?? {}, impact }),
          ]
        )
        const affectedParentRevisions =
          await releaseAffectedParentDesignRevisions(client, {
            actorUserId: input.actorUserId,
            changedItemId: row.item_id,
            changedRevisionLabel: revisionLabel,
            effectiveOn: row.effective_on,
            engineeringChangeNoteId: input.engineeringChangeNoteId,
            organizationId: row.organization_id,
          })
        const drawingDetails = record(designDetails)
        let drawingRevisionLabel: string | null = null
        if (drawingDetails.drawingRevisionRequested === true) {
          const drawingRequirement = asText(drawingDetails.drawingRequirement)
          if (
            drawingRequirement !== "Required" &&
            drawingRequirement !== "Not Required"
          ) {
            throw new Error("Drawing requirement must be Required or Not Required.")
          }
          const drawingNumber = asText(drawingDetails.drawingNumber)
          if (!drawingNumber) throw new Error("Drawing number is required.")
          const submittedFileId = asText(drawingDetails.drawingFileId)
          let fileId: string | null = null
          if (drawingRequirement === "Required") {
            if (!submittedFileId) {
              throw new Error("A drawing file is required for this revision.")
            }
            const linkedFile = await client.query<{ id: string }>(
              `SELECT file.id
               FROM core.files file
               JOIN core.file_links link ON link.file_id = file.id
               WHERE file.id = $1 AND file.organization_id = $2
                 AND link.organization_id = $2
                 AND link.target_schema = 'sales'
                 AND link.target_table = 'engineering_change_notes'
                 AND link.target_id = $3
                 AND link.purpose = 'drawing_revision' AND link.is_current
                 AND file.lifecycle_state = 'current'
               LIMIT 1`,
              [
                submittedFileId,
                row.organization_id,
                input.engineeringChangeNoteId,
              ]
            )
            fileId = linkedFile.rows[0]?.id ?? null
            if (!fileId) {
              throw new Error("The submitted drawing file is not linked to this ECN.")
            }
          }
          const currentDrawing = await client.query<{
            id: string
            revision_number: number
          }>(
            `SELECT id, revision_number FROM catalog.drawing_revisions
             WHERE item_id = $1 AND is_current FOR UPDATE`,
            [row.item_id]
          )
          const currentDrawingRow = currentDrawing.rows[0]
          const drawingRevisionNumber =
            (currentDrawingRow?.revision_number ?? -1) + 1
          drawingRevisionLabel = String(drawingRevisionNumber).padStart(2, "0")
          if (currentDrawingRow) {
            await client.query(
              `UPDATE catalog.drawing_revisions
               SET status = 'Superseded', is_current = false WHERE id = $1`,
              [currentDrawingRow.id]
            )
          }
          await client.query(
            `INSERT INTO catalog.drawing_revisions (
               organization_id, item_id, product_design_revision_id,
               engineering_change_note_id, file_id, drawing_number,
               revision_number, revision_label, requirement_status,
               status, is_current, effective_on, change_reason,
               raised_by_user_id, uploaded_by_user_id, approved_at,
               approved_by_user_id, released_at, source_system,
               source_table, source_id, source_payload
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9,
               'Released', true, $10::date, $11, $12, $12, now(), $12,
               now(), 'mrm-dashboard', 'drawing_revisions', $13, $14
             )`,
            [
              row.organization_id,
              row.item_id,
              releasedDesign.rows[0]!.id,
              input.engineeringChangeNoteId,
              fileId,
              drawingNumber,
              drawingRevisionNumber,
              drawingRevisionLabel,
              drawingRequirement,
              row.effective_on,
              row.reason,
              input.actorUserId ?? null,
              randomUUID(),
              JSON.stringify({
                fileName: asText(drawingDetails.drawingFileName) || null,
              }),
            ]
          )
        }
        const status = engineeringChangeStatusAfterApproval(
          impact.costImpacting
        )
        await client.query(
          `
            UPDATE sales.engineering_change_notes
            SET status = $1, design_after = $2, design_completed_at = now(),
              design_approved_at = now(), design_approved_by_user_id = $3,
              cost_impacting = $4, cost_impact_drivers_json = $5,
              completed_at = CASE WHEN $1 = 'Completed' THEN now() ELSE NULL END,
              source_payload = (COALESCE(source_payload, '{}'::jsonb) - 'designDraft')
                || jsonb_build_object(
                  'releasedDesignRevision', $6::text,
                  'releasedDrawingRevision', $7::text,
                  'affectedParentRevisions', $8::jsonb
                ),
              updated_by_user_id = $3, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $9
          `,
          [
            status,
            { ...after, designDetails: designDetails ?? {} },
            input.actorUserId ?? null,
            impact.costImpacting,
            JSON.stringify(impact.drivers),
            revisionLabel,
            drawingRevisionLabel,
            JSON.stringify(affectedParentRevisions),
            input.engineeringChangeNoteId,
          ]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "engineering_change.design_approved",
          metadata: {
            ...impact,
            affectedParentRevisions,
            drawingRevisionLabel,
            revisionLabel,
            status,
          },
          organizationId: row.organization_id,
          targetId: input.engineeringChangeNoteId,
          targetTable: "engineering_change_notes",
        })
        return {
          costImpactDrivers: impact.drivers,
          costImpacting: impact.costImpacting,
          affectedParentRevisions,
          id: input.engineeringChangeNoteId,
          revisionLabel,
          drawingRevisionLabel,
          status,
        }
      })
    },

    async saveEngineeringChangeDesignDraft(input: {
      actorUserId?: string | null
      designDetails: Record<string, unknown>
      engineeringChangeNoteId: string
    }) {
      return transaction(pool, async (client) => {
        const ecn = await client.query<{
          organization_id: string
          status: string
        }>(
          "SELECT organization_id, status FROM sales.engineering_change_notes WHERE id = $1 FOR UPDATE",
          [input.engineeringChangeNoteId]
        )
        const row = ecn.rows[0]
        if (!row || row.status !== "Pending Design") {
          throw new Error("Pending-design ECN was not found.")
        }
        await client.query(
          `
            UPDATE sales.engineering_change_notes
            SET source_payload = jsonb_set(
                COALESCE(source_payload, '{}'::jsonb),
                '{designDraft}', $1::jsonb, true
              ),
              updated_by_user_id = $2, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $3
          `,
          [
            input.designDetails,
            input.actorUserId ?? null,
            input.engineeringChangeNoteId,
          ]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "engineering_change.design_draft_saved",
          organizationId: row.organization_id,
          targetId: input.engineeringChangeNoteId,
          targetTable: "engineering_change_notes",
        })
        return { id: input.engineeringChangeNoteId, status: row.status }
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
        const product = await getProduct(client, row.item_id, true)
        assertApplicableProcessPrices({
          current: {
            annealing: asNumber(product.annealing),
            assemblyOperationCost: asNumber(product.assembly_operation_cost),
            buffing: asNumber(product.buffing),
            checking: asNumber(product.checking),
            deburring: asNumber(product.deburring),
            machiningCost: asNumber(product.machining_cost),
            marking: asNumber(product.marking),
            plating: asNumber(product.plating),
            sealant: asNumber(product.sealant),
            washing: asNumber(product.washing),
          },
          next: {
            annealing: input.itemPatch.annealing,
            assemblyOperationCost: input.itemPatch.assemblyOperationCost,
            buffing: input.itemPatch.buffing,
            checking: input.itemPatch.checking,
            deburring: input.itemPatch.deburring,
            machiningCost: input.itemPatch.machiningCost,
            marking: input.itemPatch.marking,
            plating: input.itemPatch.plating,
            sealant: input.itemPatch.sealant,
            washing: input.itemPatch.washing,
          },
          selectedProcesses: designProcessSelection({
            processesRequired: processesRequiredFromPayload(
              product.source_payload
            ),
          }),
        })
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
          affectedQuoteItemIds.length > 0
            ? "Pending Customer Costing"
            : "Completed"
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
        const graph = await loadQuoteGraph(client, affectedQuoteItemIds)
        for (const price of prices.rows) {
          const path = collectAffectedQuotePathFromGraph(
            graph,
            price.quote_item_id,
            row.item_id
          )
          const revise = previewRevisedQuoteFromGraph(graph, {
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
          const keep = previewRevisedQuoteFromGraph(graph, {
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
        if (!row || row.status !== "Pending Customer Costing") {
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
        const quoteGraph = await loadQuoteGraph(
          client,
          row.affected_quote_item_ids_json,
          true
        )
        const source = quoteFromGraph(quoteGraph, input.sourceQuoteItemId)
        const path = collectAffectedQuotePathFromGraph(
          quoteGraph,
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
          quoteGraph,
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
          status: completed ? "Completed" : "Pending Customer Costing",
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
