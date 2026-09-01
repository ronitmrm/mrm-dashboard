import { Pool } from "pg"

import { createCommercialRevisionsRepository } from "../src/commercial-revisions"
import {
  calculatePackageRevisionCostingFromBase,
  calculateStoredProductRevisionCosting,
} from "../src/pricing-calculation"

const connectionString =
  process.env.WEB_DATABASE_URL ?? process.env.DATABASE_URL
// eslint-disable-next-line turbo/no-undeclared-env-vars -- explicit apply guard
const apply = process.env.MRM_APPLY_ROOT_COST_REPAIR === "true"
// eslint-disable-next-line turbo/no-undeclared-env-vars -- optional broader audit
const auditAllActive = process.env.MRM_AUDIT_ALL_ACTIVE_PRICES === "true"

if (apply && auditAllActive) {
  throw new Error("The repair can run only against Bulk Revision lineage.")
}

if (!connectionString) {
  throw new Error("WEB_DATABASE_URL or DATABASE_URL is required.")
}

// eslint-disable-next-line turbo/no-undeclared-env-vars -- production-data guard
if (process.env.MRM_NEON_BRANCH !== "staging") {
  throw new Error("This audit is restricted to the managed staging branch.")
}

type CandidateRow = {
  calculation_json: Record<string, unknown>
  child_count: string
  child_quote_total: string
  conversion_rate: string
  customer_id: string
  customer_part_code: string | null
  direct_purchase_price_per_piece: string
  id: string
  item_type: string
  item_uid: string
  organization_id: string
  packing_cost: string
  pieces_per_kg: string
  pricing_method: string
  product_snapshot: Record<string, unknown>
  profit_percent: string
  rejection_percent: string
  shipping_cost: string
  source_payload: Record<string, unknown>
  total_rate_inr: string
}

type Mismatch = {
  actual: number
  customerId: string
  customerPartCode: string | null
  delta: number
  expected: number
  itemType: string
  itemUid: string
  keepSameSource: boolean
  organizationId: string
  profitPercent: number
  quoteItemId: string
}

const number = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
const priceTolerance = 0.00001

const snapshotNumber = (
  snapshot: Record<string, unknown>,
  key: string,
  fallback = 0
) => number(snapshot[key], fallback)

const snapshotText = (
  snapshot: Record<string, unknown>,
  key: string,
  fallback = ""
) => {
  const value = snapshot[key]
  return typeof value === "string" ? value : fallback
}

const hasTargetOverride = (payload: Record<string, unknown>) => {
  const overrides = payload.appliedOverrides
  return Boolean(
    overrides &&
      typeof overrides === "object" &&
      "__target_price_usd" in overrides
  )
}

const pool = new Pool({ connectionString, max: 1 })
const repository = createCommercialRevisionsRepository({ pool })

