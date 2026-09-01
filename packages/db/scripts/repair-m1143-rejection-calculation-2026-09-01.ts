import { createHash } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { Pool } from "pg"

import { createCommercialRevisionsRepository } from "../src/commercial-revisions"

const connectionString =
  process.env.WEB_DATABASE_URL ?? process.env.DATABASE_URL
const apply = process.argv.includes("--apply")
const reason = "Repair M1143 final rate conversion after BPR-0003"

if (!connectionString) throw new Error("Managed database URL is required.")
// eslint-disable-next-line turbo/no-undeclared-env-vars -- operator safety guard
if (process.env.MRM_NEON_BRANCH !== "staging") {
  throw new Error("This repair is restricted to managed staging.")
}

const pool = new Pool({ connectionString, max: 1 })
const repository = createCommercialRevisionsRepository({ pool })

try {
  const product = await pool.query<{
    id: string
    organization_id: string
    rejection_percent: string
  }>(
    `
      SELECT id, organization_id, rejection_percent::text
      FROM catalog.items
      WHERE uid = 'M1143'
    `
  )
  const item = product.rows[0]
  if (!item || Number(item.rejection_percent) !== 0.05) {
    throw new Error("M1143 must exist with Rejection % = 5 before repair.")
  }

  const impact = await pool.query<{
    active_root_prices: number
    root_ids: string[]
  }>(
    `
      WITH RECURSIVE quote_tree AS (
        SELECT root.id AS root_id, root.id AS quote_item_id, root.item_id,
          ARRAY[root.id]::uuid[] AS path, 0 AS depth
        FROM sales.quote_items root
        WHERE root.organization_id = $2 AND root.is_active
          AND root.status IN ('Sent', 'Accepted')
          AND NULLIF(btrim(root.customer_part_code), '') IS NOT NULL
        UNION ALL
        SELECT tree.root_id, component.child_quote_item_id,
          component.component_item_id, tree.path || component.child_quote_item_id,
          tree.depth + 1
        FROM quote_tree tree
        JOIN sales.quote_product_snapshots snapshot
          ON snapshot.quote_item_id = tree.quote_item_id
        JOIN sales.quote_package_components component
          ON component.quote_product_snapshot_id = snapshot.id
        WHERE component.child_quote_item_id IS NOT NULL
          AND tree.depth < 20
          AND NOT component.child_quote_item_id = ANY(tree.path)
      ), affected AS (
        SELECT DISTINCT root_id FROM quote_tree WHERE item_id = $1
      )
      SELECT count(*)::int AS active_root_prices,
        array_agg(root_id ORDER BY root_id) AS root_ids
      FROM affected
    `,
    [item.id, item.organization_id]
  )
  const rootIds = impact.rows[0]?.root_ids ?? []
  if (rootIds.length !== 1 || impact.rows[0]?.active_root_prices !== 1) {
    throw new Error(
      `Expected one active M1143 price tree, found ${rootIds.length}.`
    )
  }

  const current = await pool.query<{
    approved_price_usd: string
    current_total_rate_inr: string
    rejection_cost: string
    expected_rejection_cost: string
    expected_total_rate_inr: string
  }>(
    `
      SELECT quote.approved_price_usd::text,
        quote.total_rate_inr::text AS current_total_rate_inr,
        (quote.calculation_json ->> 'rejectionCost') AS rejection_cost,
        (
          (quote.calculation_json ->> 'totalRodsCost')::numeric *
          ($2::numeric)
        )::text AS expected_rejection_cost,
        (
          (quote.calculation_json ->> 'totalA')::numeric *
          (1 + quote.profit_percent) /
          (quote.calculation_json ->> 'piecesPerKg')::numeric +
          quote.assembled_part_inr
        )::text AS expected_total_rate_inr
      FROM sales.quote_items quote
      WHERE quote.id = $1
    `,
    [rootIds[0], Number(item.rejection_percent)]
  )
  const before = current.rows[0]!
  if (
    Math.abs(
      Number(before.rejection_cost) - Number(before.expected_rejection_cost)
    ) <= 0.000001 &&
    Math.abs(
      Number(before.current_total_rate_inr) -
        Number(before.expected_total_rate_inr)
    ) <= 0.000001
  ) {
    console.log("M1143 rejection calculation already matches 5%.")
    process.exitCode = 0
  } else if (!apply) {
    console.log(
      JSON.stringify(
        {
          activePriceTrees: rootIds.length,
          currentApprovedPriceUsd: Number(before.approved_price_usd),
          currentRejectionCost: Number(before.rejection_cost),
          currentTotalRateInr: Number(before.current_total_rate_inr),
          expectedRejectionCost: Number(before.expected_rejection_cost),
          expectedTotalRateInr: Number(before.expected_total_rate_inr),
          productUid: "M1143",
        },
        null,
        2
      )
    )
    console.log("Dry run complete. Re-run with --apply to publish the repair.")
  } else {
    const quoteGraph = await pool.query(
      `
        WITH RECURSIVE tree(id) AS (
          SELECT unnest($1::uuid[])
          UNION
          SELECT component.child_quote_item_id
          FROM tree
          JOIN sales.quote_product_snapshots snapshot
            ON snapshot.quote_item_id = tree.id
          JOIN sales.quote_package_components component
            ON component.quote_product_snapshot_id = snapshot.id
          WHERE component.child_quote_item_id IS NOT NULL
        )
        SELECT to_jsonb(quote) AS row
        FROM sales.quote_items quote
        WHERE quote.id IN (SELECT id FROM tree)
        ORDER BY quote.id
      `,
      [rootIds]
    )
    const quoteIds = quoteGraph.rows.map(
      (entry) => (entry.row as { id: string }).id
    )
    const snapshots = await pool.query(
      `
        SELECT to_jsonb(snapshot) AS row
        FROM sales.quote_product_snapshots snapshot
        WHERE snapshot.quote_item_id = ANY($1::uuid[])
        ORDER BY snapshot.id
      `,
      [quoteIds]
    )
    const snapshotIds = snapshots.rows.map(
      (entry) => (entry.row as { id: string }).id
    )
    const components = await pool.query(
      `
        SELECT to_jsonb(component) AS row
        FROM sales.quote_package_components component
        WHERE component.quote_product_snapshot_id = ANY($1::uuid[])
        ORDER BY component.id
      `,
      [snapshotIds]
    )
    const backup = {
      componentLinks: components.rows.map((entry) => entry.row),
      createdAt: new Date().toISOString(),
      product: product.rows[0],
      quoteItems: quoteGraph.rows.map((entry) => entry.row),
      quoteSnapshots: snapshots.rows.map((entry) => entry.row),
    }
    const backupText = `${JSON.stringify(backup, null, 2)}\n`
    const timestamp = new Date().toISOString().replaceAll(":", "-")
    const backupPath = fileURLToPath(
      new URL(
        `../../../.handoff/m1143-rejection-repair-backup-${timestamp}.json`,
        import.meta.url
      )
    )
    await writeFile(backupPath, backupText, { encoding: "utf8", flag: "wx" })
    const backupSha256 = createHash("sha256")
      .update(backupText)
      .digest("hex")

    const existing = await pool.query<{
      id: string
      revision_number: string
      status: string
    }>(
      `
        SELECT id, revision_number, status
        FROM sales.bulk_price_revisions
        WHERE organization_id = $1 AND reason = $2 AND status <> 'Completed'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [item.organization_id, reason]
    )
    const revision = existing.rows[0]
      ? {
          id: existing.rows[0].id,
          revisionNumber: existing.rows[0].revision_number,
          status: existing.rows[0].status,
        }
      : await repository.createBulkPriceRevision({
          effectiveOn: "2026-09-01",
          organizationId: item.organization_id,
          reason,
          revisionRoute: "Product Parameter Bulk Revision",
        })

    if (!existing.rows[0]) {
      const staged = await repository.stageBulkPriceRevisionChange({
        bulkPriceRevisionId: revision.id,
        fieldName: "rejection_percent",
        newValue: 0.05,
        notes: "Recalculate retained customer inputs after BPR-0002",
        selectedProductIds: [item.id],
      })
      if (staged.selectedCount !== 1 || staged.skippedCount !== 0) {
        throw new Error("M1143 repair did not stage exactly one Product.")
      }
    }
    if (revision.status === "Pending Costing") {
      const handedOff = await repository.completeBulkPriceRevision({
        bulkPriceRevisionId: revision.id,
      })
      if (handedOff.status !== "Pending Customer Costing") {
        throw new Error(`Unexpected handoff status: ${handedOff.status}`)
      }
    }

    const work = await repository.getProductBulkRevisionCustomerCosting(
      revision.id,
      { limit: 10 }
    )
    if (!work || work.coverage.total !== 1 || work.coverage.truncated) {
      throw new Error("M1143 repair did not produce exactly one price decision.")
    }
    const price = work.rows[0]!
    if (price.decision && price.decision !== "Revise Price") {
      throw new Error(`Unexpected existing decision: ${price.decision}`)
    }
    if (!price.decision) {
      await repository.applyProductBulkRevisionPriceDecision({
        bulkPriceRevisionId: revision.id,
        decision: "Revise Price",
        notes: "Use corrected 5% rejection calculation",
        sourceQuoteItemId: price.quoteItemId,
      })
    }
    const completed = await repository.completeBulkPriceRevision({
      bulkPriceRevisionId: revision.id,
    })
    if (completed.status !== "Completed" || completed.revisedQuoteCount < 1) {
      throw new Error(`Unexpected completion: ${JSON.stringify(completed)}`)
    }

    const verified = await pool.query<{
      active_root_prices: number
      approved_price_usd: string
      disabled_sent_triggers: number
      rejection_cost: string
      rejection_mismatch: boolean
      revision_status: string
      total_a_mismatch: boolean
      total_rate_mismatch: boolean
      total_rate_inr: string
    }>(
      `
        SELECT quote.approved_price_usd::text,
          quote.total_rate_inr::text,
          (quote.calculation_json ->> 'rejectionCost') AS rejection_cost,
          abs(
            (quote.calculation_json ->> 'rejectionCost')::numeric -
            (quote.calculation_json ->> 'totalRodsCost')::numeric *
            (snapshot.product_snapshot ->> 'rejectionPercent')::numeric
          ) > 0.000001 AS rejection_mismatch,
          abs(
            (quote.calculation_json ->> 'totalA')::numeric -
            (
              (quote.calculation_json ->> 'processCost')::numeric +
              (quote.calculation_json ->> 'totalRodsCost')::numeric +
              (quote.calculation_json ->> 'rejectionCost')::numeric
            )
          ) > 0.000001 AS total_a_mismatch,
          abs(
            quote.total_rate_inr -
            (
              (quote.calculation_json ->> 'totalA')::numeric *
              (1 + quote.profit_percent) /
              (quote.calculation_json ->> 'piecesPerKg')::numeric +
              quote.assembled_part_inr
            )
          ) > 0.000001 AS total_rate_mismatch,
          (SELECT count(*) FROM sales.quote_items root
            WHERE root.is_active AND root.status IN ('Sent', 'Accepted')
              AND NULLIF(btrim(root.customer_part_code), '') IS NOT NULL)::int
            AS active_root_prices,
          (SELECT count(*) FROM pg_trigger
            WHERE NOT tgisinternal AND tgenabled <> 'O'
              AND tgname LIKE '%sent%immut%')::int AS disabled_sent_triggers,
          (SELECT status FROM sales.bulk_price_revisions WHERE id = $1)
            AS revision_status
        FROM sales.quote_items quote
        JOIN sales.quote_product_snapshots snapshot
          ON snapshot.quote_item_id = quote.id
        JOIN catalog.items product ON product.id = quote.item_id
        WHERE product.uid = 'M1143' AND quote.is_active
      `,
      [revision.id]
    )
    const result = verified.rows[0]
    if (
      !result ||
      result.rejection_mismatch ||
      result.total_a_mismatch ||
      result.total_rate_mismatch ||
      result.active_root_prices !== 3833 ||
      result.disabled_sent_triggers !== 0 ||
      result.revision_status !== "Completed"
    ) {
      throw new Error(`M1143 verification failed: ${JSON.stringify(result)}`)
    }
    console.log(
      JSON.stringify(
        {
          backupPath,
          backupSha256,
          productUid: "M1143",
          revisionId: revision.id,
          revisionNumber: revision.revisionNumber,
          ...result,
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
