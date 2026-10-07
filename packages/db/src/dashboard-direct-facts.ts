import { createHash } from "node:crypto"
import type { PoolClient } from "pg"
import {
  activeCorrectionTargetKeys,
  dataEntryCorrectionTargetsWithWorkflowCascade,
  type CorrectionTargetRow,
} from "./dashboard-corrections"
import {
  companyWideMasterEntryTypes,
  dataEntryRecord,
  sourceRecord,
} from "./dashboard-read-model"
import { directDashboardControlRows } from "./legacy-dashboard-analysis"
import type { ProductionFloorCode } from "./production-floors"

type QueryClient = Pick<PoolClient, "query">
type JsonRecord = Record<string, unknown>
const companyEntries = [...companyWideMasterEntryTypes]

export const dashboardLiveFactEntryTypes = [
  "setup_checklist_session",
  "first_piece_inspection_report",
  "hourly_quality_check",
] as const

export async function readDashboardSourceRevision(
  client: QueryClient,
  organizationId: string,
  floor: ProductionFloorCode,
  dependencies: readonly string[],
  identity: unknown = null
) {
  const result = await client.query<{
    production_floor_code: string
    source_key: string
    revision: string
  }>(
    `SELECT production_floor_code, source_key, revision::text
     FROM derived.dashboard_source_revisions
     WHERE organization_id = $1 AND source_key = ANY($3::text[])
       AND (production_floor_code IN ($2, '*') OR source_key = 'corrections')
     ORDER BY production_floor_code, source_key`,
    [
      organizationId,
      floor,
      [...new Set([...dependencies, "corrections"])].sort(),
    ]
  )
  return createHash("sha256")
    .update(
      JSON.stringify({
      format: "direct-facts-2",
        floor,
        dependencies: [...dependencies].sort(),
        identity,
        revisions: result.rows,
      })
    )
    .digest("hex")
}

export async function readDirectDashboardFacts(
  client: QueryClient,
  organizationId: string,
  floor: ProductionFloorCode,
  entryTypes: readonly string[]
) {
  const workflow = entryTypes.some((type) =>
    dashboardLiveFactEntryTypes.includes(
      type as (typeof dashboardLiveFactEntryTypes)[number]
    )
  )
  const selectedTypes = [
    ...new Set([
      ...entryTypes,
      ...(workflow
        ? ["shop_floor_status", "first_piece_inspection_report"]
        : []),
    ]),
  ]
  const result = await client.query<{
    source_id: string
    source_payload: JsonRecord
    changed_at: Date
    production_floor_code: ProductionFloorCode
    entry_type: string
    source_kind: string
  }>(
    `SELECT source.source_id, source.changed_at, source.production_floor_code,
       source.entry_type, source.source_kind,
       source.source_payload || COALESCE(jsonb_strip_nulls(jsonb_build_object(
         'jobCard', COALESCE(session.job_card_number_snapshot, work_order.job_card_number),
         'partCode', COALESCE(session.part_code_snapshot, item.uid),
         'optionNumber', COALESCE(session.option_number_snapshot, route.route_code),
         'setupNo', COALESCE(session.setup_number_snapshot, setup.setup_number::text),
         'machine', session.machine_number_snapshot, 'quantityGood', production.quantity_good
       )), '{}'::jsonb) AS source_payload
     FROM derived.dashboard_source_records source
     LEFT JOIN manufacturing.production_entries production
       ON source.source_kind = 'physical' AND source.source_group = 'productionEntries'
       AND production.organization_id = source.organization_id AND production.source_id = source.source_id
       AND production.reversed_at IS NULL
     LEFT JOIN manufacturing.production_sessions session
       ON source.source_kind = 'physical' AND session.organization_id = source.organization_id
       AND session.id::text = source.source_id AND session.production_entry_id IS NOT NULL
       AND session.reversed_at IS NULL
     LEFT JOIN manufacturing.work_orders work_order ON work_order.id = production.work_order_id
     LEFT JOIN catalog.items item ON item.id = work_order.item_id
     LEFT JOIN manufacturing.operation_setups setup ON setup.id = production.operation_setup_id
     LEFT JOIN manufacturing.route_options route ON route.id = COALESCE(setup.route_option_id, production.route_option_id)
     WHERE source.organization_id = $1 AND (
       (source.source_kind = 'data_entry' AND source.entry_type = ANY($3::text[])
         AND (source.production_floor_code = $2 OR source.entry_type = ANY($4::text[])))
       OR source.source_kind = 'correction'
       OR ($5 AND source.source_kind = 'physical' AND source.source_group = 'productionEntries'
         AND source.production_floor_code = $2))
     ORDER BY source.changed_at, source.source_id`,
    [
      organizationId,
      floor,
      selectedTypes,
      companyEntries,
      entryTypes.includes("software_raw"),
    ]
  )
  const entries = result.rows
    .filter((row) => row.source_kind === "data_entry")
    .map((row) =>
      dataEntryRecord({ ...row, inferred_entry_type: row.entry_type })
    )
  const corrections: CorrectionTargetRow[] = result.rows
    .filter((row) => row.source_kind === "correction")
    .map(sourceRecord)
    .map((row) => ({
      targetTable: String(row.targetTable ?? ""),
      targetId: String(row.targetId ?? ""),
      action: String(row.action ?? ""),
      createdAt: row.createdAt,
    }))
  const targets = dataEntryCorrectionTargetsWithWorkflowCascade(
    entries,
    activeCorrectionTargetKeys(corrections),
    corrections
  )
  const active = entries.filter(
    (row) =>
      entryTypes.includes(row.entryType) &&
      !targets.has(`dataEntries:${String(row._id)}`)
  )
  const production = result.rows
    .filter((row) => row.source_kind === "physical")
    .map(sourceRecord)
    .filter((row) => !targets.has(`productionEntries:${String(row._id)}`))
  const control = directDashboardControlRows(active, production)
  // Workspaces already consume normalized control tables. Raw entry envelopes
  // alongside them create duplicate blank display rows with different keys.
  return { dataEntry: { rows: [], entryTypes }, productionControl: control }
}

export async function readToolingAssetCodes(
  client: QueryClient,
  organizationId: string
) {
  const result = await client.query<{ type_code: string }>(
    "SELECT type_code FROM store.item_types WHERE organization_id = $1 AND active ORDER BY type_code",
    [organizationId]
  )
  return result.rows.map((row) => row.type_code)
}
