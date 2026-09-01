import { Pool } from "pg"

import {
  calculateCosting,
  isForgingCostApplicable,
  type CostingResult,
  type ProductCostingInput,
  type QuoteCostingInput,
} from "../src/pricing-calculation"

type CorrectionField =
  | "alloyPremium"
  | "casting"
  | "checking"
  | "extrusionCost"
  | "rejectionPercent"

type Correction = {
  field: CorrectionField
  value: number
  uids: readonly string[]
}

type DerivedListRow = {
  alloy_premium: string
  assembled_part_inr: string
  calculation_json: Record<string, unknown>
  conversion_rate: string
  extrusion_cost: string
  forging_cost: string
  id: string
  packing_cost: string
  product_snapshot: Record<string, unknown>
  profit_percent: string
  purchase_times: string
  scrap_rate: string
  shipping_cost: string
  source_product_type: string | null
  uid: string
}

const repairRevisionId = "448843ce-e5e0-442d-8a2b-00008827f2c0"
const m1143RevisionId = "3872b89e-eddc-4645-9c36-b095effbdb3f"
const originalRevisionId = "6525bde7-6ebd-4be1-b5fc-75d82f91a41e"

const corrections = [
  {
    field: "rejectionPercent",
    value: 0.05,
    uids: [
      "M1207",
      "M1208",
      "M1644",
      "M1682",
      "M1683",
      "M1696",
      "M1799",
      "M1860",
      "M2115",
    ],
  },
  {
    field: "rejectionPercent",
    value: 0.1,
    uids: [
      "M1805",
      "M1806",
      "M1807",
      "M1808",
      "M1809",
      "M1810",
      "M1811",
      "M1812",
    ],
  },
  { field: "checking", value: 10, uids: ["M1711", "M1712", "M1713"] },
  { field: "casting", value: 47.76, uids: ["M749"] },
  {
    field: "extrusionCost",
    value: 200,
    uids: ["M1302", "M331", "M448", "M576", "R16", "R17", "R309"],
  },
  { field: "extrusionCost", value: 100, uids: ["M1382"] },
  {
    field: "extrusionCost",
    value: 36,
    uids: ["M1785", "M1848", "M1851", "M1853", "M1862"],
  },
  { field: "extrusionCost", value: 26, uids: ["M1861", "M2114"] },
  { field: "extrusionCost", value: 120, uids: ["M832"] },
  { field: "extrusionCost", value: 170, uids: ["R228"] },
  { field: "extrusionCost", value: 160, uids: ["R293"] },
  {
    field: "alloyPremium",
    value: 36,
    uids: ["M1785", "M1848", "M1851", "M1853"],
  },
  { field: "alloyPremium", value: 7, uids: ["M1861", "M2114"] },
  { field: "alloyPremium", value: 26, uids: ["M1862"] },
] as const satisfies readonly Correction[]

const expectedByUid = new Map<string, Map<CorrectionField, number>>()
for (const correction of corrections) {
  for (const uid of correction.uids) {
    const expected = expectedByUid.get(uid) ?? new Map()
    expected.set(correction.field, correction.value)
    expectedByUid.set(uid, expected)
  }
}
const requestedUids = [...expectedByUid.keys()].sort()
const expectedAssignments = corrections.reduce(
  (total, correction) => total + correction.uids.length,
  0
)

const connectionString =
  process.env.WEB_DATABASE_URL ?? process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("WEB_DATABASE_URL or DATABASE_URL is required.")
}
// eslint-disable-next-line turbo/no-undeclared-env-vars -- operator safety guard
if (process.env.MRM_NEON_BRANCH !== "staging") {
  throw new Error("This verification is restricted to the managed staging branch.")
}

const pool = new Pool({ connectionString, max: 1 })
const number = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const sameNumber = (left: number, right: number) =>
  Math.abs(left - right) <= 0.000001

const productInput = (snapshot: Record<string, unknown>): ProductCostingInput => ({
  annealing: number(snapshot.annealing),
  assemblyOperationCost: 0,
  buffing: number(snapshot.buffing),
  burningLossPercent: number(snapshot.burningLossPercent),
  casting: number(snapshot.casting),
  checking: number(snapshot.checking),
  deburring: number(snapshot.deburring),
  machiningCost: number(snapshot.machiningCost),
  marking: number(snapshot.marking),
  overheadCost: number(snapshot.overheadCost),
  plating: number(snapshot.plating),
  rejectionPercent: number(snapshot.rejectionPercent),
  sealant: number(snapshot.sealant),
  washing: number(snapshot.washing),
  weight100Pcs: number(snapshot.weight100Pcs),
})

