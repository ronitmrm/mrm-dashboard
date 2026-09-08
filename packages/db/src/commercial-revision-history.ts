import type { Pool } from "pg"

type Origin = "product" | "customer"
const safePage = (page: number) =>
  Number.isSafeInteger(page) && page > 0 && page <= 1_000_000 ? page : 1
const routes = {
  product: ["Product Parameter Bulk Revision"],
  customer: [
    "Customer Parameter Bulk Revision",
    "Customer Parameter Costing Only",
    "Bulk Revision",
  ],
}
type Revision = {
  id: string
  revisionNumber: string
  reason: string
  effectiveOn: string
  completedAt: string
  companyName: string | null
  requestedChangeCount: number
  revisedPriceCount: number
}

// Historical reads never fall back to today's mutable Product parameter values.
const evidenceFrom = `
  FROM sales.bulk_price_revision_changes change
  LEFT JOIN sales.quote_items prior ON prior.id = change.prior_quote_item_id
  LEFT JOIN sales.quote_product_snapshots snapshot ON snapshot.quote_item_id = prior.id
  LEFT JOIN catalog.items item ON item.id = COALESCE(
    NULLIF(change.source_payload ->> 'productItemId', '')::uuid, prior.item_id)
  LEFT JOIN sales.customers customer ON customer.id = prior.customer_id
  LEFT JOIN sales.quote_items replacement ON replacement.id = change.replacement_quote_item_id
  WHERE change.bulk_price_revision_id = $1`

const oldParameterSql = `COALESCE(change.preview_json ->> 'oldParameterValue',
  CASE WHEN change.field_name IN ('scrap_rate', 'packing_cost', 'shipping_cost', 'purchase_times', 'profit_percent', 'conversion_rate')
    THEN to_jsonb(prior) ->> change.field_name
    WHEN snapshot.item_uid = item.uid THEN snapshot.product_snapshot ->> (
      CASE change.field_name
        WHEN 'ext_cost' THEN 'extrusionCost'
        WHEN 'rejection_percent' THEN 'rejectionPercent'
        WHEN 'alloy_premium' THEN 'alloyPremium'
        WHEN 'assembly_operation_cost' THEN 'assemblyOperationCost'
        WHEN 'machining_cost' THEN 'machiningCost'
        WHEN 'forging_cost' THEN 'forgingCost'
        WHEN 'overhead_cost' THEN 'overheadCost'
        ELSE change.field_name END)
  END)`

export function bulkRevisionHistoryReader(pool: Pick<Pool, "query">) {
  async function revisions(
    organizationCode: string,
    origin: Origin,
    id: string | null,
    page: number
  ) {
    const result = await pool.query<Revision & { total: string }>(
      `SELECT revision.id, revision.revision_number AS "revisionNumber", revision.reason,
        revision.effective_on::text AS "effectiveOn", revision.completed_at::text AS "completedAt",
        customer.company_name AS "companyName",
        (SELECT count(DISTINCT change.stage_group_id)::integer
          FROM sales.bulk_price_revision_changes change WHERE change.bulk_price_revision_id = revision.id
          AND change.field_name NOT IN ('customer_price_decision', 'derived_parent_refresh')) AS "requestedChangeCount",
        (SELECT count(DISTINCT change.replacement_quote_item_id)::integer
          FROM sales.bulk_price_revision_changes change WHERE change.bulk_price_revision_id = revision.id) AS "revisedPriceCount",
        count(*) OVER()::text AS total
       FROM sales.bulk_price_revisions revision
       JOIN core.organizations org ON org.id = revision.organization_id
       LEFT JOIN sales.customers customer ON customer.id = revision.customer_id
       WHERE lower(org.code) = lower($1) AND revision.status = 'Completed'
         AND revision.revision_route = ANY($2::text[]) AND ($3::uuid IS NULL OR revision.id = $3)
       ORDER BY revision.completed_at DESC NULLS LAST, revision.id DESC LIMIT 50 OFFSET $4`,
      [organizationCode, routes[origin], id, (page - 1) * 50]
    )
    return {
      rows: result.rows,
      total: Number(result.rows[0]?.total ?? 0),
      page,
    }
  }
  return {
    listCompletedBulkRevisionHistory(
      organizationCode: string,
      origin: Origin,
      page = 1
    ) {
      return revisions(organizationCode, origin, null, safePage(page))
    },
    async getCompletedBulkRevisionHistory(
      organizationCode: string,
      origin: Origin,
      id: string,
      options: { page?: number; query?: string } = {}
    ) {
      const revision = (await revisions(organizationCode, origin, id, 1))
        .rows[0]
      if (!revision) return null
      const page = safePage(options.page ?? 1)
      const groups = await pool.query<{
        id: string
        fieldName: string
        fieldLabel: string
        newValue: string
        selectedCount: number
        skippedCount: number
        oldValues: Array<string | null>
        notes: string | null
      }>(
        `SELECT change.stage_group_id AS id, change.field_name AS "fieldName", change.field_label AS "fieldLabel",
          change.new_value::text AS "newValue", max(change.selected_count)::integer AS "selectedCount",
          max(change.skipped_count)::integer AS "skippedCount", max(change.notes) AS notes,
          array_agg(DISTINCT ${oldParameterSql}) AS "oldValues"
          ${evidenceFrom}
          AND change.field_name NOT IN ('customer_price_decision', 'derived_parent_refresh')
          GROUP BY change.stage_group_id, change.field_name, change.field_label, change.new_value
          ORDER BY min(change.created_at), change.stage_group_id`,
        [id]
      )
      const changes = await pool.query<{
        id: string
        uid: string | null
        companyName: string | null
        customerPartCode: string | null
        fieldName: string
        fieldLabel: string
        oldParameterValue: string | null
        newValue: string
        decision: string | null
        previousPrice: string | null
        publishedPrice: string | null
        total: string
      }>(
        `SELECT change.id, COALESCE(change.preview_json ->> 'productUid', item.uid, snapshot.item_uid) AS uid,
          customer.company_name AS "companyName", prior.customer_part_code AS "customerPartCode",
          change.field_name AS "fieldName", change.field_label AS "fieldLabel",
          ${oldParameterSql} AS "oldParameterValue", change.new_value::text AS "newValue",
          change.source_payload ->> 'customerDecision' AS decision,
          prior.approved_price_usd::text AS "previousPrice", replacement.approved_price_usd::text AS "publishedPrice",
          count(*) OVER()::text AS total
          ${evidenceFrom}
          AND ($2 = '' OR strpos(lower(concat_ws(' ', item.uid, prior.customer_part_code, customer.company_name, change.field_label)), lower($2)) > 0)
          ORDER BY change.created_at, change.stage_group_id, change.id LIMIT 100 OFFSET $3`,
        [id, options.query?.trim() ?? "", (page - 1) * 100]
      )
      return {
        revision,
        stages: groups.rows,
        changes: {
          rows: changes.rows,
          total: Number(changes.rows[0]?.total ?? 0),
          page,
        },
      }
    },
  }
}
