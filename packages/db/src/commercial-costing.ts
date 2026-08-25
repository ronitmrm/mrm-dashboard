import { randomUUID } from "node:crypto"

import type { Pool, PoolClient } from "pg"

import { boundedResult, selectorSearchTerm } from "./commercial-bounds"
import {
  repositoryPool,
  withTransaction as transaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"
import { calculateCosting, type CostingResult } from "./pricing-calculation"

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
  direct_purchase_price_per_kg: string
  direct_purchase_price_per_piece: string
  extrusion_cost: string
  forging_cost: string
  id: string
  item_type: string
  lifecycle_status: string
  machining_cost: string
  machining_price_per_piece: string
  marking: string
  machine_type_id: string | null
  material_grade_id: string | null
  organization_id: string
  overhead_cost: string
  pieces_per_kg: string
  plating: string
  pricing_method: string
  product_cost_inr: string
  production_type: string | null
  rejection_percent: string
  remarks: string | null
  rod_size: string | null
  rod_type_id: string | null
  sealant: string
  uid: string
  uid_kind: string
  washing: string
  weight_100_pcs: string
  source_payload: Record<string, unknown>
}

type SalesWorkScope = {
  originatingSalespersonUserId: string
}

type QuoteInputs = {
  conversionRate: number
  overheadCost: number
  packingCost: number
  profitPercent: number
  purchaseTimes: number
  scrapRate: number
  shippingCost: number
}

type PackageComponent = {
  childQuoteItemId: string
  componentItemId: string
  componentUid: string
  description: string
  extendedCost: number
  quantity: number
  unitCost: number
}

type QuoteCalculation = CostingResult & Record<string, number>

type PricingRegisterDatabaseRow = {
  calculation_json: Record<string, unknown>
  change_date: Date
  company_name: string
  component_depth: number
  component_quantity: string
  currency: string
  customer_id: string
  customer_part_code: string | null
  customer_uid: string
  enquiry_description: string
  enquiry_number: string | null
  id: string
  is_active: boolean
  item_type: string
  lifecycle_status: string
  line_number: number | null
  packaging: string | null
  parent_uid: string | null
  product_context: Record<string, unknown>
  product_snapshot: Record<string, unknown>
  quote_inputs: Record<string, unknown>
  quote_number: string
  revision: number
  root_company_name: string
  root_customer_part_code: string
  root_quote_item_id: string
  row_key: string
  sent_at: Date | null
  shipping_terms: string | null
  status: string
  unit_price: string
  uid: string
  website_product_description: string | null
  website_size: string | null
}

const asNumber = (value: unknown, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const exportBatchSize = (value: number) =>
  Math.min(Math.max(Math.floor(value), 1), 500)

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const pricingRegisterRow = (row: PricingRegisterDatabaseRow) => ({
  calculation: row.calculation_json,
  changeDate: row.change_date,
  companyName: row.company_name,
  componentDepth: row.component_depth,
  componentQuantity: asNumber(row.component_quantity, 1),
  currency: row.currency,
  customerId: row.customer_id,
  customerPartCode: row.customer_part_code,
  customerUid: row.customer_uid,
  enquiryDescription: row.enquiry_description,
  enquiryNumber: row.enquiry_number,
  id: row.id,
  isActive: row.is_active,
  itemType: row.item_type,
  lifecycleStatus: row.lifecycle_status,
  lineNumber: row.line_number,
  packaging: row.packaging,
  parentUid: row.parent_uid,
  productContext: row.product_context,
  product: row.product_snapshot,
  quoteInputs: row.quote_inputs,
  quoteNumber: row.quote_number,
  rowKey: row.row_key,
  revision: row.revision,
  sentAt: row.sent_at,
  shippingTerms: row.shipping_terms,
  status: row.status,
  unitPrice: asNumber(row.unit_price),
  uid: row.uid,
  websiteProductDescription: row.website_product_description,
  websiteSize: row.website_size,
})

const isBomParent = (itemType: string) =>
  ["package", "assembly"].includes(itemType.toLowerCase())

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
        'costing_workflow_events', $7
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

async function getProduct(client: PoolClient, itemId: string, lock = false) {
  const product = await client.query<ProductRow>(
    `
      SELECT *
      FROM catalog.items
      WHERE id = $1
      ${lock ? "FOR UPDATE" : ""}
    `,
    [itemId]
  )
  if (!product.rows[0]) {
    throw new Error("Product was not found.")
  }
  return product.rows[0]
}

async function getImmediateChildren(client: PoolClient, itemId: string) {
  const result = await client.query<
    ProductRow & { bom_line_id: string; quantity: string }
  >(
    `
      SELECT child.*, line.id AS bom_line_id, line.quantity
      FROM catalog.bom_lines line
      JOIN catalog.items child ON child.id = line.component_item_id
      WHERE line.parent_item_id = $1
      ORDER BY line.created_at, line.id
    `,
    [itemId]
  )
  return result.rows
}

function storedProductCost(product: ProductRow) {
  if (isBomParent(product.item_type)) {
    return asNumber(product.product_cost_inr)
  }
  if (product.pricing_method === "Direct Purchase") {
    return asNumber(product.direct_purchase_price_per_piece)
  }
  return 0
}

function storedRollupCost(product: ProductRow) {
  return product.pricing_method === "Direct Purchase"
    ? asNumber(product.direct_purchase_price_per_piece)
    : asNumber(product.product_cost_inr)
}

async function rolledProductCost(
  client: PoolClient,
  product: ProductRow,
  seen = new Set<string>()
): Promise<number> {
  if (seen.has(product.id)) {
    return 0
  }
  const storedCost = storedRollupCost(product)
  if (storedCost > 0) {
    return storedCost
  }
  if (!isBomParent(product.item_type)) {
    return 0
  }
  seen.add(product.id)
  const children = await getImmediateChildren(client, product.id)
  let total = 0
  for (const child of children) {
    total +=
      asNumber(child.quantity, 1) *
      (await rolledProductCost(client, child, new Set(seen)))
  }
  return total
}

async function immediatePieceWeight(client: PoolClient, product: ProductRow) {
  if (!isBomParent(product.item_type)) {
    return asNumber(product.weight_100_pcs)
  }
  const children = await getImmediateChildren(client, product.id)
  return children.reduce(
    (total, child) =>
      total + asNumber(child.quantity, 1) * asNumber(child.weight_100_pcs),
    0
  )
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
    directPurchasePricePerKg: asNumber(product.direct_purchase_price_per_kg),
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
    sealant: asNumber(product.sealant),
    uid: product.uid,
    washing: asNumber(product.washing),
    weight100Pcs: asNumber(product.weight_100_pcs),
  }
}

function costingProcesses(sourcePayload: Record<string, unknown>) {
  const firstMaterialLine = sourcePayload.firstMaterialLine
  const firstMaterialRecord =
    firstMaterialLine && typeof firstMaterialLine === "object"
      ? (firstMaterialLine as Record<string, unknown>)
      : null
  const processText =
    firstMaterialRecord?.process_required ??
    firstMaterialRecord?.manufacturing_process ??
    sourcePayload.process_required ??
    sourcePayload.manufacturing_process
  return typeof processText === "string"
    ? processText
        .replace(/^(package\s+process|process)\s*:\s*/i, "")
        .split(/[,;\n]+/)
        .map((process) => process.trim())
        .filter(Boolean)
    : []
}

function productCostingProduct(
  row: ProductRow & {
    machine_type_name: string | null
    material_alloy_premium: string | null
    material_extrusion_cost: string | null
    material_grade_name: string | null
    rod_type_name: string | null
  }
) {
  return {
    alloyPremium:
      asNumber(row.alloy_premium) === 0
        ? asNumber(row.material_alloy_premium)
        : asNumber(row.alloy_premium),
    annealing: asNumber(row.annealing),
    assemblyOperationCost: asNumber(row.assembly_operation_cost),
    buffing: asNumber(row.buffing),
    burningLossPercent: asNumber(row.burning_loss_percent),
    casting: asNumber(row.casting, 1),
    checking: asNumber(row.checking),
    deburring: asNumber(row.deburring),
    description: row.description,
    directPurchasePricePerKg: asNumber(row.direct_purchase_price_per_kg),
    directPurchasePricePerPiece: asNumber(row.direct_purchase_price_per_piece),
    extrusionCost:
      asNumber(row.extrusion_cost) === 0
        ? asNumber(row.material_extrusion_cost)
        : asNumber(row.extrusion_cost),
    forgingCost: asNumber(row.forging_cost),
    id: row.id,
    itemType: row.item_type,
    lifecycleStatus: row.lifecycle_status,
    machineTypeId: row.machine_type_id,
    machineTypeName: row.machine_type_name,
    machiningCost: asNumber(row.machining_cost),
    machiningPricePerPiece: asNumber(row.machining_price_per_piece),
    marking: asNumber(row.marking),
    materialGrade: row.material_grade_name,
    overheadCost: asNumber(row.overhead_cost),
    piecesPerKg: asNumber(row.pieces_per_kg),
    plating: asNumber(row.plating),
    pricingMethod: row.pricing_method,
    processesRequired: costingProcesses(row.source_payload ?? {}),
    productCostInr: asNumber(row.product_cost_inr),
    productionType: row.production_type,
    rejectionPercent: asNumber(row.rejection_percent),
    remarks: row.remarks,
    rodSize: row.rod_size,
    rodType: row.rod_type_name,
    sealant: asNumber(row.sealant),
    uid: row.uid,
    uidKind: row.uid_kind,
    washing: asNumber(row.washing),
    weight100Pcs: asNumber(row.weight_100_pcs),
  }
}

function calculateProductQuote(product: ProductRow, inputs: QuoteInputs) {
  const storedCost = storedProductCost(product)
  const alloyPremium = asNumber(product.alloy_premium)
  const extrusionCost = asNumber(product.extrusion_cost)
  const forgingCost =
    product.production_type?.toLowerCase() === "barstock"
      ? 0
      : asNumber(product.forging_cost)

  if (storedCost > 0) {
    const rejectionCost = storedCost * asNumber(product.rejection_percent)
    const totalA = storedCost + rejectionCost
    const profitB = totalA * inputs.profitPercent
    const totalAPlusB = totalA + profitB
    return {
      alloyPremium,
      extrusionCost,
      forgingCost,
      result: {
        netRateWithAlloy: 0,
        netRateWithoutAlloy: 0,
        piecesPerKg: asNumber(product.pieces_per_kg),
        processCost: storedCost,
        profitB,
        rateInr: totalAPlusB,
        rateUsd:
          inputs.conversionRate > 0 ? totalAPlusB / inputs.conversionRate : 0,
        rawMaterialCost: 0,
        rejectionCost,
        scrapRatePerGm: 0,
        scrapReturn: 0,
        scrapReturnPrice: 0,
        scrapReturnPriceIncludingBurningLoss: 0,
        totalA,
        totalAPlusB,
        totalRateInr: totalAPlusB,
        totalRodsCost: storedCost,
      } satisfies CostingResult,
    }
  }

  return {
    alloyPremium,
    extrusionCost,
    forgingCost,
    result: calculateCosting(
      {
        annealing: asNumber(product.annealing),
        assemblyOperationCost: isBomParent(product.item_type)
          ? asNumber(product.assembly_operation_cost)
          : 0,
        buffing: asNumber(product.buffing),
        burningLossPercent: asNumber(product.burning_loss_percent),
        casting: asNumber(product.casting, 1),
        checking: asNumber(product.checking),
        deburring: asNumber(product.deburring),
        machiningCost: asNumber(product.machining_cost),
        marking: asNumber(product.marking),
        overheadCost: isBomParent(product.item_type)
          ? 0
          : asNumber(product.overhead_cost),
        plating: asNumber(product.plating),
        rejectionPercent: asNumber(product.rejection_percent),
        sealant: asNumber(product.sealant),
        washing: asNumber(product.washing),
        weight100Pcs: asNumber(product.weight_100_pcs),
      },
      {
        alloyPremium,
        assembledPartInr: 0,
        conversionRate: inputs.conversionRate,
        extCost: extrusionCost,
        forgingCost,
        overheadCost: inputs.overheadCost,
        packingCost: inputs.packingCost,
        profitPercent: inputs.profitPercent,
        purchaseTimes: inputs.purchaseTimes,
        scrapRate: inputs.scrapRate,
        shippingCost: inputs.shippingCost,
      }
    ),
  }
}

