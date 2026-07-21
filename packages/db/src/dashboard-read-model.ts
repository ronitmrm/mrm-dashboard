import type { PoolClient } from "pg"

import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"
import {
  activeCorrectionTargetKeys,
  dataEntryCorrectionTargetsWithWorkflowCascade,
  type CorrectionTargetRow,
} from "./dashboard-corrections"

type JsonRecord = Record<string, unknown>
type DashboardQueryClient = Pick<PoolClient, "query">

type SourceRow = {
  changed_at: Date | string
  source_id: string
  source_payload: JsonRecord
}

type DataEntrySourceRow = SourceRow & {
  inferred_entry_type: string
}

type GroupedSourceRow = SourceRow & {
  source_group: string
}

export type CanonicalDashboardSource = {
  allDataEntries: JsonRecord[]
  attendanceRecords: JsonRecord[]
  corrections: JsonRecord[]
  dispatchApprovals: JsonRecord[]
  machineConstraints: JsonRecord[]
  planOverrides: JsonRecord[]
  plannerPriorities: JsonRecord[]
  productionEntries: JsonRecord[]
  routeChanges: JsonRecord[]
  routeSelections: JsonRecord[]
  setupCompletions: JsonRecord[]
  trainingRecords: JsonRecord[]
}

const legacyEntryTypes = [
  "machine_master",
  "dispatch",
  "rejection_classification",
  "raw_material_plan",
  "machine_planning",
  "quality_inspection",
  "route",
  "cycle",
  "tooling",
  "work_order",
  "rm_inward",
  "employee",
  "planning_holiday",
  "first_piece_inspection_master",
  "first_piece_inspection_report",
  "setup_checklist_master",
  "setup_checklist_session",
  "production_card",
  "quality_parameter_master",
  "rejection_type_master",
  "rejection_reason_master",
  "rejection_remark_master",
  "hourly_quality_check",
  "maintenance_master",
  "maintenance_checklist_master",
  "maintenance_schedule",
  "maintenance_task",
] as const

const snapshotEntryTypes = new Set([...legacyEntryTypes, "shop_floor_status"])

function timestamp(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value
}

function sourceRecord(
  row: SourceRow
): JsonRecord & { _id: unknown; createdAt: string } {
  return {
    ...row.source_payload,
    _id: row.source_payload._id ?? row.source_id,
    createdAt:
      typeof row.source_payload.createdAt === "string"
        ? row.source_payload.createdAt
        : timestamp(row.changed_at),
  }
}

function dataEntryRecord(row: DataEntrySourceRow): JsonRecord & {
  _id: unknown
  createdAt: string
  entryType: string
  payload: unknown
} {
  const source = sourceRecord(row)
  if (typeof source.entryType === "string" && "payload" in source) {
    return {
      ...source,
      entryType: source.entryType,
      payload: source.payload,
    }
  }
  return {
    _id: source._id,
    createdAt: source.createdAt,
    entryType: row.inferred_entry_type,
    key:
      typeof source.key === "string" && source.key ? source.key : row.source_id,
    payload: row.source_payload,
  }
}

function withoutCorrectedRows<Row extends { _id: unknown }>(
  rows: Row[],
  targetTable: string,
  correctionTargets: Set<string>
) {
  return rows.filter(
    (row) => !correctionTargets.has(`${targetTable}:${String(row._id)}`)
  )
}

function latestCreatedAt(...groups: JsonRecord[][]) {
  return groups.flat().reduce((latest, row) => {
    const createdAt = typeof row.createdAt === "string" ? row.createdAt : ""
    return createdAt > latest ? createdAt : latest
  }, "")
}

function countRowsByEntryType(rows: JsonRecord[]) {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    if (typeof row.entryType !== "string") continue
    counts[row.entryType] = (counts[row.entryType] ?? 0) + 1
  }
  return counts
}

