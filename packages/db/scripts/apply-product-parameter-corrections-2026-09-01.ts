import { createHash } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { Pool } from "pg"

import { createCommercialRevisionsRepository } from "../src/commercial-revisions"

type CorrectionField =
  | "alloy_premium"
  | "casting"
  | "checking"
  | "ext_cost"
  | "rejection_percent"

type CorrectionGroup = {
  fieldName: CorrectionField
  newValue: number
  uids: readonly string[]
}

type ProductRow = {
  alloy_premium: string
  casting: string
  checking: string
  extrusion_cost: string
  id: string
  organization_id: string
  rejection_percent: string
  uid: string
}

const correctionGroups = [
  {
    fieldName: "rejection_percent",
    newValue: 0.05,
    uids: [
      "M1143",
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
    fieldName: "rejection_percent",
    newValue: 0.1,
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
  {
    fieldName: "checking",
    newValue: 10,
    uids: ["M1711", "M1712", "M1713"],
  },
  { fieldName: "casting", newValue: 47.76, uids: ["M749"] },
  {
    fieldName: "ext_cost",
    newValue: 200,
    uids: ["M1302", "M331", "M448", "M576", "R16", "R17", "R309"],
  },
  { fieldName: "ext_cost", newValue: 100, uids: ["M1382"] },
  {
    fieldName: "ext_cost",
    newValue: 36,
    uids: ["M1785", "M1848", "M1851", "M1853", "M1862"],
  },
  { fieldName: "ext_cost", newValue: 26, uids: ["M1861", "M2114"] },
  { fieldName: "ext_cost", newValue: 120, uids: ["M832"] },
  { fieldName: "ext_cost", newValue: 170, uids: ["R228"] },
  { fieldName: "ext_cost", newValue: 160, uids: ["R293"] },
  {
    fieldName: "alloy_premium",
    newValue: 36,
    uids: ["M1785", "M1848", "M1851", "M1853"],
  },
  {
    fieldName: "alloy_premium",
    newValue: 7,
    uids: ["M1861", "M2114"],
  },
  { fieldName: "alloy_premium", newValue: 26, uids: ["M1862"] },
] as const satisfies readonly CorrectionGroup[]

const columnByField = {
  alloy_premium: "alloy_premium",
  casting: "casting",
  checking: "checking",
  ext_cost: "extrusion_cost",
  rejection_percent: "rejection_percent",
} as const satisfies Record<CorrectionField, keyof ProductRow>

const expectedByUid = new Map<string, Map<CorrectionField, number>>()
for (const group of correctionGroups) {
  for (const uid of group.uids) {
    const expected = expectedByUid.get(uid) ?? new Map<CorrectionField, number>()
    expected.set(group.fieldName, group.newValue)
    expectedByUid.set(uid, expected)
  }
}

const requestedUids = [...expectedByUid.keys()].sort()
const connectionString =
  process.env.WEB_DATABASE_URL ?? process.env.DATABASE_URL
const apply = process.argv.includes("--apply")

if (!connectionString) {
  throw new Error("WEB_DATABASE_URL or DATABASE_URL is required.")
}
// eslint-disable-next-line turbo/no-undeclared-env-vars -- operator safety guard
if (process.env.MRM_NEON_BRANCH !== "staging") {
  throw new Error("This correction is restricted to the managed staging branch.")
}

const pool = new Pool({ connectionString, max: 1 })
const repository = createCommercialRevisionsRepository({ pool })

const close = async () => {
  await repository.close()
  await pool.end()
}

const numericValue = (row: ProductRow, fieldName: CorrectionField) =>
  Number(row[columnByField[fieldName]])

const sameNumber = (left: number, right: number) =>
  Math.abs(left - right) <= 0.00000001

try {
  const products = await pool.query<ProductRow>(
    `
      SELECT id, organization_id, uid, rejection_percent::text,
        extrusion_cost::text, alloy_premium::text, checking::text,
        casting::text
      FROM catalog.items
      WHERE uid = ANY($1::text[])
      ORDER BY uid
    `,
    [requestedUids]
  )
  if (products.rows.length !== requestedUids.length) {
    const found = new Set(products.rows.map((row) => row.uid))
    const missing = requestedUids.filter((uid) => !found.has(uid))
    throw new Error(`Missing Product UIDs: ${missing.join(", ")}`)
  }

  const organizationIds = new Set(
    products.rows.map((product) => product.organization_id)
  )
  if (organizationIds.size !== 1) {
    throw new Error("Requested Products do not belong to one Organization.")
  }
  const organizationId = [...organizationIds][0]!
  const productByUid = new Map(products.rows.map((row) => [row.uid, row]))
  const mismatches = correctionGroups.flatMap((group) =>
    group.uids.flatMap((uid) => {
      const current = numericValue(productByUid.get(uid)!, group.fieldName)
      return sameNumber(current, group.newValue)
        ? []
        : [{ current, fieldName: group.fieldName, newValue: group.newValue, uid }]
    })
  )
  if (!mismatches.length) {
    const verification = await pool.query<{
      active_root_prices: number
      applied_product_revision_rows: number
      component_subtotal_profit_matches: number
      customer_price_decisions: number
      disabled_sent_triggers: number
      profit_scope_mismatches: number
      revised_quote_count: number
      revision_id: string
      revision_number: string
      revision_status: string
      total_mismatches: number
    }>(
      `
        WITH completed_revision AS (
          SELECT revision.id, revision.revision_number, revision.status,
            count(DISTINCT change.replacement_quote_item_id)::int
              AS revised_quote_count
          FROM sales.bulk_price_revisions revision
          LEFT JOIN sales.bulk_price_revision_changes change
            ON change.bulk_price_revision_id = revision.id
          WHERE revision.organization_id = $1
            AND revision.reason = $2
            AND revision.status = 'Completed'
          GROUP BY revision.id
          ORDER BY revision.created_at DESC
          LIMIT 1
        ), parent_quotes AS (
          SELECT quote.id, quote.profit_percent::numeric AS profit_percent,
            quote.total_rate_inr::numeric AS total_rate_inr,
            COALESCE((quote.calculation_json ->> 'childQuoteTotal')::numeric, 0)
              AS child_total,
            COALESCE((quote.calculation_json ->> 'totalA')::numeric, 0)
              AS own_total_a,
            COALESCE((quote.calculation_json ->> 'profitB')::numeric, 0)
              AS profit_b
          FROM sales.quote_items quote
          WHERE quote.is_active
            AND EXISTS (
              SELECT 1
              FROM sales.quote_product_snapshots snapshot
              JOIN sales.quote_package_components component
                ON component.quote_product_snapshot_id = snapshot.id
              WHERE snapshot.quote_item_id = quote.id
            )
        )
        SELECT revision.id AS revision_id,
          revision.revision_number,
          revision.status AS revision_status,
          revision.revised_quote_count::int,
          (SELECT count(*) FROM sales.bulk_price_revision_changes change
            WHERE change.bulk_price_revision_id = revision.id
              AND change.field_name <> 'customer_price_decision'
              AND change.applied_at IS NOT NULL)::int
            AS applied_product_revision_rows,
          (SELECT count(*) FROM sales.bulk_price_revision_changes change
            WHERE change.bulk_price_revision_id = revision.id
              AND change.field_name = 'customer_price_decision')::int
            AS customer_price_decisions,
          (SELECT count(*) FROM sales.quote_items
            WHERE is_active AND status IN ('Sent', 'Accepted')
              AND NULLIF(btrim(customer_part_code), '') IS NOT NULL)::int
            AS active_root_prices,
          (SELECT count(*) FROM parent_quotes
            WHERE abs(profit_b - own_total_a * profit_percent) > 0.000001)::int
            AS profit_scope_mismatches,
          (SELECT count(*) FROM parent_quotes
            WHERE abs(total_rate_inr - (child_total + own_total_a + profit_b))
              > 0.000001)::int AS total_mismatches,
          (SELECT count(*) FROM parent_quotes
            WHERE child_total > 0 AND profit_percent <> 0
              AND abs(profit_b - (child_total + own_total_a) * profit_percent)
                <= 0.000001)::int AS component_subtotal_profit_matches,
          (SELECT count(*) FROM pg_trigger
            WHERE NOT tgisinternal AND tgenabled <> 'O'
              AND tgname LIKE '%sent%immut%')::int AS disabled_sent_triggers
        FROM completed_revision revision
      `,
      [
        organizationId,
        "Correct Product Parameters after 2026-09-01 migration review",
      ]
    )
    const result = verification.rows[0]
    if (
      !result ||
      result.applied_product_revision_rows !== 157 ||
      result.customer_price_decisions !== 155 ||
      result.active_root_prices !== 3833 ||
      result.profit_scope_mismatches !== 0 ||
      result.total_mismatches !== 0 ||
      result.component_subtotal_profit_matches !== 0 ||
      result.disabled_sent_triggers !== 0
    ) {
      throw new Error(`Post-publish verification failed: ${JSON.stringify(result)}`)
    }
    console.log(
      JSON.stringify(
        {
          correctedProductFields: 47,
          correctedProducts: 40,
          ...result,
        },
        null,
        2
      )
    )
  } else if (mismatches.length !== 47) {
    throw new Error(
      `Expected 47 changed Product fields, found ${mismatches.length}. Refusing a partial rerun.`
    )
  } else {
    const impact = await pool.query<{
      affected_root_ids: string[]
      affected_roots: number
      graph_nodes: number
    }>(
      `
        WITH RECURSIVE quote_tree AS (
          SELECT root.id AS root_quote_item_id, root.id AS quote_item_id,
            root.item_id, ARRAY[root.id]::uuid[] AS quote_path, 0 AS depth
          FROM sales.quote_items root
          WHERE root.organization_id = $2 AND root.is_active
            AND root.status IN ('Sent', 'Accepted')
            AND NULLIF(btrim(root.customer_part_code), '') IS NOT NULL
          UNION ALL
          SELECT tree.root_quote_item_id, component.child_quote_item_id,
            component.component_item_id,
            tree.quote_path || component.child_quote_item_id, tree.depth + 1
          FROM quote_tree tree
          JOIN sales.quote_product_snapshots snapshot
            ON snapshot.quote_item_id = tree.quote_item_id
          JOIN sales.quote_package_components component
            ON component.quote_product_snapshot_id = snapshot.id
          WHERE component.child_quote_item_id IS NOT NULL
            AND tree.depth < 20
            AND NOT component.child_quote_item_id = ANY(tree.quote_path)
        ), affected AS (
          SELECT DISTINCT tree.root_quote_item_id
          FROM quote_tree tree
          JOIN catalog.items item ON item.id = tree.item_id
          WHERE item.uid = ANY($1::text[])
        )
        SELECT array_agg(root_quote_item_id ORDER BY root_quote_item_id)
            AS affected_root_ids,
          count(*)::int AS affected_roots,
          (SELECT count(*)::int FROM quote_tree
           WHERE root_quote_item_id IN (SELECT root_quote_item_id FROM affected))
            AS graph_nodes
        FROM affected
      `,
      [requestedUids, organizationId]
    )
    const impactRow = impact.rows[0]!
    if (impactRow.affected_roots !== 155) {
      throw new Error(
        `Expected 155 affected active root prices, found ${impactRow.affected_roots}.`
      )
    }

    const productClosure = await pool.query(
      `
        WITH RECURSIVE impacted(id) AS (
          SELECT id FROM catalog.items WHERE uid = ANY($1::text[])
          UNION
          SELECT line.parent_item_id
          FROM catalog.bom_lines line
          JOIN impacted child ON child.id = line.component_item_id
        )
        SELECT to_jsonb(item) AS row
        FROM catalog.items item
        WHERE item.id IN (SELECT id FROM impacted)
        ORDER BY item.uid
      `,
      [requestedUids]
    )

    console.log(
      JSON.stringify(
        {
          affectedActiveRootPrices: impactRow.affected_roots,
          affectedQuoteGraphNodes: impactRow.graph_nodes,
          changedProductFields: mismatches.length,
          correctionGroups: correctionGroups.length,
          productAncestorsIncluded: productClosure.rows.length,
          requestedProducts: requestedUids.length,
        },
        null,
        2
      )
    )

    if (!apply) {
      console.log("Dry run complete. Re-run with --apply to publish corrections.")
    } else {
      const existing = await pool.query<{
        id: string
        revision_number: string
        status: string
      }>(
        `
          SELECT id, revision_number, status
          FROM sales.bulk_price_revisions
          WHERE organization_id = $1
            AND reason = $2
            AND status <> 'Completed'
          ORDER BY created_at DESC
        `,
        [
          organizationId,
          "Correct Product Parameters after 2026-09-01 migration review",
        ]
      )
      const rootQuoteIds = impactRow.affected_root_ids
      const graph = await pool.query(
        `
          WITH RECURSIVE quote_tree AS (
            SELECT id AS quote_item_id
            FROM sales.quote_items
            WHERE id = ANY($1::uuid[])
            UNION
            SELECT component.child_quote_item_id
            FROM quote_tree tree
            JOIN sales.quote_product_snapshots snapshot
              ON snapshot.quote_item_id = tree.quote_item_id
            JOIN sales.quote_package_components component
              ON component.quote_product_snapshot_id = snapshot.id
            WHERE component.child_quote_item_id IS NOT NULL
          )
          SELECT to_jsonb(quote_item) AS row
          FROM sales.quote_items quote_item
          WHERE quote_item.id IN (SELECT quote_item_id FROM quote_tree)
          ORDER BY quote_item.id
        `,
        [rootQuoteIds]
      )
      const quoteIds = graph.rows.map(
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
      const components = snapshotIds.length
        ? await pool.query(
            `
              SELECT to_jsonb(component) AS row
              FROM sales.quote_package_components component
              WHERE component.quote_product_snapshot_id = ANY($1::uuid[])
              ORDER BY component.id
            `,
            [snapshotIds]
          )
        : { rows: [] }
      const countsBefore = await pool.query(
        `
          SELECT
            (SELECT count(*) FROM catalog.items)::int AS products,
            (SELECT count(*) FROM catalog.bom_lines)::int AS bom_lines,
            (SELECT count(*) FROM sales.quote_items)::int AS quote_rows,
            (SELECT count(*) FROM sales.quote_items
              WHERE is_active AND status IN ('Sent', 'Accepted')
                AND NULLIF(btrim(customer_part_code), '') IS NOT NULL)::int
              AS active_root_prices,
            (SELECT count(*) FROM sales.quote_package_components)::int
              AS component_links
        `
      )
      const backup = {
        affectedRootQuoteIds: rootQuoteIds,
        catalogItems: productClosure.rows.map((entry) => entry.row),
        componentLinks: components.rows.map((entry) => entry.row),
        countsBefore: countsBefore.rows[0],
        createdAt: new Date().toISOString(),
        productUids: requestedUids,
        quoteItems: graph.rows.map((entry) => entry.row),
        quoteSnapshots: snapshots.rows.map((entry) => entry.row),
      }
      const backupText = `${JSON.stringify(backup, null, 2)}\n`
      const timestamp = new Date().toISOString().replaceAll(":", "-")
      const backupPath = fileURLToPath(
        new URL(
          `../../../.handoff/product-parameter-corrections-backup-${timestamp}.json`,
          import.meta.url
        )
      )
      await writeFile(backupPath, backupText, { encoding: "utf8", flag: "wx" })
      const backupSha256 = createHash("sha256")
        .update(backupText)
        .digest("hex")
      console.log(`Backup: ${backupPath}`)
      console.log(`Backup SHA-256: ${backupSha256}`)

      const existingRevision = existing.rows[0]
      const revision = existingRevision
        ? {
            id: existingRevision.id,
            revisionNumber: existingRevision.revision_number,
            status: existingRevision.status,
          }
        : await repository.createBulkPriceRevision({
            effectiveOn: "2026-09-01",
            organizationId,
            reason:
              "Correct Product Parameters after 2026-09-01 migration review",
            revisionRoute: "Product Parameter Bulk Revision",
          })
      console.log(
        `${existingRevision ? "Resuming" : "Created"} ${revision.revisionNumber} (${revision.id}).`
      )

      if (existingRevision) {
        const staged = await pool.query<{
          applied: number
          changes: number
          groups: number
        }>(
          `
            SELECT count(*)::int AS changes,
              count(DISTINCT stage_group_id)::int AS groups,
              count(*) FILTER (WHERE applied_at IS NOT NULL)::int AS applied
            FROM sales.bulk_price_revision_changes
            WHERE bulk_price_revision_id = $1
          `,
          [revision.id]
        )
        if (
          staged.rows[0]?.changes !== 47 ||
          staged.rows[0]?.groups !== 14 ||
          (revision.status === "Pending Costing" &&
            staged.rows[0]?.applied !== 0)
        ) {
          throw new Error("Existing correction revision is not safely resumable.")
        }
      } else {
        for (const group of correctionGroups) {
          const selectedProductIds = group.uids.map(
            (uid) => productByUid.get(uid)!.id
          )
          const staged = await repository.stageBulkPriceRevisionChange({
            bulkPriceRevisionId: revision.id,
            fieldName: group.fieldName,
            newValue: group.newValue,
            notes: "User-confirmed Product Parameter correction",
            selectedProductIds,
          })
          if (
            staged.selectedCount !== group.uids.length ||
            staged.skippedCount !== 0
          ) {
            throw new Error(
              `Unexpected staging result for ${group.fieldName}=${group.newValue}.`
            )
          }
        }
      }

      if (revision.status === "Pending Costing") {
        const handoff = await repository.completeBulkPriceRevision({
          bulkPriceRevisionId: revision.id,
        })
        if (handoff.status !== "Pending Customer Costing") {
          throw new Error(`Unexpected handoff status: ${handoff.status}`)
        }
      } else if (revision.status !== "Pending Customer Costing") {
        throw new Error(`Unexpected resumable status: ${revision.status}`)
      }

      const work = await repository.getProductBulkRevisionCustomerCosting(
        revision.id,
        { limit: 200 }
      )
      if (!work || work.coverage.total !== 155 || work.coverage.truncated) {
        throw new Error("Customer Costing did not return all 155 affected prices.")
      }
      for (const [index, price] of work.rows.entries()) {
        if (price.decision && price.decision !== "Revise Price") {
          throw new Error(
            `Affected price ${price.quoteItemId} has decision ${price.decision}.`
          )
        }
        if (price.decision === "Revise Price") continue
        await repository.applyProductBulkRevisionPriceDecision({
          bulkPriceRevisionId: revision.id,
          decision: "Revise Price",
          notes: "Recalculate from corrected Product Parameters",
          sourceQuoteItemId: price.quoteItemId,
        })
        if ((index + 1) % 25 === 0 || index + 1 === work.rows.length) {
          console.log(`Customer decisions: ${index + 1}/${work.rows.length}`)
        }
      }

      const completed = await repository.completeBulkPriceRevision({
        bulkPriceRevisionId: revision.id,
      })
      if (completed.status !== "Completed" || completed.revisedQuoteCount < 155) {
        throw new Error(
          `Unexpected completion: ${JSON.stringify(completed)}`
        )
      }

      const corrected = await pool.query<ProductRow>(
        `
          SELECT id, organization_id, uid, rejection_percent::text,
            extrusion_cost::text, alloy_premium::text, checking::text,
            casting::text
          FROM catalog.items
          WHERE uid = ANY($1::text[])
          ORDER BY uid
        `,
        [requestedUids]
      )
      for (const row of corrected.rows) {
        for (const [fieldName, expected] of expectedByUid.get(row.uid)!) {
          const actual = numericValue(row, fieldName)
          if (!sameNumber(actual, expected)) {
            throw new Error(
              `${row.uid} ${fieldName}: expected ${expected}, found ${actual}.`
            )
          }
        }
      }

      const reconciliation = await pool.query<{
        active_root_prices: number
        component_subtotal_profit_matches: number
        disabled_sent_triggers: number
        profit_scope_mismatches: number
        revision_status: string
        total_mismatches: number
      }>(
        `
          WITH parent_quotes AS (
            SELECT quote.id, quote.profit_percent::numeric AS profit_percent,
              quote.total_rate_inr::numeric AS total_rate_inr,
              COALESCE((quote.calculation_json ->> 'childQuoteTotal')::numeric, 0)
                AS child_total,
              COALESCE((quote.calculation_json ->> 'totalA')::numeric, 0)
                AS own_total_a,
              COALESCE((quote.calculation_json ->> 'profitB')::numeric, 0)
                AS profit_b
            FROM sales.quote_items quote
            WHERE quote.is_active
              AND EXISTS (
                SELECT 1
                FROM sales.quote_product_snapshots snapshot
                JOIN sales.quote_package_components component
                  ON component.quote_product_snapshot_id = snapshot.id
                WHERE snapshot.quote_item_id = quote.id
              )
          )
          SELECT
            (SELECT count(*) FROM sales.quote_items
              WHERE is_active AND status IN ('Sent', 'Accepted')
                AND NULLIF(btrim(customer_part_code), '') IS NOT NULL)::int
              AS active_root_prices,
            (SELECT count(*) FROM parent_quotes
              WHERE abs(profit_b - own_total_a * profit_percent) > 0.000001)::int
              AS profit_scope_mismatches,
            (SELECT count(*) FROM parent_quotes
              WHERE abs(total_rate_inr - (child_total + own_total_a + profit_b))
                > 0.000001)::int AS total_mismatches,
            (SELECT count(*) FROM parent_quotes
              WHERE child_total > 0 AND profit_percent <> 0
                AND abs(profit_b - (child_total + own_total_a) * profit_percent)
                  <= 0.000001)::int AS component_subtotal_profit_matches,
            (SELECT count(*) FROM pg_trigger
              WHERE NOT tgisinternal AND tgenabled <> 'O'
                AND tgname LIKE '%sent%immut%')::int AS disabled_sent_triggers,
            (SELECT status FROM sales.bulk_price_revisions WHERE id = $1)
              AS revision_status
        `,
        [revision.id]
      )
      const result = reconciliation.rows[0]!
      if (
        result.active_root_prices !==
          (countsBefore.rows[0] as { active_root_prices: number })
            .active_root_prices ||
        result.profit_scope_mismatches !== 0 ||
        result.total_mismatches !== 0 ||
        result.component_subtotal_profit_matches !== 0 ||
        result.disabled_sent_triggers !== 0 ||
        result.revision_status !== "Completed"
      ) {
        throw new Error(`Reconciliation failed: ${JSON.stringify(result)}`)
      }

      console.log(
        JSON.stringify(
          {
            backupPath,
            backupSha256,
            correctedProductFields: 47,
            correctedProducts: 40,
            affectedRootPrices: work.coverage.total,
            revisedQuoteRows: completed.revisedQuoteCount,
            revisionId: revision.id,
            revisionNumber: revision.revisionNumber,
            ...result,
          },
          null,
          2
        )
      )
    }
  }
} finally {
  await close()
}