async function getQuoteWithClient(client: PoolClient, quoteItemId: string) {
  const quote = await client.query<{
    approved_price_usd: string
    company_name: string
    enquiry_item_id: string | null
    id: string
    is_active: boolean
    quote_number: string
    rate_inr: string
    rate_usd: string
    revision: number
    status: string
    total_rate_inr: string
    uid: string
  }>(
    `
      SELECT quote.id, quote.quote_number, quote.revision, quote.status,
        quote.is_active, quote.rate_inr, quote.total_rate_inr,
        quote.rate_usd, quote.approved_price_usd, quote.enquiry_item_id,
        customer.company_name,
        item.uid
      FROM sales.quote_items quote
      JOIN sales.customers customer ON customer.id = quote.customer_id
      JOIN catalog.items item ON item.id = quote.item_id
      WHERE quote.id = $1
    `,
    [quoteItemId]
  )
  if (!quote.rows[0]) {
    throw new Error("Quote was not found.")
  }
  const components = await client.query<{
    child_quote_item_id: string | null
    component_uid: string
    description: string | null
    extended_cost: string
    quantity: string
    unit_cost: string
  }>(
    `
      SELECT component.child_quote_item_id, component.component_uid,
        component.description, component.quantity, component.unit_cost,
        component.extended_cost
      FROM sales.quote_product_snapshots snapshot
      JOIN sales.quote_package_components component
        ON component.quote_product_snapshot_id = snapshot.id
      WHERE snapshot.quote_item_id = $1
      ORDER BY component.sequence, component.created_at
    `,
    [quoteItemId]
  )
  const row = quote.rows[0]
  return {
    approvedPriceUsd: asNumber(row.approved_price_usd),
    companyName: row.company_name,
    components: components.rows.map((component) => ({
      childQuoteItemId: component.child_quote_item_id,
      componentUid: component.component_uid,
      description: component.description,
      extendedCost: asNumber(component.extended_cost),
      quantity: asNumber(component.quantity),
      unitCost: asNumber(component.unit_cost),
    })),
    enquiryItemId: row.enquiry_item_id,
    id: row.id,
    isActive: row.is_active,
    quoteNumber: row.quote_number,
    rateInr: asNumber(row.rate_inr),
    rateUsd: asNumber(row.rate_usd),
    revision: row.revision,
    status: row.status,
    totalRateInr: asNumber(row.total_rate_inr),
    uid: row.uid,
  }
}