export async function readCanonicalDashboardSource(
  client: DashboardQueryClient,
  organizationId: string
): Promise<CanonicalDashboardSource> {
  const dataEntries = await client.query<DataEntrySourceRow>(
    `
      SELECT * FROM (
        SELECT source_id, source_payload, updated_at AS changed_at,
          'machine_master' AS inferred_entry_type
        FROM catalog.machines
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, updated_at, 'route'
        FROM manufacturing.operation_setups
        WHERE organization_id = $1 AND source_table = 'dataEntries'
          AND source_payload IS NOT NULL
        UNION ALL
        SELECT source_id, source_payload, updated_at, 'cycle'
        FROM manufacturing.operation_cycle_standards
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, updated_at, 'tooling'
        FROM manufacturing.operation_tooling
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, updated_at, 'work_order'
        FROM manufacturing.work_orders
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, updated_at, 'rm_inward'
        FROM manufacturing.raw_material_receipts
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, updated_at, 'employee'
        FROM workforce.employees
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, updated_at, 'planning_holiday'
        FROM manufacturing.planning_calendar_exceptions
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, updated_at,
          'quality_parameter_master'
        FROM quality.parameter_definitions
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, updated_at, 'rejection_type_master'
        FROM quality.rejection_types
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, updated_at, 'rejection_reason_master'
        FROM quality.rejection_reasons
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, updated_at, 'rejection_remark_master'
        FROM quality.rejection_remarks
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, inspected_at,
          'first_piece_inspection_report'
        FROM quality.first_piece_inspections
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, checked_at, 'hourly_quality_check'
        FROM quality.hourly_checks
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, updated_at, 'setup_checklist_master'
        FROM quality.setup_checklist_template_items
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, COALESCE(completed_at, started_at),
          'setup_checklist_session'
        FROM quality.setup_checklist_sessions
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, updated_at, 'production_card'
        FROM manufacturing.production_cards
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, updated_at, 'maintenance_master'
        FROM maintenance.definitions
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND source_table = 'dataEntries'
        UNION ALL
        SELECT source_id, source_payload, updated_at,
          'maintenance_checklist_master'
        FROM maintenance.checklist_items
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, updated_at, 'maintenance_schedule'
        FROM maintenance.machine_schedules
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, updated_at, 'maintenance_task'
        FROM maintenance.tasks
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
        UNION ALL
        SELECT source_id, source_payload, occurred_at, 'shop_floor_status'
        FROM manufacturing.shop_floor_stage_events
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
      ) entries
      ORDER BY changed_at, source_id
      LIMIT 25000
    `,
    [organizationId]
  )

  const physicalRows = await client.query<GroupedSourceRow>(
    `
      SELECT * FROM (
        SELECT source_id, source_payload, recorded_at AS changed_at,
          'productionEntries' AS source_group
        FROM manufacturing.production_entries
        WHERE organization_id = $1 AND source_payload IS NOT NULL
          AND reversed_at IS NULL
        UNION ALL
        SELECT source_id, source_payload, recorded_at, 'attendanceRecords'
        FROM workforce.attendance_records
        WHERE organization_id = $1 AND source_payload IS NOT NULL
        UNION ALL
        SELECT source_id, source_payload, recorded_at, 'trainingRecords'
        FROM workforce.training_records
        WHERE organization_id = $1 AND source_payload IS NOT NULL
        UNION ALL
        SELECT source_id, source_payload, selected_at, 'routeSelections'
        FROM manufacturing.route_selections
        WHERE organization_id = $1 AND source_payload IS NOT NULL
        UNION ALL
        SELECT source_id, source_payload, occurred_at, 'plannerPriorities'
        FROM manufacturing.planner_priority_events
        WHERE organization_id = $1 AND source_payload IS NOT NULL
        UNION ALL
        SELECT source_id, source_payload, occurred_at, 'machineConstraints'
        FROM manufacturing.machine_constraint_events
        WHERE organization_id = $1 AND source_payload IS NOT NULL
        UNION ALL
        SELECT source_id, source_payload, occurred_at, 'planOverrides'
        FROM manufacturing.plan_override_events
        WHERE organization_id = $1 AND source_payload IS NOT NULL
        UNION ALL
        SELECT source_id, source_payload, occurred_at, 'routeChanges'
        FROM manufacturing.route_change_events
        WHERE organization_id = $1 AND source_payload IS NOT NULL
        UNION ALL
        SELECT source_id, source_payload, occurred_at, 'dispatchApprovals'
        FROM manufacturing.dispatch_approval_events
        WHERE organization_id = $1 AND source_payload IS NOT NULL
        UNION ALL
        SELECT source_id, source_payload, completed_at, 'setupCompletions'
        FROM manufacturing.setup_completion_events
        WHERE organization_id = $1 AND source_payload IS NOT NULL
      ) source_rows
      ORDER BY changed_at, source_id
      LIMIT 10000
    `,
    [organizationId]
  )

  const correctionRows = await client.query<SourceRow>(
    `
      SELECT source_id, source_payload,
        COALESCE(original_timestamp, imported_at) AS changed_at
      FROM audit.legacy_convex_corrections
      WHERE organization_id = $1
      ORDER BY changed_at, source_id
      LIMIT 5000
    `,
    [organizationId]
  )

  const grouped = new Map<string, JsonRecord[]>()
  for (const row of physicalRows.rows) {
    const rows = grouped.get(row.source_group) ?? []
    rows.push(sourceRecord(row))
    grouped.set(row.source_group, rows)
  }

  const group = (name: string) => grouped.get(name) ?? []
  return {
    allDataEntries: dataEntries.rows
      .map(dataEntryRecord)
      .filter(
        (row) =>
          typeof row.entryType === "string" &&
          snapshotEntryTypes.has(row.entryType)
      ),
    attendanceRecords: group("attendanceRecords"),
    corrections: correctionRows.rows.map(sourceRecord),
    dispatchApprovals: group("dispatchApprovals"),
    machineConstraints: group("machineConstraints"),
    planOverrides: group("planOverrides"),
    plannerPriorities: group("plannerPriorities"),
    productionEntries: group("productionEntries"),
    routeChanges: group("routeChanges"),
    routeSelections: group("routeSelections"),
    setupCompletions: group("setupCompletions"),
    trainingRecords: group("trainingRecords"),
  }
}