try {
  const candidates = await pool.query<CandidateRow>(`
    SELECT quote.id, quote.organization_id, quote.customer_id,
      quote.customer_part_code,
      quote.total_rate_inr::text, quote.profit_percent::text,
      quote.conversion_rate::text, quote.packing_cost::text,
      quote.shipping_cost::text, quote.calculation_json,
      quote.source_payload, item.uid AS item_uid,
      item.item_type, item.pricing_method,
      item.direct_purchase_price_per_piece::text,
      item.pieces_per_kg::text, item.rejection_percent::text,
      snapshot.product_snapshot,
      COALESCE(component.child_count, 0)::text AS child_count,
      COALESCE(component.child_quote_total, 0)::text AS child_quote_total
    FROM sales.quote_items quote
    JOIN catalog.items item ON item.id = quote.item_id
    JOIN sales.quote_product_snapshots snapshot
      ON snapshot.quote_item_id = quote.id
    LEFT JOIN LATERAL (
      SELECT count(*) AS child_count,
        COALESCE(sum(link.extended_cost), 0) AS child_quote_total
      FROM sales.quote_package_components link
      WHERE link.quote_product_snapshot_id = snapshot.id
    ) component ON true
    WHERE quote.is_active
      AND quote.status IN ('Sent', 'Accepted')
      AND (
        $1::boolean
        OR (
          quote.source_table = 'quote_revisions'
          AND quote.source_payload ->> 'sourceKind' = 'Bulk Revision'
        )
      )
      AND (
        lower(COALESCE(snapshot.product_snapshot ->> 'pricingMethod',
          item.pricing_method)) = 'direct purchase'
        OR COALESCE(component.child_count, 0) > 0
      )
    ORDER BY item.uid, quote.id
  `, [auditAllActive])

  const direct: Mismatch[] = []
  const packages: Mismatch[] = []
  for (const row of candidates.rows) {
    const snapshot = row.product_snapshot ?? {}
    const actual = number(row.total_rate_inr)
    const common = {
      actual,
      customerId: row.customer_id,
      customerPartCode: row.customer_part_code,
      itemType: row.item_type,
      itemUid: row.item_uid,
      keepSameSource: hasTargetOverride(row.source_payload ?? {}),
      organizationId: row.organization_id,
      profitPercent: number(row.profit_percent),
      quoteItemId: row.id,
    }
    const pricingMethod = snapshotText(
      snapshot,
      "pricingMethod",
      row.pricing_method
    ).toLowerCase()
    if (pricingMethod === "direct purchase" && number(row.child_count) === 0) {
      const calculated = calculateStoredProductRevisionCosting({
        baseCostPerPiece: snapshotNumber(
          snapshot,
          "directPurchasePricePerPiece",
          number(row.direct_purchase_price_per_piece)
        ),
        conversionRate: number(row.conversion_rate),
        packingCostPerKg: number(row.packing_cost),
        piecesPerKg: snapshotNumber(
          snapshot,
          "piecesPerKg",
          number(row.pieces_per_kg)
        ),
        profitPercent: number(row.profit_percent),
        rejectionPercent: snapshotNumber(
          snapshot,
          "rejectionPercent",
          number(row.rejection_percent)
        ),
        shippingCostPerKg: number(row.shipping_cost),
      })
      const delta = calculated.rateInr - actual
      if (Math.abs(delta) > priceTolerance) {
        direct.push({
          ...common,
          delta,
          expected: calculated.rateInr,
        })
      }
    }

    if (number(row.child_count) > 0) {
      const calculated = calculatePackageRevisionCostingFromBase({
        childQuoteTotal: number(row.child_quote_total),
        conversionRate: number(row.conversion_rate),
        packingCostPerKg: number(row.packing_cost),
        piecesPerKg: snapshotNumber(
          snapshot,
          "piecesPerKg",
          number(row.pieces_per_kg)
        ),
        processCostPerPiece: number(
          row.calculation_json.packageProcessCostPerPiece
        ),
        profitPercent: number(row.profit_percent),
        rejectionPercent: snapshotNumber(
          snapshot,
          "rejectionPercent",
          number(row.rejection_percent)
        ),
        shippingCostPerKg: number(row.shipping_cost),
      })
      const delta = calculated.totalRateInr - actual
      if (Math.abs(delta) > priceTolerance) {
        packages.push({
          ...common,
          delta,
          expected: calculated.totalRateInr,
        })
      }
    }
  }

  const mismatchedIds = [...direct, ...packages].map(
    (row) => row.quoteItemId
  )
  const roots = mismatchedIds.length
    ? await pool.query<{ root_quote_item_id: string }>(
        `
          WITH RECURSIVE ancestors AS (
            SELECT candidate.id AS quote_item_id, candidate.id AS source_id,
              ARRAY[candidate.id]::uuid[] AS path, 0 AS depth
            FROM unnest($1::uuid[]) candidate(id)
            UNION ALL
            SELECT parent.quote_item_id, ancestors.source_id,
              ancestors.path || parent.quote_item_id, ancestors.depth + 1
            FROM ancestors
            JOIN sales.quote_package_components component
              ON component.child_quote_item_id = ancestors.quote_item_id
            JOIN sales.quote_product_snapshots parent
              ON parent.id = component.quote_product_snapshot_id
            WHERE ancestors.depth < 20
              AND NOT parent.quote_item_id = ANY(ancestors.path)
          )
          SELECT DISTINCT quote.id AS root_quote_item_id
          FROM ancestors
          JOIN sales.quote_items quote ON quote.id = ancestors.quote_item_id
          WHERE quote.is_active AND quote.status IN ('Sent', 'Accepted')
            AND NULLIF(btrim(quote.customer_part_code), '') IS NOT NULL
          ORDER BY quote.id
        `,
        [mismatchedIds]
      )
    : { rows: [] }

  const summarize = (rows: Mismatch[]) => ({
    count: rows.length,
    keepSameSourceCount: rows.filter((row) => row.keepSameSource).length,
    largestUnderstatements: [...rows]
      .sort((left, right) => right.delta - left.delta)
      .slice(0, 5),
    totalDeltaInrPerPiece: rows.reduce((total, row) => total + row.delta, 0),
  })

  console.log(
    JSON.stringify(
      {
        auditScope: auditAllActive ? "All Active Prices" : "Bulk Revision Lineage",
        activeCandidates: candidates.rows.length,
        affectedActiveRoots: roots.rows.length,
        directPurchase: summarize(direct),
        packageOrAssembly: summarize(packages),
      },
      null,
      2
    )
  )

  if (apply) {
    if (direct.length !== 0 || packages.length > 109) {
      throw new Error(
        `Repair scope is unsafe: expected 0 Direct Purchase and at most 109 Package mismatches, found ${direct.length} and ${packages.length}.`
      )
    }
    if (
      packages.some(
        (row) => row.keepSameSource || !row.customerPartCode
      )
    ) {
      throw new Error(
        "Repair includes a Keep Price Same or non-root Package row; refusing automatic publication."
      )
    }

    const byCustomer = new Map<string, Mismatch[]>()
    for (const row of packages) {
      const current = byCustomer.get(row.customerId) ?? []
      current.push(row)
      byCustomer.set(row.customerId, current)
    }
    const completedRevisions = []
    for (const [customerId, customerRows] of byCustomer) {
      const active = await pool.query<{ id: string }>(
        `
          SELECT id
          FROM sales.quote_items
          WHERE id = ANY($1::uuid[])
            AND is_active AND status IN ('Sent', 'Accepted')
        `,
        [customerRows.map((row) => row.quoteItemId)]
      )
      const activeIds = new Set(active.rows.map((row) => row.id))
      const activeCustomerRows = customerRows.filter((row) =>
        activeIds.has(row.quoteItemId)
      )
      if (!activeCustomerRows.length) continue
      const [first] = activeCustomerRows
      const revision = await repository.createBulkPriceRevision({
        customerId,
        effectiveOn: "2026-09-01",
        organizationId: first!.organizationId,
        reason:
          "Repair Package root packing and shipping omitted by bulk revision",
        revisionRoute: "Customer Parameter Bulk Revision",
      })
      const byProfit = new Map<string, Mismatch[]>()
      for (const row of activeCustomerRows) {
        const key = row.profitPercent.toFixed(12)
        const current = byProfit.get(key) ?? []
        current.push(row)
        byProfit.set(key, current)
      }
      for (const rows of byProfit.values()) {
        await repository.stageBulkPriceRevisionChange({
          bulkPriceRevisionId: revision.id,
          fieldName: "profit_percent",
          newValue: rows[0]!.profitPercent,
          notes:
            "Preserve customer profit while restoring Package root packing and shipping.",
          selectedQuoteItemIds: rows.map((row) => row.quoteItemId),
        })
      }
      const completed = await repository.completeBulkPriceRevision({
        bulkPriceRevisionId: revision.id,
      })
      completedRevisions.push({
        customerId,
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        selectedPrices: activeCustomerRows.length,
        ...completed,
      })
    }
    console.log(
      JSON.stringify(
        {
          completedRevisions,
          repairedPackagePrices: packages.length,
        },
        null,
        2
      )
    )
  }
} finally {
  await repository.close()
  await pool.end()
}