async function persistQuote(
  client: PoolClient,
  input: {
    allowRevision?: boolean
    actorUserId?: string | null
    calculation: QuoteCalculation
    components: PackageComponent[]
    customerId: string
    customerPartCode: string | null
    enquiryId: string
    enquiryItemId: string
    enquiryNumber: string
    inputs: QuoteInputs
    item: ProductRow
    organizationId: string
    packaging: string | null
    quantity: number
    shippingTerms: string | null
    status: "Draft" | "Ready"
  }
) {
  const existing = await client.query<{
    id: string
    sent_at: Date | null
    status: string
  }>(
    `
      SELECT id, status, sent_at
      FROM sales.quote_items
      WHERE enquiry_item_id = $1
        AND item_id = $2
        AND status <> 'Superseded'
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `,
    [input.enquiryItemId, input.item.id]
  )
  const lockedExisting =
    existing.rows[0]?.sent_at ||
    (existing.rows[0] && existing.rows[0].status !== "Draft")
  if (lockedExisting && !input.allowRevision) {
    throw new Error(
      "This quote has already been completed or sent. Start a price refresh or technical revision from Sales before editing it."
    )
  }

  const snapshot = productSnapshot(input.item)
  const quoteType =
    input.item.uid_kind === "QUOTE" ? "New Item Quote" : "Existing Item Requote"
  const lineageKey = input.customerPartCode
    ? `code:${input.customerPartCode.trim().toLowerCase()}`
    : `enquiry:${input.enquiryId}:${input.item.id}`
  const quoteNumber = `${input.enquiryNumber}-${input.item.uid}`
  let quoteItemId = lockedExisting ? undefined : existing.rows[0]?.id

  if (quoteItemId) {
    await client.query(
      `
        UPDATE sales.quote_items
        SET customer_part_code = $1, quantity = $2, unit_price = $3,
          currency_code = 'USD', status = $26, is_active = false,
          quote_type = $4, packaging = $5, shipping_terms = $6,
          scrap_rate = $7, alloy_premium = $8, extrusion_cost = $9,
          forging_cost = $10, packing_cost = $11, shipping_cost = $12,
          overhead_cost_input = $13, purchase_times = $14,
          profit_percent = $15, conversion_rate = $16,
          assembled_part_inr = $17, rate_inr = $18,
          total_rate_inr = $19, rate_usd = $20,
          approved_price_usd = $20, calculation_json = $21,
          price_lineage_key = $22, source_payload = $23,
          updated_by_user_id = $24, updated_at = now(),
          row_version = row_version + 1
          WHERE id = $25
      `,
      [
        input.customerPartCode,
        input.quantity,
        input.calculation.rateUsd,
        quoteType,
        input.packaging,
        input.shippingTerms,
        input.inputs.scrapRate,
        snapshot.alloyPremium,
        snapshot.extrusionCost,
        snapshot.forgingCost,
        input.inputs.packingCost,
        input.inputs.shippingCost,
        input.inputs.overheadCost,
        input.inputs.purchaseTimes,
        input.inputs.profitPercent,
        input.inputs.conversionRate,
        input.calculation.childQuoteTotal ?? 0,
        input.calculation.rateInr,
        input.calculation.totalRateInr,
        input.calculation.rateUsd,
        input.calculation,
        lineageKey,
        { inputs: input.inputs, product: snapshot },
        input.actorUserId ?? null,
        quoteItemId,
        input.status,
      ]
    )
  } else {
    const created = await client.query<{ id: string }>(
      `
        INSERT INTO sales.quote_items (
          organization_id, quote_number, revision, enquiry_id,
          enquiry_item_id, customer_id, item_id, lineage_item_id,
          customer_part_code, quantity, unit_price, currency_code, status,
          is_active, quote_type, packaging, shipping_terms, scrap_rate,
          alloy_premium, extrusion_cost, forging_cost, packing_cost,
          shipping_cost, overhead_cost_input, purchase_times, profit_percent,
          conversion_rate, assembled_part_inr, rate_inr, total_rate_inr,
          rate_usd, approved_price_usd, calculation_json, price_lineage_key,
          created_by_user_id, updated_by_user_id, source_system,
          source_table, source_id, source_payload
        )
        VALUES (
          $1, $2, COALESCE((
            SELECT max(prior.revision) + 1
            FROM sales.quote_items prior
            WHERE prior.organization_id = $1 AND prior.quote_number = $2
          ), 1), $3, $4, $5, $6, $6, $7, $8, $9, 'USD', $32,
          false, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24, $25, $26, $26, $27, $28, $29, $29,
          'mrm-dashboard', 'quote_items', $30, $31
        )
        RETURNING id
      `,
      [
        input.organizationId,
        quoteNumber,
        input.enquiryId,
        input.enquiryItemId,
        input.customerId,
        input.item.id,
        input.customerPartCode,
        input.quantity,
        input.calculation.rateUsd,
        quoteType,
        input.packaging,
        input.shippingTerms,
        input.inputs.scrapRate,
        snapshot.alloyPremium,
        snapshot.extrusionCost,
        snapshot.forgingCost,
        input.inputs.packingCost,
        input.inputs.shippingCost,
        input.inputs.overheadCost,
        input.inputs.purchaseTimes,
        input.inputs.profitPercent,
        input.inputs.conversionRate,
        input.calculation.childQuoteTotal ?? 0,
        input.calculation.rateInr,
        input.calculation.totalRateInr,
        input.calculation.rateUsd,
        input.calculation,
        lineageKey,
        input.actorUserId ?? null,
        randomUUID(),
        { inputs: input.inputs, product: snapshot },
        input.status,
      ]
    )
    quoteItemId = created.rows[0]!.id
  }

  const quoteSnapshot = await client.query<{ id: string }>(
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
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, 'pricing-workbook-v1', $18, $19, $20,
        'mrm-dashboard', 'quote_product_snapshots', $21, $22
      )
      ON CONFLICT (quote_item_id) DO UPDATE SET
        item_uid = EXCLUDED.item_uid,
        description = EXCLUDED.description,
        item_type = EXCLUDED.item_type,
        production_type = EXCLUDED.production_type,
        weight_100_pcs = EXCLUDED.weight_100_pcs,
        pieces_per_kg = EXCLUDED.pieces_per_kg,
        material_rate = EXCLUDED.material_rate,
        material_cost = EXCLUDED.material_cost,
        conversion_cost = EXCLUDED.conversion_cost,
        packaging_cost = EXCLUDED.packaging_cost,
        shipping_cost = EXCLUDED.shipping_cost,
        overhead_cost = EXCLUDED.overhead_cost,
        rejection_cost = EXCLUDED.rejection_cost,
        total_cost = EXCLUDED.total_cost,
        quoted_price = EXCLUDED.quoted_price,
        calculation_version = EXCLUDED.calculation_version,
        product_snapshot = EXCLUDED.product_snapshot,
        calculation_json = EXCLUDED.calculation_json,
        source_payload = EXCLUDED.source_payload
      RETURNING id
    `,
    [
      input.organizationId,
      quoteItemId,
      input.item.uid,
      input.item.description,
      input.item.item_type,
      input.item.production_type,
      snapshot.weight100Pcs,
      input.calculation.piecesPerKg,
      input.calculation.netRateWithAlloy,
      input.calculation.totalRodsCost,
      input.calculation.processCost,
      input.inputs.packingCost,
      input.inputs.shippingCost,
      input.inputs.overheadCost,
      input.calculation.rejectionCost,
      input.calculation.totalRateInr,
      input.calculation.rateUsd,
      snapshot,
      input.calculation,
      input.actorUserId ?? null,
      `${quoteItemId}:snapshot`,
      { inputs: input.inputs, product: snapshot },
    ]
  )
  await client.query(
    "DELETE FROM sales.quote_package_components WHERE quote_product_snapshot_id = $1",
    [quoteSnapshot.rows[0]!.id]
  )
  for (const [sequence, component] of input.components.entries()) {
    await client.query(
      `
        INSERT INTO sales.quote_package_components (
          organization_id, quote_product_snapshot_id, child_quote_item_id,
          component_item_id, component_uid, description, quantity,
          unit_cost, extended_cost, sequence, created_by_user_id,
          source_system, source_table, source_id, source_payload
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          'mrm-dashboard', 'quote_package_components', $12, $13
        )
      `,
      [
        input.organizationId,
        quoteSnapshot.rows[0]!.id,
        component.childQuoteItemId,
        component.componentItemId,
        component.componentUid,
        component.description,
        component.quantity,
        component.unitCost,
        component.extendedCost,
        sequence,
        input.actorUserId ?? null,
        `${quoteItemId}:${sequence}`,
        component,
      ]
    )
  }
  return quoteItemId
}

export function createCommercialCostingRepository(
  options: RepositoryPoolOptions
) {
  const { close, pool } = repositoryPool(options)

  const pricingRegisterBatch = async (
    queryable: Pool | PoolClient,
    organizationCode: string,
    input: {
      cursor?: {
        companyName: string
        customerPartCode: string
        id: string
        revision: number
      }
      customerId?: string
      customerPartCode?: string
      limit?: number
      query?: string
      revisions?: boolean
    }
  ) => {
    const cursor = input.cursor
    const search = selectorSearchTerm(input.query ?? "")
    const customerPartCode =
      input.customerPartCode?.trim().toLowerCase() || null
    const result = await queryable.query<PricingRegisterDatabaseRow>(
      `
        WITH RECURSIVE roots AS (
          SELECT quote.*, customer.company_name AS root_company_name,
            COALESCE(quote.customer_part_code, '')
              AS root_customer_part_code
          FROM sales.quote_items quote
          JOIN core.organizations organization
            ON organization.id = quote.organization_id
          JOIN sales.customers customer ON customer.id = quote.customer_id
          JOIN catalog.items root_item ON root_item.id = quote.item_id
          WHERE lower(organization.code) = lower($1)
            AND (
              $2::boolean
              OR quote.status IN ('Draft', 'Ready')
              OR quote.is_active
            )
            AND NOT EXISTS (
              SELECT 1
              FROM sales.quote_package_components component
              WHERE component.child_quote_item_id = quote.id
            )
            AND ($8::uuid IS NULL OR quote.customer_id = $8)
            AND (
              $9::text IS NULL
              OR lower(btrim(coalesce(quote.customer_part_code, ''))) = $9
            )
            AND (
              $10 = ''
              OR lower(btrim(coalesce(quote.customer_part_code, ''))) = $10
              OR lower(btrim(quote.quote_number)) = $10
              OR lower(btrim(customer.customer_uid)) = $10
              OR lower(btrim(root_item.uid)) = $10
              OR (
                $11::text IS NOT NULL
                AND (
                  lower(
                    btrim(coalesce(quote.customer_part_code, '')) || ' ' ||
                    btrim(quote.quote_number)
                  ) LIKE $11 ESCAPE '\\'
                  OR lower(
                    coalesce(root_item.uid, '') || ' ' ||
                    coalesce(root_item.description, '')
                  ) LIKE $11 ESCAPE '\\'
                  OR lower(
                    customer.company_name || ' ' || customer.customer_uid
                  ) LIKE $11 ESCAPE '\\'
                )
              )
            )
            AND (
              $3::text IS NULL
              OR (
                customer.company_name,
                COALESCE(quote.customer_part_code, ''),
                -quote.revision,
                quote.id
              ) > ($3::text, $4::text, -$5::integer, $6::uuid)
            )
          ORDER BY customer.company_name,
            COALESCE(quote.customer_part_code, ''),
            quote.revision DESC, quote.id
          LIMIT $7
        ),
        quote_tree AS (
          SELECT root.id AS root_quote_item_id,
            root.id AS quote_item_id, root.item_id,
            NULL::uuid AS parent_item_id, 0 AS component_depth,
            1::numeric AS component_quantity, ARRAY[root.id] AS path
          FROM roots root
          UNION ALL
          SELECT tree.root_quote_item_id, component.child_quote_item_id,
            component.component_item_id, tree.item_id,
            tree.component_depth + 1, component.quantity,
            tree.path || COALESCE(component.child_quote_item_id,
              component.component_item_id)
          FROM quote_tree tree
          JOIN sales.quote_product_snapshots parent_snapshot
            ON parent_snapshot.quote_item_id = tree.quote_item_id
          JOIN sales.quote_package_components component
            ON component.quote_product_snapshot_id = parent_snapshot.id
          WHERE tree.component_depth < 10
            AND NOT COALESCE(component.child_quote_item_id,
              component.component_item_id) = ANY(tree.path)
        )
        SELECT COALESCE(member.id, tree.item_id) AS id,
          tree.root_quote_item_id::text || ':' ||
            array_to_string(tree.path, '/') AS row_key,
          root.id AS root_quote_item_id,
          root.root_company_name, root.root_customer_part_code,
          root.quote_number, root.revision, root.status, root.is_active,
          root.sent_at, CASE WHEN tree.component_depth = 0
            THEN root.customer_part_code ELSE NULL END
            AS customer_part_code,
          COALESCE(member.unit_price, 0)::text AS unit_price,
          customer.id AS customer_id, customer.customer_uid,
          customer.company_name, item.uid,
          CASE WHEN item.lifecycle_status = 'P'
            THEN website.product_description ELSE NULL END
            AS website_product_description,
          CASE WHEN item.lifecycle_status = 'P'
            THEN website.size ELSE NULL END AS website_size,
          COALESCE(snapshot.item_type, item.item_type) AS item_type,
          item.lifecycle_status, enquiry.enquiry_number,
          enquiry.currency, enquiry_item.line_number,
          enquiry_item.description AS enquiry_description,
          parent.uid AS parent_uid, tree.component_depth,
          tree.component_quantity::text,
          COALESCE(member.updated_at, item.updated_at) AS change_date,
          COALESCE(snapshot.product_snapshot, '{}'::jsonb)
            AS product_snapshot,
          COALESCE(snapshot.calculation_json, '{}'::jsonb)
            AS calculation_json,
          jsonb_build_object(
            'scrapRate', COALESCE(member.scrap_rate, root.scrap_rate),
            'packingCost', COALESCE(member.packing_cost, root.packing_cost),
            'shippingCost', COALESCE(member.shipping_cost, root.shipping_cost),
            'overheadCost', COALESCE(member.overhead_cost_input,
              root.overhead_cost_input),
            'purchaseTimes', COALESCE(member.purchase_times,
              root.purchase_times),
            'profitPercent', COALESCE(member.profit_percent,
              root.profit_percent),
            'conversionRate', COALESCE(member.conversion_rate,
              root.conversion_rate),
            'assembledPartInr', COALESCE(member.assembled_part_inr, 0)
          ) AS quote_inputs,
          jsonb_build_object(
            'grade', grade.name,
            'rodType', rod_type.name,
            'machineType', machine_type.name,
            'rodSize', item.rod_size,
            'dieCode', item.die_code,
            'remarks', item.remarks
          ) AS product_context,
          COALESCE(member.packaging, root.packaging) AS packaging,
          COALESCE(member.shipping_terms, root.shipping_terms)
            AS shipping_terms
        FROM quote_tree tree
        JOIN roots root ON root.id = tree.root_quote_item_id
        LEFT JOIN sales.quote_items member ON member.id = tree.quote_item_id
        JOIN sales.customers customer ON customer.id = root.customer_id
        JOIN catalog.items item ON item.id = tree.item_id
        LEFT JOIN catalog.website_product_profiles website
          ON website.item_id = item.id
        LEFT JOIN catalog.items parent ON parent.id = tree.parent_item_id
        LEFT JOIN catalog.material_grades grade
          ON grade.id = item.material_grade_id
        LEFT JOIN catalog.rod_types rod_type ON rod_type.id = item.rod_type_id
        LEFT JOIN catalog.machine_types machine_type
          ON machine_type.id = item.machine_type_id
        LEFT JOIN sales.enquiries enquiry ON enquiry.id = root.enquiry_id
        LEFT JOIN sales.enquiry_items enquiry_item
          ON enquiry_item.id = root.enquiry_item_id
        LEFT JOIN sales.quote_product_snapshots snapshot
          ON snapshot.quote_item_id = tree.quote_item_id
        ORDER BY root.root_company_name, root.root_customer_part_code,
          root.revision DESC, root.id, tree.path
      `,
      [
        organizationCode.trim(),
        input.revisions ?? false,
        cursor?.companyName ?? null,
        cursor?.customerPartCode ?? null,
        cursor?.revision ?? null,
        cursor?.id ?? null,
        input.limit ?? null,
        input.customerId ?? null,
        customerPartCode,
        search.query,
        search.containsPattern,
      ]
    )
    return result.rows
  }

  const productPricingRegisterBatch = async (
    queryable: Pool | PoolClient,
    organizationCode: string,
    input: {
      cursor?: { id: string; uid: string }
      limit: number
      query?: string
    }
  ) => {
    const search = selectorSearchTerm(input.query ?? "")
    const result = await queryable.query<PricingRegisterDatabaseRow>(
      `
        SELECT item.id, 'product:' || item.id::text AS row_key,
          item.id AS root_quote_item_id, ''::text AS root_company_name,
          item.uid AS root_customer_part_code, ''::text AS quote_number,
          0 AS revision, ''::text AS status, false AS is_active,
          NULL::timestamptz AS sent_at, NULL::text AS customer_part_code,
          item.product_cost_inr::text AS unit_price,
          ''::text AS customer_id, ''::text AS customer_uid,
          ''::text AS company_name, item.uid,
          website.product_description AS website_product_description,
          website.size AS website_size, item.item_type,
          item.lifecycle_status, NULL::text AS enquiry_number,
          'INR'::text AS currency, NULL::integer AS line_number,
          ''::text AS enquiry_description, NULL::text AS parent_uid,
          0 AS component_depth, '1'::text AS component_quantity,
          item.updated_at AS change_date,
          jsonb_build_object(
            'description', item.description,
            'uid', item.uid,
            'pricingMethod', item.pricing_method,
            'productionType', item.production_type,
            'weight100Pcs', item.weight_100_pcs,
            'casting', item.casting,
            'alloyPremium', item.alloy_premium,
            'extrusionCost', item.extrusion_cost,
            'forgingCost', item.forging_cost,
            'directPurchasePricePerKg', item.direct_purchase_price_per_kg,
            'directPurchasePricePerPiece', item.direct_purchase_price_per_piece,
            'productCostInr', item.product_cost_inr,
            'machiningCost', item.machining_cost,
            'machiningPricePerPiece', item.machining_price_per_piece,
            'washing', item.washing,
            'checking', item.checking,
            'marking', item.marking,
            'plating', item.plating,
            'annealing', item.annealing,
            'deburring', item.deburring,
            'buffing', item.buffing,
            'sealant', item.sealant,
            'assemblyOperationCost', item.assembly_operation_cost,
            'overheadCost', item.overhead_cost,
            'rejectionPercent', item.rejection_percent,
            'burningLossPercent', item.burning_loss_percent
          ) AS product_snapshot,
          jsonb_build_object(
            'piecesPerKg', item.pieces_per_kg
          ) AS calculation_json,
          '{}'::jsonb AS quote_inputs,
          jsonb_build_object(
            'grade', grade.name,
            'rodType', rod_type.name,
            'machineType', machine_type.name,
            'rodSize', item.rod_size,
            'dieCode', item.die_code,
            'remarks', item.remarks
          ) AS product_context,
          NULL::text AS packaging, NULL::text AS shipping_terms
        FROM catalog.items item
        JOIN core.organizations organization
          ON organization.id = item.organization_id
        LEFT JOIN catalog.website_product_profiles website
          ON website.item_id = item.id
        LEFT JOIN catalog.material_grades grade
          ON grade.id = item.material_grade_id
        LEFT JOIN catalog.rod_types rod_type
          ON rod_type.id = item.rod_type_id
        LEFT JOIN catalog.machine_types machine_type
          ON machine_type.id = item.machine_type_id
        WHERE lower(organization.code) = lower($1)
          AND item.lifecycle_status = 'P'
          AND NOT EXISTS (
            SELECT 1
            FROM sales.quote_items quote
            WHERE quote.organization_id = item.organization_id
              AND quote.item_id = item.id
              AND (
                quote.status IN ('Draft', 'Ready')
                OR quote.is_active
              )
          )
          AND (
            $2::text IS NULL
            OR (item.uid, item.id) > ($2::text, $3::uuid)
          )
          AND (
            $5 = ''
            OR lower(btrim(item.uid)) = $5
            OR (
              $6::text IS NOT NULL
              AND lower(
                coalesce(item.uid, '') || ' ' || coalesce(item.description, '')
              ) LIKE $6 ESCAPE '\\'
            )
          )
        ORDER BY item.uid, item.id
        LIMIT $4
      `,
      [
        organizationCode.trim(),
        input.cursor?.uid ?? null,
        input.cursor?.id ?? null,
        input.limit,
        search.query,
        search.containsPattern,
      ]
    )
    return result.rows
  }

  return {
    close,

    async listCustomerCostingTasksBounded(
      organizationCode: string,
      requestedLimit = 200
    ) {
      const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 200)
      const result = await pool.query<{
        company_name: string | null
        created_at: Date
        description: string
        detail: string
        enquiry_item_id: string | null
        item_id: string | null
        quote_revision_request_id: string | null
        reference: string
        status: string
        target_price: string | null
        task_id: string
        task_type: string
        uid: string
      }>(
        `
          WITH organization AS (
            SELECT id FROM core.organizations
            WHERE lower(code) = lower($1)
          ), queue AS (
            SELECT design.id AS task_id, 'New Quote Costing'::text AS task_type,
              enquiry.enquiry_number || ' / Line ' || enquiry_item.line_number
                AS reference,
              customer.company_name, item.uid, item.description,
              COALESCE(latest_quote.status, design.next_stage_status) AS status,
              'Customer-specific price'::text AS detail,
              design.enquiry_item_id, item.id AS item_id,
              NULL::uuid AS quote_revision_request_id,
              NULL::numeric AS target_price, design.updated_at AS created_at,
              1 AS sort_order
            FROM sales.design_tasks design
            JOIN sales.enquiry_items enquiry_item
              ON enquiry_item.id = design.enquiry_item_id
            JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
            JOIN sales.customers customer ON customer.id = enquiry.customer_id
            JOIN LATERAL (
              SELECT candidate.* FROM catalog.items candidate
              WHERE candidate.organization_id = enquiry.organization_id
                AND (
                  candidate.id = COALESCE(
                    design.matched_product_id, enquiry_item.item_id
                  )
                  OR (
                    design.matched_product_id IS NULL
                    AND enquiry_item.item_id IS NULL
                    AND lower(candidate.uid) = lower(design.quoted_part_uid)
                  )
                )
              ORDER BY CASE
                WHEN candidate.id = COALESCE(
                  design.matched_product_id, enquiry_item.item_id
                ) THEN 0 ELSE 1
              END
              LIMIT 1
            ) item ON true
            LEFT JOIN LATERAL (
              SELECT quote.status
              FROM sales.quote_items quote
              WHERE quote.enquiry_item_id = design.enquiry_item_id
                AND quote.item_id = item.id
                AND quote.status <> 'Superseded'
              ORDER BY quote.created_at DESC, quote.id DESC
              LIMIT 1
            ) latest_quote ON true
            WHERE enquiry.organization_id = (SELECT id FROM organization)
              AND design.next_stage_status IN (
                'Product Costing Complete', 'Started'
              )
              AND COALESCE(latest_quote.status, 'Draft') = 'Draft'

            UNION ALL

            SELECT revision.id, 'Bulk Price Revision',
              revision.revision_number, customer.company_name,
              'Multiple Products', revision.reason, revision.status,
              revision.revision_route, NULL, NULL, NULL, NULL,
              revision.created_at, 2
            FROM sales.bulk_price_revisions revision
            LEFT JOIN sales.customers customer ON customer.id = revision.customer_id
            WHERE revision.organization_id = (SELECT id FROM organization)
              AND revision.revision_route IN (
                'Customer Parameter Bulk Revision',
                'Customer Parameter Costing Only', 'Bulk Revision',
                'Product Parameter Bulk Revision'
              )
              AND revision.status IN (
                'Pending Costing', 'Pending Customer Costing'
              )

            UNION ALL

            SELECT ecn.id, 'ECN Price Review', ecn.ecn_number, NULL,
              item.uid, item.description, ecn.status, ecn.reason,
              NULL, item.id, NULL, NULL, ecn.updated_at, 3
            FROM sales.engineering_change_notes ecn
            JOIN catalog.items item ON item.id = ecn.item_id
            WHERE ecn.organization_id = (SELECT id FROM organization)
              AND ecn.status = 'Pending Costing'

            UNION ALL

            SELECT request.id, 'PO Price Match', purchase_order.po_number ||
              ' / Line ' || purchase_line.line_number,
              customer.company_name, item.uid,
              COALESCE(purchase_line.description, item.description),
              request.status, 'Target ' || request.currency_code || ' ' ||
                request.requested_price::text,
              quote.enquiry_item_id, request.item_id, request.id,
              request.requested_price, request.created_at, 4
            FROM sales.quote_revision_requests request
            JOIN sales.purchase_order_lines purchase_line
              ON purchase_line.id = request.purchase_order_line_id
            JOIN sales.purchase_orders purchase_order
              ON purchase_order.id = purchase_line.purchase_order_id
            JOIN sales.customers customer ON customer.id = purchase_order.customer_id
            JOIN sales.quote_items quote ON quote.id = request.quote_item_id
            JOIN catalog.items item ON item.id = request.item_id
            WHERE request.organization_id = (SELECT id FROM organization)
              AND request.status = 'Open'
          )
          SELECT task_id, task_type, reference, company_name, uid, description,
            detail, status, enquiry_item_id, item_id,
            quote_revision_request_id, target_price::text, created_at
          FROM queue
          ORDER BY sort_order, created_at DESC, task_id
          LIMIT $2
        `,
        [organizationCode.trim(), limit + 1]
      )
      return boundedResult(
        result.rows.map((row) => ({
          companyName: row.company_name,
          description: row.description,
          detail: row.detail,
          enquiryItemId: row.enquiry_item_id,
          itemId: row.item_id,
          quoteRevisionRequestId: row.quote_revision_request_id,
          reference: row.reference,
          status: row.status,
          targetPrice:
            row.target_price === null ? null : asNumber(row.target_price),
          taskId: row.task_id,
          taskType: row.task_type,
          uid: row.uid,
        })),
        limit,
        result.rows.length > limit
      )
    },

    async getCustomerCostingTaskSummary(organizationCode: string) {
      const result = await pool.query<{
        bulk_price_revision: string
        ecn_price_review: string
        new_quote_costing: string
        po_price_match: string
      }>(
        `
          SELECT
            (
              SELECT count(*)::text
              FROM sales.design_tasks design
              JOIN sales.enquiry_items enquiry_item
                ON enquiry_item.id = design.enquiry_item_id
              JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
              WHERE enquiry.organization_id = organization.id
                AND design.next_stage_status IN (
                  'Product Costing Complete', 'Started'
                )
                AND NOT EXISTS (
                  SELECT 1 FROM sales.quote_items quote
                  WHERE quote.enquiry_item_id = design.enquiry_item_id
                    AND quote.status IN ('Ready', 'Sent', 'Accepted')
                )
            ) AS new_quote_costing,
            (
              SELECT count(*)::text FROM sales.quote_revision_requests request
              WHERE request.organization_id = organization.id
                AND request.status = 'Open'
            ) AS po_price_match,
            (
              SELECT count(*)::text FROM sales.bulk_price_revisions revision
              WHERE revision.organization_id = organization.id
                AND revision.revision_route IN (
                  'Customer Parameter Bulk Revision',
                  'Customer Parameter Costing Only', 'Bulk Revision',
                  'Product Parameter Bulk Revision'
                )
                AND revision.status IN (
                  'Pending Costing', 'Pending Customer Costing'
                )
            ) AS bulk_price_revision,
            (
              SELECT count(*)::text FROM sales.engineering_change_notes ecn
              WHERE ecn.organization_id = organization.id
                AND ecn.status = 'Pending Costing'
            ) AS ecn_price_review
          FROM core.organizations organization
          WHERE lower(organization.code) = lower($1)
        `,
        [organizationCode.trim()]
      )
      const row = result.rows[0] ?? {
        bulk_price_revision: "0",
        ecn_price_review: "0",
        new_quote_costing: "0",
        po_price_match: "0",
      }
      const newQuoteCosting = Number(row.new_quote_costing)
      const poPriceMatch = Number(row.po_price_match)
      const bulkPriceRevision = Number(row.bulk_price_revision)
      const ecnPriceReview = Number(row.ecn_price_review)
      return {
        bulkPriceRevision,
        ecnPriceReview,
        newQuoteCosting,
        poPriceMatch,
        total:
          newQuoteCosting + poPriceMatch + bulkPriceRevision + ecnPriceReview,
      }
    },

    async getProductCostingProduct(organizationCode: string, itemId: string) {
      const result = await pool.query<
        ProductRow & {
          machine_type_name: string | null
          material_alloy_premium: string | null
          material_extrusion_cost: string | null
          material_grade_name: string | null
          rod_type_name: string | null
        }
      >(
        `
          SELECT item.*, grade.name AS material_grade_name,
            rod_type.name AS rod_type_name,
            machine_type.name AS machine_type_name,
            material_rate.alloy_premium AS material_alloy_premium,
            material_rate.extrusion_cost AS material_extrusion_cost
          FROM catalog.items item
          JOIN core.organizations organization
            ON organization.id = item.organization_id
          LEFT JOIN catalog.material_grades grade
            ON grade.id = item.material_grade_id
          LEFT JOIN catalog.rod_types rod_type
            ON rod_type.id = item.rod_type_id
          LEFT JOIN catalog.machine_types machine_type
            ON machine_type.id = item.machine_type_id
          LEFT JOIN LATERAL (
            SELECT rate.alloy_premium, rate.extrusion_cost
            FROM sales.material_rates rate
            WHERE rate.organization_id = item.organization_id
              AND rate.material_grade_id = item.material_grade_id
              AND rate.rod_type_id = item.rod_type_id
              AND rate.active
            ORDER BY rate.effective_on DESC, rate.created_at DESC
            LIMIT 1
          ) material_rate ON true
          WHERE lower(organization.code) = lower($1) AND item.id = $2
        `,
        [organizationCode.trim(), itemId]
      )
      return result.rows[0] ? productCostingProduct(result.rows[0]) : null
    },

    async listProductCostingTasksBounded(
      organizationCode: string,
      requestedLimit = 200
    ) {
      const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 200)
      const result = await pool.query<{
        company_name: string | null
        created_at: Date
        description: string
        detail: string
        enquiry_item_id: string | null
        item_id: string | null
        next_stage_status: string
        reference: string
        task_id: string
        task_type: string
        uid: string
      }>(
        `
          WITH organization AS (
            SELECT id FROM core.organizations
            WHERE lower(code) = lower($1)
          ), queue AS (
            SELECT revision.id AS task_id,
              'Product Parameter Bulk Revision'::text AS task_type,
              revision.revision_number AS reference,
              customer.company_name, 'Multiple Products'::text AS uid,
              revision.reason AS description,
              revision.revision_route AS detail, revision.status,
              NULL::uuid AS enquiry_item_id, NULL::uuid AS item_id,
              revision.created_at, 1 AS sort_order
            FROM sales.bulk_price_revisions revision
            LEFT JOIN sales.customers customer ON customer.id = revision.customer_id
            WHERE revision.organization_id = (SELECT id FROM organization)
              AND revision.revision_route = 'Product Parameter Bulk Revision'
              AND revision.status NOT IN ('Completed', 'Pending Customer Costing')

            UNION ALL

            SELECT design.id, 'Product Parameter Costing',
              enquiry.enquiry_number || ' / Line ' || enquiry_item.line_number,
              customer.company_name, item.uid, item.description,
              item.item_type, design.next_stage_status,
              design.enquiry_item_id, item.id, design.updated_at, 2
            FROM sales.design_tasks design
            JOIN sales.enquiry_items enquiry_item
              ON enquiry_item.id = design.enquiry_item_id
            JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
            JOIN sales.customers customer ON customer.id = enquiry.customer_id
            JOIN LATERAL (
              SELECT candidate.* FROM catalog.items candidate
              WHERE candidate.organization_id = enquiry.organization_id
                AND (
                  candidate.id = enquiry_item.item_id
                  OR (
                    enquiry_item.item_id IS NULL
                    AND lower(candidate.uid) = lower(design.quoted_part_uid)
                  )
                )
              ORDER BY CASE WHEN candidate.id = enquiry_item.item_id THEN 0 ELSE 1 END
              LIMIT 1
            ) item ON true
            WHERE enquiry.organization_id = (SELECT id FROM organization)
              AND design.matched_product_id IS NULL
              AND design.design_status IN ('Design Complete', 'Not Required')
              AND design.next_stage_status = 'Product Costing'

            UNION ALL

            SELECT ecn.id, 'ECN Product Parameter Costing', ecn.ecn_number,
              NULL, item.uid, item.description, ecn.reason, ecn.status,
              NULL, item.id, ecn.updated_at, 3
            FROM sales.engineering_change_notes ecn
            JOIN catalog.items item ON item.id = ecn.item_id
            WHERE ecn.organization_id = (SELECT id FROM organization)
              AND ecn.status = 'Pending Product Costing'
          )
          SELECT task_id, task_type, reference, company_name, uid, description,
            detail, status AS next_stage_status, enquiry_item_id, item_id,
            created_at
          FROM queue
          ORDER BY sort_order, created_at DESC, task_id
          LIMIT $2
        `,
        [organizationCode.trim(), limit + 1]
      )
      return boundedResult(
        result.rows.map((row) => ({
          companyName: row.company_name,
          description: row.description,
          detail: row.detail,
          enquiryItemId: row.enquiry_item_id,
          itemId: row.item_id,
          nextStageStatus: row.next_stage_status,
          reference: row.reference,
          taskId: row.task_id,
          taskType: row.task_type,
          uid: row.uid,
        })),
        limit,
        result.rows.length > limit
      )
    },

    async getProductCostingTaskSummary(organizationCode: string) {
      const result = await pool.query<{
        ecn: string
        new_product_costing: string
        product_bulk_revisions: string
      }>(
        `
          SELECT
            (
              SELECT count(*)::text
              FROM sales.design_tasks design
              JOIN sales.enquiry_items enquiry_item
                ON enquiry_item.id = design.enquiry_item_id
              JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
              WHERE enquiry.organization_id = organization.id
                AND design.matched_product_id IS NULL
                AND design.design_status IN ('Design Complete', 'Not Required')
                AND design.next_stage_status = 'Product Costing'
            ) AS new_product_costing,
            (
              SELECT count(*)::text FROM sales.bulk_price_revisions revision
              WHERE revision.organization_id = organization.id
                AND revision.revision_route = 'Product Parameter Bulk Revision'
                AND revision.status NOT IN ('Completed', 'Pending Customer Costing')
            ) AS product_bulk_revisions,
            (
              SELECT count(*)::text FROM sales.engineering_change_notes ecn
              WHERE ecn.organization_id = organization.id
                AND ecn.status = 'Pending Product Costing'
            ) AS ecn
          FROM core.organizations organization
          WHERE lower(organization.code) = lower($1)
        `,
        [organizationCode.trim()]
      )
      const row = result.rows[0] ?? {
        ecn: "0",
        new_product_costing: "0",
        product_bulk_revisions: "0",
      }
      const newProductCosting = Number(row.new_product_costing)
      const productBulkRevisions = Number(row.product_bulk_revisions)
      const ecn = Number(row.ecn)
      return {
        ecn,
        newProductCosting,
        productBulkRevisions,
        total: newProductCosting + productBulkRevisions + ecn,
      }
    },

    async listProductCostingReferenceData(organizationCode: string) {
      const result = await pool.query<{ id: string; name: string }>(
        `
          SELECT machine_type.id, machine_type.name
          FROM catalog.machine_types machine_type
          JOIN core.organizations organization
            ON organization.id = machine_type.organization_id
          WHERE lower(organization.code) = lower($1)
          ORDER BY lower(machine_type.name), machine_type.id
        `,
        [organizationCode.trim()]
      )
      return { machineTypes: result.rows }
    },

    async updateProductCostParameters(input: {
      action?: "complete" | "in_progress"
      actorUserId?: string | null
      alloyPremium?: number | null
      annealing?: number
      assemblyOperationCost?: number
      buffing?: number
      burningLossPercent?: number
      checking?: number
      deburring?: number
      directPurchasePricePerKg?: number
      extrusionCost?: number | null
      forgingCost?: number
      itemId: string
      machineTypeId?: string | null
      machiningCost?: number
      marking?: number
      overheadCost?: number
      piecesPerKg?: number | null
      plating?: number
      pricingMethod?: "Derived" | "Direct Purchase"
      rejectionPercent?: number
      remarks?: string | null
      sealant?: number
      washing?: number
      weight100Pcs?: number
    }) {
      return transaction(pool, async (client) => {
        const product = await getProduct(client, input.itemId, true)
        const materialRate =
          product.material_grade_id && product.rod_type_id
            ? await client.query<{
                alloy_premium: string
                extrusion_cost: string
              }>(
                `
                  SELECT alloy_premium, extrusion_cost
                  FROM sales.material_rates
                  WHERE organization_id = $1
                    AND material_grade_id = $2
                    AND rod_type_id = $3
                    AND active
                  ORDER BY effective_on DESC, created_at DESC
                  LIMIT 1
                `,
                [
                  product.organization_id,
                  product.material_grade_id,
                  product.rod_type_id,
                ]
              )
            : null
        const isPackage = isBomParent(product.item_type)
        const weight100Pcs = isPackage
          ? await immediatePieceWeight(client, product)
          : (input.weight100Pcs ?? asNumber(product.weight_100_pcs))
        const piecesPerKg =
          !isPackage && input.piecesPerKg && input.piecesPerKg > 0
            ? input.piecesPerKg
            : weight100Pcs > 0
              ? 1000 / weight100Pcs
              : 0
        const pricingMethod = input.pricingMethod ?? product.pricing_method
        const isDirectPurchase = pricingMethod === "Direct Purchase"
        const machiningCost = isDirectPurchase
          ? 0
          : (input.machiningCost ?? asNumber(product.machining_cost))
        const machiningPricePerPiece =
          piecesPerKg > 0 ? machiningCost / piecesPerKg : 0
        const directPurchasePricePerKg =
          input.directPurchasePricePerKg ??
          asNumber(product.direct_purchase_price_per_kg)
        const directPurchasePricePerPiece =
          pricingMethod === "Direct Purchase" && piecesPerKg > 0
            ? directPurchasePricePerKg / piecesPerKg
            : asNumber(product.direct_purchase_price_per_piece)
        const assemblyOperationCost = isPackage
          ? (input.assemblyOperationCost ??
            asNumber(product.assembly_operation_cost))
          : 0
        const packageAssemblyCostPerPiece =
          isPackage && piecesPerKg > 0 ? assemblyOperationCost / piecesPerKg : 0
        let componentCost = 0
        let hasOpenPackageChildren = false
        if (isPackage) {
          const children = await getImmediateChildren(client, product.id)
          for (const child of children) {
            componentCost +=
              asNumber(child.quantity, 1) *
              (await rolledProductCost(client, child))
            if (
              child.lifecycle_status !== "P" &&
              asNumber(child.product_cost_inr) <= 0
            ) {
              hasOpenPackageChildren = true
            }
          }
        }
        const productCostInr = isPackage
          ? componentCost + packageAssemblyCostPerPiece
          : pricingMethod === "Direct Purchase"
            ? directPurchasePricePerPiece
            : machiningPricePerPiece
        const alloyPremium = isDirectPurchase
          ? 0
          : (input.alloyPremium ??
            asNumber(
              materialRate?.rows[0]?.alloy_premium,
              asNumber(product.alloy_premium)
            ))
        const extrusionCost = isDirectPurchase
          ? 0
          : (input.extrusionCost ??
            asNumber(
              materialRate?.rows[0]?.extrusion_cost,
              asNumber(product.extrusion_cost)
            ))
        const forgingCost =
          isDirectPurchase ||
          product.production_type?.toLowerCase() === "barstock"
            ? 0
            : (input.forgingCost ?? asNumber(product.forging_cost))
        const overheadCost =
          isPackage || isDirectPurchase
            ? 0
            : (input.overheadCost ?? asNumber(product.overhead_cost))
        const updated = await client.query<ProductRow>(
          `
            UPDATE catalog.items
            SET weight_100_pcs = $1, alloy_premium = $2,
              extrusion_cost = $3, forging_cost = $4, pricing_method = $5,
              pieces_per_kg = $6, direct_purchase_price_per_kg = $7,
              direct_purchase_price_per_piece = $8,
              product_cost_inr = $9, machining_price_per_piece = $10,
              machining_cost = $11, washing = $12, checking = $13,
              marking = $14, plating = $15, annealing = $16,
              deburring = $17, buffing = $18, sealant = $19,
              assembly_operation_cost = $20, overhead_cost = $21,
              rejection_percent = $22, burning_loss_percent = $23,
              machine_type_id = $24, remarks = $25,
              updated_by_user_id = $26, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $27
            RETURNING *
          `,
          [
            weight100Pcs,
            alloyPremium,
            extrusionCost,
            forgingCost,
            pricingMethod,
            piecesPerKg,
            directPurchasePricePerKg,
            directPurchasePricePerPiece,
            productCostInr,
            machiningPricePerPiece,
            machiningCost,
            isDirectPurchase ? 0 : (input.washing ?? asNumber(product.washing)),
            isDirectPurchase
              ? 0
              : (input.checking ?? asNumber(product.checking)),
            isDirectPurchase ? 0 : (input.marking ?? asNumber(product.marking)),
            isDirectPurchase ? 0 : (input.plating ?? asNumber(product.plating)),
            isDirectPurchase
              ? 0
              : (input.annealing ?? asNumber(product.annealing)),
            isDirectPurchase
              ? 0
              : (input.deburring ?? asNumber(product.deburring)),
            isDirectPurchase ? 0 : (input.buffing ?? asNumber(product.buffing)),
            isDirectPurchase ? 0 : (input.sealant ?? asNumber(product.sealant)),
            assemblyOperationCost,
            overheadCost,
            input.rejectionPercent ?? asNumber(product.rejection_percent),
            isDirectPurchase
              ? 0
              : (input.burningLossPercent ??
                asNumber(product.burning_loss_percent)),
            isDirectPurchase
              ? null
              : (input.machineTypeId ?? product.machine_type_id),
            input.remarks ?? null,
            input.actorUserId ?? null,
            product.id,
          ]
        )
        const nextStageStatus =
          input.action === "complete" && !hasOpenPackageChildren
            ? "Product Costing Complete"
            : "Product Costing"
        await client.query(
          `
            UPDATE sales.design_tasks
            SET next_stage_status = $1, updated_by_user_id = $2,
              updated_at = now(), row_version = row_version + 1
            WHERE matched_product_id = $3
               OR COALESCE(quoted_part_uid, internal_drawing_no) = $4
          `,
          [nextStageStatus, input.actorUserId ?? null, product.id, product.uid]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "product.costing_updated",
          metadata: { action: input.action ?? "in_progress", nextStageStatus },
          organizationId: product.organization_id,
          targetId: product.id,
          targetTable: "items",
        })
        const row = updated.rows[0]!
        return {
          alloyPremium: asNumber(row.alloy_premium),
          assemblyOperationCost: asNumber(row.assembly_operation_cost),
          extrusionCost: asNumber(row.extrusion_cost),
          forgingCost: asNumber(row.forging_cost),
          id: row.id,
          machiningPricePerPiece: asNumber(row.machining_price_per_piece),
          nextStageStatus,
          piecesPerKg: asNumber(row.pieces_per_kg),
          productCostInr: asNumber(row.product_cost_inr),
        }
      })
    },

    async saveQuote(input: {
      action?: "complete" | "in_progress"
      actorUserId?: string | null
      assemblyProfitPercents?: Array<{
        itemId: string
        profitPercent: number
      }>
      childInputs?: Array<{
        itemId: string
        profitPercent: number
        purchaseTimes: number
        scrapRate: number
      }>
      customerPartCode?: string | null
      enquiryItemId: string
      inputs: QuoteInputs
      itemId: string
      packaging?: string | null
      quantity: number
      quoteRevisionRequestId?: string | null
      shippingTerms?: string | null
    }) {
      return transaction(pool, async (client) => {
        const context = await client.query<{
          customer_id: string
          customer_part_code: string | null
          enquiry_id: string
          enquiry_number: string
          item_id: string | null
          matched_product_id: string | null
          next_stage_status: string | null
          organization_id: string
          quoted_part_uid: string | null
        }>(
          `
            SELECT enquiry.customer_id, enquiry.id AS enquiry_id,
              enquiry.enquiry_number, enquiry.organization_id,
              enquiry_item.customer_part_code, enquiry_item.item_id,
              design.matched_product_id, design.quoted_part_uid,
              design.next_stage_status
            FROM sales.enquiry_items enquiry_item
            JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
            LEFT JOIN sales.design_tasks design
              ON design.enquiry_item_id = enquiry_item.id
            WHERE enquiry_item.id = $1
            FOR UPDATE OF enquiry_item, enquiry
          `,
          [input.enquiryItemId]
        )
        const row = context.rows[0]
        if (!row) {
          throw new Error("Enquiry and product are required.")
        }
        const rootProduct = await getProduct(client, input.itemId)
        const productMatches =
          row.item_id === rootProduct.id ||
          row.matched_product_id === rootProduct.id ||
          row.quoted_part_uid === rootProduct.uid
        if (!productMatches) {
          throw new Error("Enquiry and product are required.")
        }
        if (
          !row.matched_product_id &&
          !["Product Costing Complete", "Started", "Quoted"].includes(
            row.next_stage_status ?? "Not Started"
          )
        ) {
          throw new Error(
            "Complete Product Parameter Costing before moving this item to Customer Parameter Costing."
          )
        }
        if (input.quantity < 0) {
          throw new Error("Quote quantity cannot be negative.")
        }
        const revisionRequest = input.quoteRevisionRequestId
          ? await client.query<{
              requested_price: string
            }>(
              `
                SELECT request.requested_price::text
                FROM sales.quote_revision_requests request
                JOIN sales.quote_items prior_quote
                  ON prior_quote.id = request.quote_item_id
                WHERE request.id = $1 AND request.status = 'Open'
                  AND request.organization_id = $2
                  AND request.item_id = $3
                  AND prior_quote.enquiry_item_id = $4
                FOR UPDATE OF request
              `,
              [
                input.quoteRevisionRequestId,
                row.organization_id,
                rootProduct.id,
                input.enquiryItemId,
              ]
            )
          : null
        if (input.quoteRevisionRequestId && !revisionRequest?.rows[0]) {
          throw new Error("Open PO quote revision request was not found.")
        }

        const childInputs = new Map(
          (input.childInputs ?? []).map((item) => [item.itemId, item])
        )
        const assemblyProfits = new Map(
          (input.assemblyProfitPercents ?? []).map((item) => [
            item.itemId,
            item.profitPercent,
          ])
        )
        const saved = new Map<
          string,
          { calculation: QuoteCalculation; quoteItemId: string }
        >()

        const quoteProduct = async (
          product: ProductRow,
          options: { isRoot: boolean }
        ): Promise<{ calculation: QuoteCalculation; quoteItemId: string }> => {
          const cached = saved.get(product.id)
          if (cached) {
            return cached
          }
          let calculation: QuoteCalculation
          const components: PackageComponent[] = []
          let quoteInputs: QuoteInputs

          if (isBomParent(product.item_type)) {
            const children = await getImmediateChildren(client, product.id)
            let childQuoteTotal = 0
            for (const child of children) {
              const childQuote = await quoteProduct(child, { isRoot: false })
              const quantity = asNumber(child.quantity, 1)
              childQuoteTotal += quantity * childQuote.calculation.totalRateInr
              components.push({
                childQuoteItemId: childQuote.quoteItemId,
                componentItemId: child.id,
                componentUid: child.uid,
                description: child.description,
                extendedCost: quantity * childQuote.calculation.totalRateInr,
                quantity,
                unitCost: childQuote.calculation.totalRateInr,
              })
            }
            const childrenForWeight = await Promise.all(
              children.map(async (child) => ({
                quantity: asNumber(child.quantity, 1),
                weight: isBomParent(child.item_type)
                  ? await immediatePieceWeight(client, child)
                  : asNumber(child.weight_100_pcs),
              }))
            )
            const pieceWeightGrams = childrenForWeight.reduce(
              (total, child) => total + child.quantity * child.weight,
              0
            )
            const piecesPerKg =
              pieceWeightGrams > 0 ? 1000 / pieceWeightGrams : 0
            const packingCost = options.isRoot ? input.inputs.packingCost : 0
            const shippingCost = options.isRoot ? input.inputs.shippingCost : 0
            const assemblyCostPerPiece =
              piecesPerKg > 0
                ? asNumber(product.assembly_operation_cost) / piecesPerKg
                : 0
            const parentPackingCostPerPiece =
              piecesPerKg > 0 ? packingCost / piecesPerKg : 0
            const parentShippingCostPerPiece =
              piecesPerKg > 0 ? shippingCost / piecesPerKg : 0
            const packageProcessCostPerPiece =
              assemblyCostPerPiece +
              parentPackingCostPerPiece +
              parentShippingCostPerPiece
            const profitPercent = options.isRoot
              ? input.inputs.profitPercent
              : (assemblyProfits.get(product.id) ?? 0)
            const rejectionCost =
              packageProcessCostPerPiece * asNumber(product.rejection_percent)
            const totalA = packageProcessCostPerPiece + rejectionCost
            const profitB = totalA * profitPercent
            const totalAPlusB = totalA + profitB
            const packageBeforeRejection =
              childQuoteTotal + packageProcessCostPerPiece
            const totalRateInr = childQuoteTotal + totalAPlusB
            const rateUsd =
              input.inputs.conversionRate > 0
                ? totalRateInr / input.inputs.conversionRate
                : 0
            calculation = {
              assemblyCostPerPiece,
              childQuoteTotal,
              netRateWithAlloy: 0,
              netRateWithoutAlloy: 0,
              packageBeforeRejection,
              packageProcessCostPerPiece,
              parentPackingCostPerPiece,
              parentShippingCostPerPiece,
              piecesPerKg,
              processCost: packageProcessCostPerPiece,
              profitB,
              rateInr: totalAPlusB,
              rateUsd,
              rawMaterialCost: 0,
              rejectionCost,
              scrapRatePerGm: 0,
              scrapReturn: 0,
              scrapReturnPrice: 0,
              scrapReturnPriceIncludingBurningLoss: 0,
              totalA,
              totalAPlusB,
              totalRateInr,
              totalRodsCost: childQuoteTotal,
            }
            quoteInputs = {
              conversionRate: input.inputs.conversionRate,
              overheadCost: 0,
              packingCost,
              profitPercent,
              purchaseTimes: 1,
              scrapRate: 0,
              shippingCost,
            }
          } else {
            const childInput = childInputs.get(product.id)
            quoteInputs = options.isRoot
              ? input.inputs
              : {
                  conversionRate: input.inputs.conversionRate,
                  overheadCost: 0,
                  packingCost: 0,
                  profitPercent: childInput?.profitPercent ?? 0,
                  purchaseTimes: childInput?.purchaseTimes ?? 1,
                  scrapRate: childInput?.scrapRate ?? 0,
                  shippingCost: 0,
                }
            calculation = calculateProductQuote(product, quoteInputs).result
          }

          const quoteItemId = await persistQuote(client, {
            allowRevision: Boolean(revisionRequest?.rows[0]),
            actorUserId: input.actorUserId,
            calculation,
            components,
            customerId: row.customer_id,
            customerPartCode: options.isRoot
              ? (input.customerPartCode ?? row.customer_part_code)
              : null,
            enquiryId: row.enquiry_id,
            enquiryItemId: input.enquiryItemId,
            enquiryNumber: row.enquiry_number,
            inputs: quoteInputs,
            item: product,
            organizationId: row.organization_id,
            packaging: input.packaging ?? null,
            quantity: input.quantity,
            shippingTerms: input.shippingTerms ?? null,
            status: input.action === "complete" ? "Ready" : "Draft",
          })
          const result = { calculation, quoteItemId }
          saved.set(product.id, result)
          return result
        }

        const root = await quoteProduct(rootProduct, { isRoot: true })
        const targetPrice = revisionRequest?.rows[0]
          ? asNumber(revisionRequest.rows[0].requested_price)
          : null
        if (
          input.action === "complete" &&
          targetPrice !== null &&
          Math.abs(root.calculation.rateUsd - targetPrice) >= 0.0001
        ) {
          throw new Error(
            "Completed quote price must equal the accepted PO price."
          )
        }
        await client.query(
          `
            UPDATE sales.design_tasks
            SET next_stage_status = $3, updated_by_user_id = $1,
              updated_at = now(), row_version = row_version + 1
            WHERE enquiry_item_id = $2
          `,
          [
            input.actorUserId ?? null,
            input.enquiryItemId,
            input.action === "complete" ? "Quoted" : "Started",
          ]
        )
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "quote.saved",
          metadata: {
            action: input.action ?? "in_progress",
            componentQuoteCount: saved.size - 1,
          },
          organizationId: row.organization_id,
          targetId: root.quoteItemId,
          targetTable: "quote_items",
        })
        return getQuoteWithClient(client, root.quoteItemId)
      })
    },

    async sendQuote(input: {
      actorUserId?: string | null
      followupDueOn: string
      quoteItemId: string
    }) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.followupDueOn)) {
        throw new Error("Follow-Up Date must use YYYY-MM-DD.")
      }
      return transaction(pool, async (client) => {
        const root = await client.query<{
          company_name: string
          enquiry_id: string | null
          enquiry_item_id: string | null
          organization_id: string
          status: string
        }>(
          `
            SELECT quote.organization_id, quote.enquiry_item_id, quote.status,
              coalesce(quote.enquiry_id, enquiry_item.enquiry_id) AS enquiry_id,
              customer.company_name
            FROM sales.quote_items quote
            JOIN sales.customers customer ON customer.id = quote.customer_id
            LEFT JOIN sales.enquiry_items enquiry_item
              ON enquiry_item.id = quote.enquiry_item_id
            LEFT JOIN sales.enquiries enquiry
              ON enquiry.id = coalesce(quote.enquiry_id, enquiry_item.enquiry_id)
            WHERE quote.id = $1
              AND ($2::uuid IS NULL OR enquiry.created_by_user_id = $2)
            FOR UPDATE OF quote
          `,
          [input.quoteItemId, input.actorUserId ?? null]
        )
        if (!root.rows[0]) {
          throw new Error("Quote was not found.")
        }
        if (root.rows[0].status === "Draft") {
          throw new Error(
            "Complete Customer Parameter Costing before sending this quote."
          )
        }
        if (root.rows[0].status !== "Ready" && root.rows[0].status !== "Sent") {
          throw new Error("Only a ready quote can be sent.")
        }
        const tree = await client.query<{ id: string; depth: number }>(
          `
            WITH RECURSIVE quote_tree AS (
              SELECT $1::uuid AS id, 0 AS depth
              UNION ALL
              SELECT component.child_quote_item_id, quote_tree.depth + 1
              FROM quote_tree
              JOIN sales.quote_product_snapshots snapshot
                ON snapshot.quote_item_id = quote_tree.id
              JOIN sales.quote_package_components component
                ON component.quote_product_snapshot_id = snapshot.id
              WHERE component.child_quote_item_id IS NOT NULL
            )
            SELECT DISTINCT id, max(depth)::integer AS depth
            FROM quote_tree
            GROUP BY id
            ORDER BY depth DESC
          `,
          [input.quoteItemId]
        )
        for (const member of tree.rows) {
          const quote = await client.query<{
            customer_id: string
            price_lineage_key: string | null
            revision: number
            sent_at: Date | null
          }>(
            `
              SELECT customer_id, price_lineage_key, revision, sent_at
              FROM sales.quote_items
              WHERE id = $1
              FOR UPDATE
            `,
            [member.id]
          )
          const quoteRow = quote.rows[0]!
          if (quoteRow.sent_at) {
            continue
          }
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            [
              [
                "pricing-active",
                root.rows[0].organization_id,
                quoteRow.customer_id,
                quoteRow.price_lineage_key ?? "legacy-null",
              ].join(":"),
            ]
          )
          const revision = await client.query<{ revision: number }>(
            `
              SELECT COALESCE(max(revision), 0)::integer + 1 AS revision
              FROM sales.quote_items
              WHERE organization_id = $1
                AND customer_id = $2
                AND price_lineage_key = $3
                AND id <> $4
            `,
            [
              root.rows[0].organization_id,
              quoteRow.customer_id,
              quoteRow.price_lineage_key,
              member.id,
            ]
          )
          await client.query(
            `
              UPDATE sales.quote_items
              SET status = 'Superseded', is_active = false,
                superseded_by_quote_item_id = $1, updated_at = now(),
                row_version = row_version + 1
              WHERE organization_id = $2
                AND customer_id = $3
                AND price_lineage_key = $4
                AND is_active
                AND id <> $1
            `,
            [
              member.id,
              root.rows[0].organization_id,
              quoteRow.customer_id,
              quoteRow.price_lineage_key,
            ]
          )
          await client.query(
            `
              UPDATE sales.quote_items
              SET status = 'Sent', is_active = true, sent_at = now(),
                revision = $1, superseded_by_quote_item_id = NULL,
                updated_by_user_id = $2, updated_at = now(),
                row_version = row_version + 1
              WHERE id = $3
            `,
            [revision.rows[0]!.revision, input.actorUserId ?? null, member.id]
          )
        }
        if (root.rows[0].enquiry_item_id) {
          await client.query(
            `
              UPDATE sales.design_tasks
              SET next_stage_status = 'Quoted', updated_by_user_id = $1,
                updated_at = now(), row_version = row_version + 1
              WHERE enquiry_item_id = $2
            `,
            [input.actorUserId ?? null, root.rows[0].enquiry_item_id]
          )
        }
        if (root.rows[0].enquiry_id) {
          const note = `Quote sent to ${root.rows[0].company_name}.`
          await client.query(
            `
              INSERT INTO sales.followups (
                organization_id, enquiry_id, quote_item_id, due_on, channel,
                status, note, created_by_user_id, updated_by_user_id,
                source_system, source_table, source_id, source_payload
              )
              SELECT
                $1, $2, $6, $7::date, 'Email', 'Pending', $3,
                $4, $4, 'mrm-dashboard', 'followups', $5,
                jsonb_build_object('quoteItemId', $6::text)
              WHERE NOT EXISTS (
                SELECT 1
                FROM sales.followups followup
                WHERE followup.quote_item_id = $6
                  AND followup.status = 'Pending'
              )
            `,
            [
              root.rows[0].organization_id,
              root.rows[0].enquiry_id,
              note,
              input.actorUserId ?? null,
              randomUUID(),
              input.quoteItemId,
              input.followupDueOn,
            ]
          )
        }
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "quote.sent",
          metadata: { quoteTreeSize: tree.rows.length },
          organizationId: root.rows[0].organization_id,
          targetId: input.quoteItemId,
          targetTable: "quote_items",
        })
        return getQuoteWithClient(client, input.quoteItemId)
      })
    },

    async getQuote(quoteItemId: string, scope?: SalesWorkScope) {
      return transaction(pool, async (client) => {
        await client.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
        )
        const visible = await client.query(
          `
            SELECT quote.id
            FROM sales.quote_items quote
            LEFT JOIN sales.enquiry_items enquiry_item
              ON enquiry_item.id = quote.enquiry_item_id
            LEFT JOIN sales.enquiries enquiry
              ON enquiry.id = coalesce(quote.enquiry_id, enquiry_item.enquiry_id)
            WHERE quote.id = $1
              AND ($2::uuid IS NULL OR enquiry.created_by_user_id = $2)
          `,
          [quoteItemId, scope?.originatingSalespersonUserId ?? null]
        )
        if (!visible.rows[0]) throw new Error("Quote was not found.")
        return getQuoteWithClient(client, quoteItemId)
      })
    },

    async listCostingTasks(
      organizationCode: string,
      options: { enquiryItemId?: string; limit?: number } = {}
    ) {
      const limit = Math.min(Math.max(Math.floor(options.limit ?? 200), 1), 200)
      const result = await pool.query<{
        alloy_premium: string
        annealing: string
        assembly_operation_cost: string
        buffing: string
        burning_loss_percent: string
        casting: string
        checking: string
        company_name: string
        conversion_rate: string
        currency: string
        customer_part_code: string | null
        deburring: string
        direct_purchase_price_per_kg: string
        direct_purchase_price_per_piece: string
        enquiry_id: string
        enquiry_item_id: string
        enquiry_number: string
        extrusion_cost: string
        forging_cost: string
        incoterms: string | null
        item_id: string
        item_type: string
        machining_cost: string
        marking: string
        next_stage_status: string
        overhead_cost: string
        packaging_terms: string | null
        pieces_per_kg: string
        plating: string
        pricing_method: string
        product_cost_inr: string
        quantity: string
        quote_approved_price_usd: string | null
        quote_conversion_rate: string | null
        quote_id: string | null
        quote_overhead_cost: string | null
        quote_packing_cost: string | null
        quote_packaging: string | null
        quote_profit_percent: string | null
        quote_purchase_times: string | null
        quote_rate_inr: string | null
        quote_rate_usd: string | null
        quote_scrap_rate: string | null
        quote_shipping_cost: string | null
        quote_shipping_terms: string | null
        quote_status: string | null
        rejection_percent: string
        sealant: string
        uid: string
        washing: string
        weight_100_pcs: string
      }>(
        `
          SELECT design.enquiry_item_id, design.next_stage_status,
            enquiry.id AS enquiry_id,
            enquiry.enquiry_number, customer.company_name,
            enquiry_item.customer_part_code, enquiry_item.quantity,
            enquiry.conversion_rate, enquiry.currency,
            enquiry.packaging_terms, enquiry.incoterms,
            item.id AS item_id, item.uid,
            item.item_type, item.weight_100_pcs, item.casting,
            item.alloy_premium,
            item.extrusion_cost, item.forging_cost, item.pricing_method,
            item.pieces_per_kg, item.direct_purchase_price_per_kg,
            item.direct_purchase_price_per_piece, item.product_cost_inr,
            item.machining_cost, item.washing, item.checking, item.marking,
            item.plating, item.annealing, item.buffing, item.deburring,
            item.sealant, item.burning_loss_percent, item.overhead_cost,
            item.rejection_percent, item.assembly_operation_cost,
            latest_quote.id AS quote_id,
            latest_quote.status AS quote_status,
            latest_quote.scrap_rate::text AS quote_scrap_rate,
            latest_quote.purchase_times::text AS quote_purchase_times,
            latest_quote.profit_percent::text AS quote_profit_percent,
            latest_quote.overhead_cost_input::text AS quote_overhead_cost,
            latest_quote.packing_cost::text AS quote_packing_cost,
            latest_quote.shipping_cost::text AS quote_shipping_cost,
            latest_quote.conversion_rate::text AS quote_conversion_rate,
            latest_quote.packaging AS quote_packaging,
            latest_quote.shipping_terms AS quote_shipping_terms,
            latest_quote.rate_inr::text AS quote_rate_inr,
            latest_quote.rate_usd::text AS quote_rate_usd,
            latest_quote.approved_price_usd::text AS quote_approved_price_usd
          FROM sales.design_tasks design
          JOIN sales.enquiry_items enquiry_item
            ON enquiry_item.id = design.enquiry_item_id
          JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          JOIN core.organizations organization
            ON organization.id = enquiry.organization_id
          JOIN LATERAL (
            SELECT candidate.*
            FROM catalog.items candidate
            WHERE candidate.organization_id = enquiry.organization_id
              AND (
                candidate.id = COALESCE(
                  design.matched_product_id,
                  enquiry_item.item_id
                )
                OR (
                  design.matched_product_id IS NULL
                  AND enquiry_item.item_id IS NULL
                  AND lower(candidate.uid) = lower(design.quoted_part_uid)
                )
              )
            ORDER BY CASE
              WHEN candidate.id = COALESCE(
                design.matched_product_id,
                enquiry_item.item_id
              ) THEN 0
              ELSE 1
            END
            LIMIT 1
          ) item ON true
          LEFT JOIN LATERAL (
            SELECT quote.*
            FROM sales.quote_items quote
            WHERE quote.item_id = item.id
              AND quote.status <> 'Superseded'
              AND (
                quote.enquiry_item_id = design.enquiry_item_id
                OR (
                  quote.customer_id = enquiry.customer_id
                  AND quote.is_active
                )
              )
            ORDER BY
              CASE WHEN quote.enquiry_item_id = design.enquiry_item_id
                THEN 0 ELSE 1 END,
              quote.created_at DESC, quote.id DESC
            LIMIT 1
          ) latest_quote ON true
          WHERE lower(organization.code) = lower($1)
            AND (
              design.next_stage_status IN (
                'Product Costing', 'Product Costing Complete', 'Started'
              )
              OR (
                $2::uuid IS NOT NULL
                AND design.next_stage_status = 'Quoted'
                AND EXISTS (
                  SELECT 1
                  FROM sales.quote_revision_requests request
                  JOIN sales.quote_items prior_quote
                    ON prior_quote.id = request.quote_item_id
                  WHERE request.status = 'Open'
                    AND prior_quote.enquiry_item_id = design.enquiry_item_id
                )
              )
            )
            AND ($2::uuid IS NULL OR design.enquiry_item_id = $2)
          ORDER BY enquiry.created_at DESC, enquiry_item.line_number
          LIMIT $3
        `,
        [organizationCode.trim(), options.enquiryItemId ?? null, limit]
      )
      const bom = await pool.query<{
        depth: number
        description: string
        item_id: string
        item_type: string
        lifecycle_status: string
        line_quantity: string
        parent_item_id: string
        pricing_method: string
        product_cost_inr: string
        quantity: string
        root_item_id: string
        uid: string
        weight_100_pcs: string
      }>(
        `
          WITH RECURSIVE roots AS (
            SELECT item.id AS root_item_id
            FROM sales.design_tasks design
            JOIN sales.enquiry_items enquiry_item
              ON enquiry_item.id = design.enquiry_item_id
            JOIN sales.enquiries enquiry ON enquiry.id = enquiry_item.enquiry_id
            JOIN core.organizations organization
              ON organization.id = enquiry.organization_id
            JOIN LATERAL (
              SELECT candidate.id
              FROM catalog.items candidate
              WHERE candidate.organization_id = enquiry.organization_id
                AND (
                  candidate.id = COALESCE(
                    design.matched_product_id,
                    enquiry_item.item_id
                  )
                  OR (
                    design.matched_product_id IS NULL
                    AND enquiry_item.item_id IS NULL
                    AND lower(candidate.uid) = lower(design.quoted_part_uid)
                  )
                )
              ORDER BY CASE
                WHEN candidate.id = COALESCE(
                  design.matched_product_id,
                  enquiry_item.item_id
                ) THEN 0
                ELSE 1
              END
              LIMIT 1
            ) item ON true
            WHERE lower(organization.code) = lower($1)
              AND (
                design.next_stage_status IN (
                  'Product Costing', 'Product Costing Complete', 'Started'
                )
                OR (
                  $2::uuid IS NOT NULL
                  AND design.next_stage_status = 'Quoted'
                  AND EXISTS (
                    SELECT 1
                    FROM sales.quote_revision_requests request
                    JOIN sales.quote_items prior_quote
                      ON prior_quote.id = request.quote_item_id
                    WHERE request.status = 'Open'
                      AND prior_quote.enquiry_item_id = design.enquiry_item_id
                  )
                )
              )
              AND ($2::uuid IS NULL OR design.enquiry_item_id = $2)
            ORDER BY design.updated_at DESC, design.enquiry_item_id
            LIMIT $3
          ), tree AS (
            SELECT roots.root_item_id, line.parent_item_id,
              line.component_item_id AS item_id, line.quantity::numeric,
              line.quantity::numeric AS line_quantity, 1 AS depth
            FROM roots
            JOIN catalog.bom_lines line ON line.parent_item_id = roots.root_item_id
            UNION ALL
            SELECT tree.root_item_id, line.parent_item_id,
              line.component_item_id,
              (tree.quantity * line.quantity)::numeric,
              line.quantity::numeric, tree.depth + 1
            FROM tree
            JOIN catalog.bom_lines line ON line.parent_item_id = tree.item_id
          )
          SELECT tree.root_item_id, tree.parent_item_id, tree.item_id,
            tree.quantity, tree.line_quantity, tree.depth,
            item.uid, item.description, item.item_type, item.lifecycle_status,
            item.pricing_method, item.product_cost_inr, item.weight_100_pcs
          FROM tree
          JOIN catalog.items item ON item.id = tree.item_id
          ORDER BY tree.root_item_id, tree.depth, item.uid
        `,
        [organizationCode.trim(), options.enquiryItemId ?? null, limit]
      )
      const savedComponentInputs = result.rows.length
        ? await pool.query<{
            enquiry_item_id: string
            item_id: string
            profit_percent: string
            purchase_times: string
            scrap_rate: string
          }>(
            `
              SELECT DISTINCT ON (quote.enquiry_item_id, quote.item_id)
                quote.enquiry_item_id, quote.item_id, quote.scrap_rate::text,
                quote.purchase_times::text, quote.profit_percent::text
              FROM sales.quote_items quote
              WHERE quote.enquiry_item_id = ANY($1::uuid[])
                AND quote.status <> 'Superseded'
              ORDER BY quote.enquiry_item_id, quote.item_id,
                quote.updated_at DESC, quote.id DESC
            `,
            [result.rows.map((row) => row.enquiry_item_id)]
          )
        : { rows: [] }
      const savedInputsByTask = new Map<
        string,
        Array<{
          itemId: string
          profitPercent: number
          purchaseTimes: number
          scrapRate: number
        }>
      >()
      for (const row of savedComponentInputs.rows) {
        const inputs = savedInputsByTask.get(row.enquiry_item_id) ?? []
        inputs.push({
          itemId: row.item_id,
          profitPercent: asNumber(row.profit_percent),
          purchaseTimes: asNumber(row.purchase_times, 1),
          scrapRate: asNumber(row.scrap_rate),
        })
        savedInputsByTask.set(row.enquiry_item_id, inputs)
      }
      const bomByRoot = new Map<
        string,
        Array<{
          depth: number
          description: string
          itemId: string
          itemType: string
          lifecycleStatus: string
          lineQuantity: number
          parentItemId: string
          pricingMethod: string
          productCostInr: number
          quantity: number
          uid: string
          weight100Pcs: number
        }>
      >()
      for (const row of bom.rows) {
        const items = bomByRoot.get(row.root_item_id) ?? []
        items.push({
          depth: row.depth,
          description: row.description,
          itemId: row.item_id,
          itemType: row.item_type,
          lifecycleStatus: row.lifecycle_status,
          lineQuantity: asNumber(row.line_quantity, 1),
          parentItemId: row.parent_item_id,
          pricingMethod: row.pricing_method,
          productCostInr: asNumber(row.product_cost_inr),
          quantity: asNumber(row.quantity),
          uid: row.uid,
          weight100Pcs: asNumber(row.weight_100_pcs),
        })
        bomByRoot.set(row.root_item_id, items)
      }
      return result.rows.map((row) => ({
        bomItems: bomByRoot.get(row.item_id) ?? [],
        companyName: row.company_name,
        conversionRate: asNumber(row.conversion_rate, 1),
        currency: row.currency,
        customerPartCode: row.customer_part_code,
        enquiryId: row.enquiry_id,
        enquiryItemId: row.enquiry_item_id,
        enquiryNumber: row.enquiry_number,
        itemId: row.item_id,
        itemType: row.item_type,
        nextStageStatus: row.next_stage_status,
        product: {
          alloyPremium: asNumber(row.alloy_premium),
          annealing: asNumber(row.annealing),
          assemblyOperationCost: asNumber(row.assembly_operation_cost),
          buffing: asNumber(row.buffing),
          burningLossPercent: asNumber(row.burning_loss_percent),
          casting: asNumber(row.casting),
          checking: asNumber(row.checking),
          deburring: asNumber(row.deburring),
          directPurchasePricePerKg: asNumber(row.direct_purchase_price_per_kg),
          directPurchasePricePerPiece: asNumber(
            row.direct_purchase_price_per_piece
          ),
          extrusionCost: asNumber(row.extrusion_cost),
          forgingCost: asNumber(row.forging_cost),
          machiningCost: asNumber(row.machining_cost),
          marking: asNumber(row.marking),
          overheadCost: asNumber(row.overhead_cost),
          piecesPerKg: asNumber(row.pieces_per_kg),
          plating: asNumber(row.plating),
          pricingMethod: row.pricing_method,
          productCostInr: asNumber(row.product_cost_inr),
          rejectionPercent: asNumber(row.rejection_percent),
          sealant: asNumber(row.sealant),
          washing: asNumber(row.washing),
          weight100Pcs: asNumber(row.weight_100_pcs),
        },
        quantity: asNumber(row.quantity),
        componentQuoteDefaults:
          savedInputsByTask.get(row.enquiry_item_id) ?? [],
        quoteDefaults: {
          approvedPriceUsd: asNumber(row.quote_approved_price_usd),
          conversionRate: asNumber(
            row.quote_conversion_rate,
            asNumber(row.conversion_rate, 1)
          ),
          id: row.quote_id,
          overheadCost: asNumber(
            row.quote_overhead_cost,
            asNumber(row.overhead_cost)
          ),
          packingCost: asNumber(row.quote_packing_cost),
          packaging: row.quote_packaging ?? row.packaging_terms,
          profitPercent: asNumber(row.quote_profit_percent),
          purchaseTimes: asNumber(row.quote_purchase_times, 1),
          rateInr: asNumber(row.quote_rate_inr),
          rateUsd: asNumber(row.quote_rate_usd),
          scrapRate: asNumber(row.quote_scrap_rate),
          shippingCost: asNumber(row.quote_shipping_cost),
          shippingTerms: row.quote_shipping_terms ?? row.incoterms,
          status: row.quote_status,
        },
        uid: row.uid,
      }))
    },

    async sendQuoteBackToProductCosting(input: {
      actorUserId?: string | null
      enquiryId: string
      itemId: string
    }) {
      return transaction(pool, async (client) => {
        const quote = await client.query<{
          id: string
          organization_id: string
          sent_at: Date | null
          status: string
        }>(
          `
            SELECT id, organization_id, status, sent_at
            FROM sales.quote_items
            WHERE enquiry_id = $1
              AND item_id = $2
              AND status <> 'Superseded'
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            FOR UPDATE
          `,
          [input.enquiryId, input.itemId]
        )
        const latest = quote.rows[0]
        if (latest?.sent_at || (latest && latest.status !== "Draft")) {
          throw new Error(
            "Sent or quoted prices are locked. Start the proper revision flow before changing product parameter costing."
          )
        }
        const product = await client.query<{
          organization_id: string
          uid: string
        }>(
          `
            SELECT organization_id, uid
            FROM catalog.items
            WHERE id = $1
          `,
          [input.itemId]
        )
        const item = product.rows[0]
        if (!item) {
          throw new Error("Product was not found.")
        }
        const design = await client.query<{ id: string }>(
          `
            UPDATE sales.design_tasks
            SET next_stage_status = 'Product Costing',
              updated_at = now(), row_version = row_version + 1
            WHERE enquiry_item_id IN (
              SELECT id FROM sales.enquiry_items WHERE enquiry_id = $1
            )
              AND (
                matched_product_id = $2
                OR lower(quoted_part_uid) = lower($3)
              )
            RETURNING id
          `,
          [input.enquiryId, input.itemId, item.uid]
        )
        if (!design.rows[0]) {
          throw new Error("Design costing handoff was not found.")
        }
        await writeAuditEvent(client, {
          actorUserId: input.actorUserId,
          eventType: "quote.returned_to_product_costing",
          metadata: {
            enquiryId: input.enquiryId,
            itemId: input.itemId,
            quoteItemId: latest?.id ?? null,
          },
          organizationId: item.organization_id,
          targetId: design.rows[0].id,
          targetTable: "design_tasks",
        })
        return { nextStageStatus: "Product Costing" }
      })
    },

    async getQuoteDocument(enquiryId: string, scope?: SalesWorkScope) {
      const header = await pool.query<{
        company_name: string
        conversion_rate: string
        currency: string
        customer_uid: string
        enquiry_number: string
        incoterms: string | null
        packaging_terms: string | null
        payment_terms: string | null
        shipment_mode: string | null
      }>(
        `
          SELECT enquiry.enquiry_number, enquiry.currency,
            enquiry.conversion_rate::text, enquiry.incoterms,
            enquiry.payment_terms, enquiry.shipment_mode,
            enquiry.packaging_terms, customer.customer_uid,
            customer.company_name
          FROM sales.enquiries enquiry
          JOIN sales.customers customer ON customer.id = enquiry.customer_id
          WHERE enquiry.id = $1
            AND ($2::uuid IS NULL OR enquiry.created_by_user_id = $2)
        `,
        [enquiryId, scope?.originatingSalespersonUserId ?? null]
      )
      if (!header.rows[0]) {
        throw new Error("Enquiry was not found.")
      }
      const lines = await pool.query<{
        customer_part_code: string | null
        description: string
        line_number: number
        price: string | null
        quantity: string
        quote_number: string | null
        revision: number | null
        sent_at: Date | null
        status: string | null
      }>(
        `
          SELECT enquiry_item.line_number,
            COALESCE(selected.customer_part_code,
              enquiry_item.customer_part_code) AS customer_part_code,
            enquiry_item.description, enquiry_item.quantity::text,
            selected.quote_number, selected.revision, selected.status,
            selected.sent_at, selected.unit_price::text AS price
          FROM sales.enquiry_items enquiry_item
          LEFT JOIN LATERAL (
            SELECT quote.customer_part_code, quote.quote_number,
              quote.revision, quote.status, quote.sent_at, quote.unit_price,
              quote.created_at, quote.updated_at
            FROM sales.quote_items quote
            WHERE quote.enquiry_item_id = enquiry_item.id
            ORDER BY CASE
                WHEN quote.sent_at IS NOT NULL
                  AND quote.created_at <= quote.sent_at THEN 0
                WHEN quote.sent_at IS NULL
                  AND quote.status IN ('Draft', 'Ready') THEN 1
                WHEN quote.sent_at IS NOT NULL THEN 2
                WHEN quote.status = 'Accepted' THEN 3
                WHEN quote.is_active THEN 4
                ELSE 5
              END,
              CASE
                WHEN quote.sent_at IS NOT NULL
                  AND quote.created_at <= quote.sent_at THEN quote.sent_at
                ELSE quote.updated_at
              END DESC,
              quote.created_at DESC, quote.id DESC
            LIMIT 1
          ) selected ON true
          WHERE enquiry_item.enquiry_id = $1
          ORDER BY enquiry_item.line_number
        `,
        [enquiryId]
      )
      const organization = await pool.query<{ organization_id: string }>(
        "SELECT organization_id FROM sales.enquiries WHERE id = $1",
        [enquiryId]
      )
      const terms = await pool.query<{
        label: string
        sort_order: number
        value: string
      }>(
        `
          SELECT label, value, sort_order
          FROM sales.quote_term_templates
          WHERE organization_id = $1 AND active
          ORDER BY sort_order, label
        `,
        [organization.rows[0]!.organization_id]
      )
      const row = header.rows[0]
      return {
        companyName: row.company_name,
        conversionRate: asNumber(row.conversion_rate, 1),
        currency: row.currency,
        customerUid: row.customer_uid,
        enquiryNumber: row.enquiry_number,
        incoterms: row.incoterms,
        lines: lines.rows.map((line) => ({
          customerPartCode: line.customer_part_code,
          description: line.description,
          lineNumber: line.line_number,
          price: line.price === null ? null : asNumber(line.price),
          quantity: asNumber(line.quantity),
          quoteNumber: line.quote_number,
          revision: line.revision,
          sentAt: line.sent_at,
          status: line.status,
        })),
        packagingTerms: row.packaging_terms,
        paymentTerms: row.payment_terms,
        revision: Math.max(0, ...lines.rows.map((line) => line.revision ?? 0)),
        shipmentMode: row.shipment_mode,
        terms: terms.rows.map((term) => ({
          label: term.label,
          sortOrder: term.sort_order,
          value: term.value,
        })),
      }
    },

    async listPricingRegister(
      organizationCode: string,
      options: { revisions?: boolean } = {}
    ) {
      const result = await pool.query<PricingRegisterDatabaseRow>(
        `
          WITH RECURSIVE roots AS (
            SELECT quote.*
            FROM sales.quote_items quote
            JOIN core.organizations organization
              ON organization.id = quote.organization_id
            WHERE lower(organization.code) = lower($1)
              AND (
                $2::boolean
                OR quote.status IN ('Draft', 'Ready')
                OR quote.is_active
              )
              AND NOT EXISTS (
                SELECT 1
                FROM sales.quote_package_components component
                WHERE component.child_quote_item_id = quote.id
              )
          ),
          quote_tree AS (
            SELECT root.id AS root_quote_item_id,
              root.id AS quote_item_id, root.item_id,
              NULL::uuid AS parent_item_id, 0 AS component_depth,
              1::numeric AS component_quantity, ARRAY[root.id] AS path
            FROM roots root
            UNION ALL
            SELECT tree.root_quote_item_id, component.child_quote_item_id,
              component.component_item_id, tree.item_id,
              tree.component_depth + 1, component.quantity,
              tree.path || COALESCE(component.child_quote_item_id,
                component.component_item_id)
            FROM quote_tree tree
            JOIN sales.quote_product_snapshots parent_snapshot
              ON parent_snapshot.quote_item_id = tree.quote_item_id
            JOIN sales.quote_package_components component
              ON component.quote_product_snapshot_id = parent_snapshot.id
            WHERE tree.component_depth < 10
              AND NOT COALESCE(component.child_quote_item_id,
                component.component_item_id) = ANY(tree.path)
          )
          SELECT COALESCE(member.id, tree.item_id) AS id,
            tree.root_quote_item_id::text || ':' ||
              array_to_string(tree.path, '/') AS row_key,
            root.quote_number, root.revision, root.status, root.is_active,
            root.sent_at, CASE WHEN tree.component_depth = 0
              THEN root.customer_part_code ELSE NULL END
              AS customer_part_code,
            COALESCE(member.unit_price, 0)::text AS unit_price,
            customer.id AS customer_id, customer.customer_uid,
            customer.company_name, item.uid,
            CASE WHEN item.lifecycle_status = 'P'
              THEN website.product_description ELSE NULL END
              AS website_product_description,
            CASE WHEN item.lifecycle_status = 'P'
              THEN website.size ELSE NULL END AS website_size,
            COALESCE(snapshot.item_type, item.item_type) AS item_type,
            item.lifecycle_status, enquiry.enquiry_number,
            enquiry.currency, enquiry_item.line_number,
            enquiry_item.description AS enquiry_description,
            parent.uid AS parent_uid, tree.component_depth,
            tree.component_quantity::text,
            COALESCE(member.updated_at, item.updated_at) AS change_date,
            COALESCE(snapshot.product_snapshot, '{}'::jsonb)
              AS product_snapshot,
            COALESCE(snapshot.calculation_json, '{}'::jsonb)
              AS calculation_json,
            jsonb_build_object(
              'scrapRate', COALESCE(member.scrap_rate, root.scrap_rate),
              'packingCost', COALESCE(member.packing_cost, root.packing_cost),
              'shippingCost', COALESCE(member.shipping_cost, root.shipping_cost),
              'overheadCost', COALESCE(member.overhead_cost_input,
                root.overhead_cost_input),
              'purchaseTimes', COALESCE(member.purchase_times,
                root.purchase_times),
              'profitPercent', COALESCE(member.profit_percent,
                root.profit_percent),
              'conversionRate', COALESCE(member.conversion_rate,
                root.conversion_rate),
              'assembledPartInr', COALESCE(member.assembled_part_inr, 0)
            ) AS quote_inputs,
            jsonb_build_object(
              'grade', grade.name,
              'rodType', rod_type.name,
              'machineType', machine_type.name,
              'rodSize', item.rod_size,
              'dieCode', item.die_code,
              'remarks', item.remarks
            ) AS product_context,
            COALESCE(member.packaging, root.packaging) AS packaging,
            COALESCE(member.shipping_terms, root.shipping_terms)
              AS shipping_terms
          FROM quote_tree tree
          JOIN roots root ON root.id = tree.root_quote_item_id
          LEFT JOIN sales.quote_items member ON member.id = tree.quote_item_id
          JOIN sales.customers customer ON customer.id = root.customer_id
          JOIN catalog.items item ON item.id = tree.item_id
          LEFT JOIN catalog.website_product_profiles website
            ON website.item_id = item.id
          LEFT JOIN catalog.items parent ON parent.id = tree.parent_item_id
          LEFT JOIN catalog.material_grades grade
            ON grade.id = item.material_grade_id
          LEFT JOIN catalog.rod_types rod_type ON rod_type.id = item.rod_type_id
          LEFT JOIN catalog.machine_types machine_type
            ON machine_type.id = item.machine_type_id
          LEFT JOIN sales.enquiries enquiry ON enquiry.id = root.enquiry_id
          LEFT JOIN sales.enquiry_items enquiry_item
            ON enquiry_item.id = root.enquiry_item_id
          LEFT JOIN sales.quote_product_snapshots snapshot
            ON snapshot.quote_item_id = tree.quote_item_id
          JOIN core.organizations organization
            ON organization.id = root.organization_id
          ORDER BY customer.company_name, root.customer_part_code,
            root.revision DESC, tree.path
        `,
        [organizationCode.trim(), options.revisions ?? false]
      )
      return result.rows.map(pricingRegisterRow)
    },

    async listPricingRegisterBounded(
      organizationCode: string,
      options: { limit?: number; query?: string } = {}
    ) {
      const limit = Math.min(Math.max(Math.floor(options.limit ?? 200), 1), 200)
      const quoteBatch = await pricingRegisterBatch(pool, organizationCode, {
        limit: limit + 1,
        query: options.query,
      })
      const quoteRootIds: string[] = []
      const seenQuoteRootIds = new Set<string>()
      for (const row of quoteBatch) {
        if (!seenQuoteRootIds.has(row.root_quote_item_id)) {
          seenQuoteRootIds.add(row.root_quote_item_id)
          quoteRootIds.push(row.root_quote_item_id)
        }
      }
      const visibleQuoteRootIds = new Set(quoteRootIds.slice(0, limit))
      const rows = quoteBatch
        .filter((row) => visibleQuoteRootIds.has(row.root_quote_item_id))
        .map(pricingRegisterRow)
      const remaining = limit - visibleQuoteRootIds.size
      const productBatch = remaining
        ? await productPricingRegisterBatch(pool, organizationCode, {
            limit: remaining + 1,
            query: options.query,
          })
        : []
      const visibleProducts = productBatch.slice(0, remaining)
      rows.push(...visibleProducts.map(pricingRegisterRow))

      return {
        coverage: {
          limit,
          returned: visibleQuoteRootIds.size + visibleProducts.length,
          truncated:
            quoteRootIds.length > limit || productBatch.length > remaining,
        },
        rows,
      }
    },
    async listPricingRevisionHistory(
      organizationCode: string,
      input: { customerId: string; customerPartCode: string }
    ) {
      const customerPartCode = input.customerPartCode.trim()
      if (!customerPartCode || !uuidPattern.test(input.customerId)) return []
      const rows = await pricingRegisterBatch(pool, organizationCode, {
        customerId: input.customerId,
        customerPartCode,
        revisions: true,
      })
      return rows.map(pricingRegisterRow)
    },

    async listPricingRegisterForExport(
      organizationCode: string,
      options: {
        customerId?: string
        customerPartCode?: string
        query?: string
        revisions?: boolean
      } = {},
      requestedBatchSize = 500
    ) {
      if (
        options.customerId !== undefined &&
        !uuidPattern.test(options.customerId)
      ) {
        return []
      }
      const limit = exportBatchSize(requestedBatchSize)
      return transaction(pool, async (client) => {
        await client.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
        )
        const rows: ReturnType<typeof pricingRegisterRow>[] = []
        let cursor:
          | {
              companyName: string
              customerPartCode: string
              id: string
              revision: number
            }
          | undefined

        while (true) {
          const batch = await pricingRegisterBatch(client, organizationCode, {
            cursor,
            customerId: options.customerId,
            customerPartCode: options.customerPartCode,
            limit,
            query: options.query,
            revisions: options.revisions,
          })
          rows.push(...batch.map(pricingRegisterRow))
          const rootCount = new Set(batch.map((row) => row.root_quote_item_id))
            .size
          if (rootCount < limit) break
          const last = batch.at(-1)!
          cursor = {
            companyName: last.root_company_name,
            customerPartCode: last.root_customer_part_code,
            id: last.root_quote_item_id,
            revision: last.revision,
          }
        }

        if (
          !options.revisions &&
          options.customerId === undefined &&
          options.customerPartCode === undefined
        ) {
          let productCursor: { id: string; uid: string } | undefined
          while (true) {
            const batch = await productPricingRegisterBatch(
              client,
              organizationCode,
              {
                cursor: productCursor,
                limit,
                query: options.query,
              }
            )
            rows.push(...batch.map(pricingRegisterRow))
            if (batch.length < limit) break
            const last = batch.at(-1)!
            productCursor = { id: last.id, uid: last.uid }
          }
        }

        return rows
      })
    },

    async listQuotes(
      organizationCode: string,
      requestedLimit = 200,
      scope?: SalesWorkScope
    ) {
      const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 500)
      const result = await pool.query<{
        company_name: string
        enquiry_id: string | null
        enquiry_item_id: string | null
        id: string
        is_active: boolean
        quote_number: string
        rate_usd: string
        revision: number
        status: string
        uid: string
      }>(
        `
          SELECT quote.id, quote.enquiry_id, quote.enquiry_item_id,
            quote.quote_number,
            quote.revision, quote.status,
            quote.is_active, quote.rate_usd, customer.company_name, item.uid
          FROM sales.quote_items quote
          JOIN core.organizations organization
            ON organization.id = quote.organization_id
          JOIN sales.customers customer ON customer.id = quote.customer_id
          JOIN catalog.items item ON item.id = quote.item_id
          LEFT JOIN sales.enquiry_items enquiry_item
            ON enquiry_item.id = quote.enquiry_item_id
          LEFT JOIN sales.enquiries enquiry
            ON enquiry.id = coalesce(quote.enquiry_id, enquiry_item.enquiry_id)
          WHERE lower(organization.code) = lower($1)
            AND ($3::uuid IS NULL OR enquiry.created_by_user_id = $3)
            AND NOT EXISTS (
              SELECT 1
              FROM sales.quote_package_components component
              WHERE component.child_quote_item_id = quote.id
            )
          ORDER BY quote.created_at DESC
          LIMIT $2
        `,
        [
          organizationCode.trim(),
          limit,
          scope?.originatingSalespersonUserId ?? null,
        ]
      )
      return result.rows.map((row) => ({
        companyName: row.company_name,
        enquiryId: row.enquiry_id,
        enquiryItemId: row.enquiry_item_id,
        id: row.id,
        isActive: row.is_active,
        quoteNumber: row.quote_number,
        rateUsd: asNumber(row.rate_usd),
        revision: row.revision,
        status: row.status,
        uid: row.uid,
      }))
    },
  }
}