export async function buildCanonicalDashboardReadModel(
  client: DashboardQueryClient,
  context: { organizationId: string }
) {
  const source = await readCanonicalDashboardSource(
    client,
    context.organizationId
  )
  const correctionTargets = dataEntryCorrectionTargetsWithWorkflowCascade(
    source.allDataEntries as never,
    activeCorrectionTargetKeys(source.corrections as CorrectionTargetRow[]),
    source.corrections as CorrectionTargetRow[]
  )
  const dataEntries = withoutCorrectedRows(
    source.allDataEntries as Array<JsonRecord & { _id: unknown }>,
    "dataEntries",
    correctionTargets
  )
  const corrected = <Row extends JsonRecord & { _id: unknown }>(
    rows: JsonRecord[],
    table: string
  ) => withoutCorrectedRows(rows as Row[], table, correctionTargets)

  const updatedAt = latestCreatedAt(
    source.productionEntries,
    source.attendanceRecords,
    source.trainingRecords,
    source.routeSelections,
    source.plannerPriorities,
    source.machineConstraints,
    source.planOverrides,
    source.routeChanges,
    source.dispatchApprovals,
    source.setupCompletions,
    dataEntries,
    source.corrections
  )
  const previousModel = await client.query<{ machine_plan_rows: unknown }>(
    `
      SELECT payload->'productionControl'->'machinePlanDetailRows'
        AS machine_plan_rows
      FROM derived.dashboard_read_models
      WHERE organization_id = $1
      ORDER BY version DESC
      LIMIT 1
    `,
    [context.organizationId]
  )
  const previousMachinePlanDetailRows = Array.isArray(
    previousModel.rows[0]?.machine_plan_rows
  )
    ? previousModel.rows[0].machine_plan_rows.map((value) => {
        const row =
          typeof value === "object" && value !== null && !Array.isArray(value)
            ? (value as JsonRecord)
            : {}
        return {
          jcNo: row.jcNo,
          machine: row.machine,
          optionNumber: row.optionNumber,
          partCode: row.partCode,
          routeMachine: row.routeMachine,
          setupNo: row.setupNo,
        }
      })
    : []
  const snapshot = buildLegacyDashboardSnapshot({
    attendanceRecords: corrected(
      source.attendanceRecords,
      "attendanceRecords"
    ) as never,
    dataEntries: dataEntries as never,
    dispatchApprovals: corrected(source.dispatchApprovals, "dispatchApprovals"),
    filters: {},
    machineConstraints: corrected(
      source.machineConstraints,
      "machineConstraints"
    ),
    planOverrides: corrected(source.planOverrides, "planOverrides"),
    plannerPriorities: corrected(source.plannerPriorities, "plannerPriorities"),
    previousMachinePlanDetailRows,
    productionEntries: corrected(
      source.productionEntries,
      "productionEntries"
    ) as never,
    routeChanges: corrected(source.routeChanges, "routeChanges"),
    routeSelections: corrected(source.routeSelections, "routeSelections"),
    setupCompletions: corrected(source.setupCompletions, "setupCompletions"),
    trainingRecords: corrected(
      source.trainingRecords,
      "trainingRecords"
    ) as never,
    updatedAt,
    workbookName: "PostgreSQL",
  })
  const liveCounts = countRowsByEntryType(dataEntries)

  return {
    payload: {
      ...snapshot,
      cacheStatus: "ready",
      dataEntry: {
        ...snapshot.dataEntry,
        corrections: source.corrections,
        entryTypes: legacyEntryTypes,
        keySummary: legacyEntryTypes.map((entryType) => ({
          entryType,
          rows: liveCounts[entryType] ?? 0,
        })),
        templates: legacyEntryTypes.map((entryType) => ({
          entryType,
          format: "xlsx",
        })),
      },
    } as JsonRecord,
    sourceWatermark: { changedAt: updatedAt || null },
  }
}