const quoteInput = (row: DerivedListRow): QuoteCostingInput => ({
  alloyPremium: number(row.product_snapshot.alloyPremium),
  assembledPartInr: number(row.assembled_part_inr),
  conversionRate: number(row.conversion_rate),
  extCost: number(row.product_snapshot.extrusionCost),
  forgingCost: isForgingCostApplicable(row.source_product_type)
    ? number(row.product_snapshot.forgingCost)
    : 0,
  packingCost: number(row.packing_cost),
  profitPercent: number(row.profit_percent),
  purchaseTimes: number(row.purchase_times),
  scrapRate: number(row.scrap_rate),
  shippingCost: number(row.shipping_cost),
})

const calculationFields = [
  "netRateWithAlloy",
  "netRateWithoutAlloy",
  "piecesPerKg",
  "processCost",
  "profitB",
  "rateInr",
  "rateUsd",
  "rawMaterialCost",
  "rejectionCost",
  "scrapRatePerGm",
  "scrapReturn",
  "scrapReturnPrice",
  "scrapReturnPriceIncludingBurningLoss",
  "totalA",
  "totalAPlusB",
  "totalRateInr",
  "totalRodsCost",
] as const satisfies readonly (keyof CostingResult)[]

try {
  const revision = await pool.query<{
    revision_number: string
    status: string
  }>(
    `SELECT revision_number, status FROM sales.bulk_price_revisions WHERE id = $1`,
    [repairRevisionId]
  )
  if (
    revision.rows[0]?.revision_number !== "BPR-0005" ||
    revision.rows[0]?.status !== "Completed"
  ) {
    throw new Error(`Unexpected repair revision: ${JSON.stringify(revision.rows[0])}`)
  }

  const catalog = await pool.query<{
    alloyPremium: string
    casting: string
    checking: string
    extrusionCost: string
    rejectionPercent: string
    uid: string
  }>(
    `
      SELECT uid, alloy_premium::text AS "alloyPremium",
        casting::text AS casting, checking::text AS checking,
        extrusion_cost::text AS "extrusionCost",
        rejection_percent::text AS "rejectionPercent"
      FROM catalog.items
      WHERE uid = ANY($1::text[])
      ORDER BY uid
    `,
    [requestedUids]
  )
  if (catalog.rows.length !== requestedUids.length) {
    throw new Error(`Expected ${requestedUids.length} repaired Products.`)
  }
  for (const row of catalog.rows) {
    for (const [field, expected] of expectedByUid.get(row.uid)!) {
      if (!sameNumber(number(row[field]), expected)) {
        throw new Error(`${row.uid} ${field}: expected ${expected}, found ${row[field]}.`)
      }
    }
  }

  const snapshots = await pool.query<{
    product_snapshot: Record<string, unknown>
    uid: string
  }>(
    `
      SELECT DISTINCT ON (item.uid) item.uid, snapshot.product_snapshot
      FROM sales.quote_items quote
      JOIN sales.quote_product_snapshots snapshot
        ON snapshot.quote_item_id = quote.id
      JOIN catalog.items item ON item.id = quote.item_id
      WHERE quote.source_payload ->> 'sourceRecordId' = $1
        AND item.uid = ANY($2::text[])
      ORDER BY item.uid, quote.created_at DESC, quote.id DESC
    `,
    [repairRevisionId, requestedUids]
  )
  if (snapshots.rows.length !== requestedUids.length) {
    throw new Error(`Expected ${requestedUids.length} repaired Product snapshots.`)
  }
  for (const row of snapshots.rows) {
    for (const [field, expected] of expectedByUid.get(row.uid)!) {
      if (!sameNumber(number(row.product_snapshot[field]), expected)) {
        throw new Error(
          `${row.uid} snapshot ${field}: expected ${expected}, found ${String(row.product_snapshot[field])}.`
        )
      }
    }
  }

  const derivedLists = await pool.query<DerivedListRow>(
    `
      SELECT quote.id, item.uid, quote.scrap_rate::text,
        quote.alloy_premium::text, quote.extrusion_cost::text,
        quote.forging_cost::text, quote.packing_cost::text,
        quote.shipping_cost::text, quote.purchase_times::text,
        quote.profit_percent::text, quote.conversion_rate::text,
        quote.assembled_part_inr::text, quote.calculation_json,
        snapshot.product_snapshot,
        COALESCE(NULLIF(item.source_payload ->> 'productType', ''),
          snapshot.production_type) AS source_product_type
      FROM sales.quote_items quote
      JOIN sales.quote_product_snapshots snapshot
        ON snapshot.quote_item_id = quote.id
      JOIN catalog.items item ON item.id = quote.item_id
      WHERE quote.source_payload ->> 'sourceRecordId' = $1
        AND snapshot.item_type = 'List'
        AND COALESCE(snapshot.product_snapshot ->> 'pricingMethod', '')
          <> 'Direct Purchase'
      ORDER BY item.uid, quote.id
    `,
    [repairRevisionId]
  )
  if (!derivedLists.rows.length) {
    throw new Error("BPR-0005 contains no Derived List rows.")
  }
  let formulaMismatches = 0
  let persistedInputMismatches = 0
  for (const row of derivedLists.rows) {
    const expected = calculateCosting(
      productInput(row.product_snapshot),
      quoteInput(row)
    )
    for (const field of calculationFields) {
      if (!sameNumber(number(row.calculation_json[field]), expected[field])) {
        formulaMismatches += 1
      }
    }
    if (
      !sameNumber(number(row.alloy_premium), number(row.product_snapshot.alloyPremium)) ||
      !sameNumber(number(row.extrusion_cost), number(row.product_snapshot.extrusionCost)) ||
      !sameNumber(number(row.forging_cost), number(row.product_snapshot.forgingCost))
    ) {
      persistedInputMismatches += 1
    }
  }

  const aggregate = await pool.query<{
    active_root_prices: number
    customer_decisions: number
    disabled_sent_triggers: number
    m1143_active_correct_rows: number
    package_profit_mismatches: number
    package_total_mismatches: number
    replacement_quote_rows: number
    stale_active_bpr2_lists: number
  }>(
    `
      WITH RECURSIVE active_tree AS (
        SELECT root.id AS quote_item_id, ARRAY[root.id]::uuid[] AS path, 0 AS depth
        FROM sales.quote_items root
        WHERE root.is_active AND root.status IN ('Sent', 'Accepted')
          AND NULLIF(btrim(root.customer_part_code), '') IS NOT NULL
        UNION ALL
        SELECT component.child_quote_item_id, tree.path || component.child_quote_item_id,
          tree.depth + 1
        FROM active_tree tree
        JOIN sales.quote_product_snapshots snapshot
          ON snapshot.quote_item_id = tree.quote_item_id
        JOIN sales.quote_package_components component
          ON component.quote_product_snapshot_id = snapshot.id
        WHERE component.child_quote_item_id IS NOT NULL
          AND tree.depth < 20
          AND NOT component.child_quote_item_id = ANY(tree.path)
      ), repaired_packages AS (
        SELECT quote.total_rate_inr::numeric AS total_rate_inr,
          quote.profit_percent::numeric AS profit_percent,
          COALESCE((quote.calculation_json ->> 'childQuoteTotal')::numeric, 0)
            AS child_total,
          COALESCE((quote.calculation_json ->> 'totalA')::numeric, 0)
            AS own_total_a,
          COALESCE((quote.calculation_json ->> 'profitB')::numeric, 0)
            AS profit_b
        FROM sales.quote_items quote
        WHERE quote.source_payload ->> 'sourceRecordId' = $1
          AND EXISTS (
            SELECT 1 FROM sales.quote_product_snapshots snapshot
            JOIN sales.quote_package_components component
              ON component.quote_product_snapshot_id = snapshot.id
            WHERE snapshot.quote_item_id = quote.id
          )
      ), active_bpr2_lists AS (
        SELECT quote.calculation_json, quote.total_rate_inr::numeric AS total_rate_inr,
          quote.profit_percent::numeric AS profit_percent,
          quote.assembled_part_inr::numeric AS assembled_part_inr,
          snapshot.product_snapshot
        FROM (SELECT DISTINCT quote_item_id FROM active_tree) tree
        JOIN sales.quote_items quote ON quote.id = tree.quote_item_id
        JOIN sales.quote_product_snapshots snapshot
          ON snapshot.quote_item_id = quote.id
        WHERE quote.source_payload ->> 'sourceRecordId' = $2
          AND snapshot.item_type = 'List'
          AND COALESCE(snapshot.product_snapshot ->> 'pricingMethod', '')
            <> 'Direct Purchase'
          AND quote.calculation_json ? 'piecesPerKg'
          AND (quote.calculation_json ->> 'piecesPerKg')::numeric > 0
      )
      SELECT
        (SELECT count(*) FROM sales.bulk_price_revision_changes
          WHERE bulk_price_revision_id = $1::uuid
            AND field_name = 'customer_price_decision')::int AS customer_decisions,
        (SELECT count(*) FROM sales.quote_items
          WHERE source_payload ->> 'sourceRecordId' = $1)::int
          AS replacement_quote_rows,
        (SELECT count(*) FROM sales.quote_items
          WHERE is_active AND status IN ('Sent', 'Accepted')
            AND NULLIF(btrim(customer_part_code), '') IS NOT NULL)::int
          AS active_root_prices,
        (SELECT count(*) FROM repaired_packages
          WHERE abs(profit_b - own_total_a * profit_percent) > 0.000001)::int
          AS package_profit_mismatches,
        (SELECT count(*) FROM repaired_packages
          WHERE abs(total_rate_inr - (child_total + own_total_a + profit_b))
            > 0.000001)::int AS package_total_mismatches,
        (SELECT count(*) FROM active_bpr2_lists
          WHERE abs(
            (calculation_json ->> 'rejectionCost')::numeric -
            (calculation_json ->> 'totalRodsCost')::numeric *
              COALESCE((product_snapshot ->> 'rejectionPercent')::numeric, 0)
          ) > 0.000001 OR abs(
            total_rate_inr -
            ((calculation_json ->> 'totalA')::numeric * (1 + profit_percent) /
              (calculation_json ->> 'piecesPerKg')::numeric + assembled_part_inr)
          ) > 0.000001)::int AS stale_active_bpr2_lists,
        (SELECT count(*) FROM sales.quote_items quote
          JOIN catalog.items item ON item.id = quote.item_id
          WHERE item.uid = 'M1143' AND quote.is_active
            AND quote.status IN ('Sent', 'Accepted')
            AND NULLIF(btrim(quote.customer_part_code), '') IS NOT NULL
            AND quote.source_payload ->> 'sourceRecordId' = $3
            AND abs((quote.calculation_json ->> 'rejectionCost')::numeric - 13.3507)
              <= 0.000001
            AND abs(quote.total_rate_inr::numeric - 23.16408194) <= 0.000001
            AND abs(quote.rate_usd::numeric - 0.24512256) <= 0.000001)::int
          AS m1143_active_correct_rows,
        (SELECT count(*) FROM pg_trigger
          WHERE NOT tgisinternal AND tgenabled <> 'O'
            AND tgname LIKE '%sent%immut%')::int AS disabled_sent_triggers
    `,
    [repairRevisionId, originalRevisionId, m1143RevisionId]
  )
  const result = aggregate.rows[0]!
  if (
    formulaMismatches !== 0 ||
    persistedInputMismatches !== 0 ||
    result.customer_decisions !== 154 ||
    result.replacement_quote_rows !== 264 ||
    result.active_root_prices !== 3833 ||
    result.package_profit_mismatches !== 0 ||
    result.package_total_mismatches !== 0 ||
    result.stale_active_bpr2_lists !== 0 ||
    result.m1143_active_correct_rows < 1 ||
    result.disabled_sent_triggers !== 0
  ) {
    throw new Error(
      `Repair verification failed: ${JSON.stringify({ formulaMismatches, persistedInputMismatches, ...result })}`
    )
  }

  console.log(
    JSON.stringify(
      {
        activeRootPrices: result.active_root_prices,
        correctedProductFields: expectedAssignments,
        correctedProducts: requestedUids.length,
        customerDecisions: result.customer_decisions,
        derivedListRowsVerified: derivedLists.rows.length,
        disabledSentTriggers: result.disabled_sent_triggers,
        formulaMismatches,
        m1143ActiveCorrectRows: result.m1143_active_correct_rows,
        packageProfitMismatches: result.package_profit_mismatches,
        packageTotalMismatches: result.package_total_mismatches,
        persistedInputMismatches,
        replacementQuoteRows: result.replacement_quote_rows,
        revisionId: repairRevisionId,
        revisionNumber: revision.rows[0].revision_number,
        staleActiveBpr2Lists: result.stale_active_bpr2_lists,
        status: revision.rows[0].status,
      },
      null,
      2
    )
  )
} finally {
  await pool.end()
}
