import type { PoolClient } from "pg"

import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"
import {
  activeCorrectionTargetKeys,
  dataEntryCorrectionTargetsWithWorkflowCascade,
  type CorrectionTargetRow,
} from "./dashboard-corrections"
import {
  defaultProductionFloorCode,
  productionFloorCodeForRecord,
  productionFloors,
  type ProductionFloorCode,
} from "./production-floors"

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
  entry_type: string | null
  source_kind: "correction" | "data_entry" | "physical"
  source_group: string
}

type SourceCoverage = {
  corrections: {
    limit: number
    truncated: boolean
    truncatedGroups: string[]
  }
  dataEntries: {
    limit: number
    truncated: boolean
    truncatedGroups: string[]
  }
  physicalRows: {
    limit: number
    truncated: boolean
    truncatedGroups: string[]
  }
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
  sourceCoverage: SourceCoverage
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

const dataEntrySourceBudgets: Record<string, number> = {
  cycle: 2500,
  employee: 1000,
  first_piece_inspection_report: 2500,
  hourly_quality_check: 5000,
  machine_master: 1000,
  maintenance_checklist_master: 2000,
  maintenance_master: 1000,
  maintenance_schedule: 2500,
  maintenance_task: 5000,
  planning_holiday: 1000,
  production_card: 5000,
  quality_parameter_master: 2000,
  rejection_reason_master: 500,
  rejection_remark_master: 500,
  rejection_type_master: 500,
  rm_inward: 2000,
  route: 2500,
  setup_checklist_master: 2000,
  setup_checklist_session: 5000,
  shop_floor_status: 5000,
  tooling: 2500,
  work_order: 5000,
}

const physicalSourceBudgets: Record<string, number> = {
  attendanceRecords: 5000,
  dispatchApprovals: 2000,
  machineConstraints: 2000,
  planOverrides: 2000,
  plannerPriorities: 2000,
  productionEntries: 10000,
  routeChanges: 2000,
  routeSelections: 2500,
  setupCompletions: 5000,
  trainingRecords: 2500,
}

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

function applySourceBudgets(
  rows: GroupedSourceRow[],
  groupFor: (row: GroupedSourceRow) => string,
  budgets: Record<string, number>
) {
  const grouped = new Map<string, GroupedSourceRow[]>()
  for (const row of rows) {
    const group = groupFor(row)
    const groupRows = grouped.get(group)
    if (groupRows) groupRows.push(row)
    else grouped.set(group, [row])
  }
  const kept: GroupedSourceRow[] = []
  const truncatedGroups: string[] = []
  for (const [group, limit] of Object.entries(budgets)) {
    const groupRows = grouped.get(group) ?? []
    if (groupRows.length > limit) truncatedGroups.push(group)
    kept.push(...groupRows.slice(-limit))
  }
  kept.sort((left, right) => {
    const time = timestamp(left.changed_at).localeCompare(
      timestamp(right.changed_at)
    )
    return time || left.source_id.localeCompare(right.source_id)
  })
  return { rows: kept, truncatedGroups }
}

function floorRows(rows: JsonRecord[], floorCode: ProductionFloorCode) {
  return rows.filter((row) => productionFloorCodeForRecord(row) === floorCode)
}

function jsonRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function jsonRows(value: unknown) {
  return Array.isArray(value) ? value.map(jsonRecord) : []
}

export async function readCanonicalDashboardSource(
  client: DashboardQueryClient,
  organizationId: string
): Promise<CanonicalDashboardSource> {
  const result = await client.query<GroupedSourceRow>(
    `
      WITH data_entries AS (
        SELECT source.source_id, source.source_payload, source.changed_at,
          source.source_kind, source.source_group, source.entry_type
        FROM jsonb_each_text($2::jsonb) budget
        CROSS JOIN LATERAL (
          SELECT source_id, source_payload, changed_at, source_kind,
            source_group, entry_type
          FROM derived.dashboard_source_records
          WHERE organization_id = $1 AND source_kind = 'data_entry'
            AND entry_type = budget.key
          ORDER BY changed_at DESC, source_id DESC
          LIMIT budget.value::integer + 1
        ) source
      ), physical_rows AS (
        SELECT source.source_id, source.source_payload, source.changed_at,
          source.source_kind, source.source_group, source.entry_type
        FROM jsonb_each_text($3::jsonb) budget
        CROSS JOIN LATERAL (
          SELECT source_id, source_payload, changed_at, source_kind,
            source_group, entry_type
          FROM derived.dashboard_source_records
          WHERE organization_id = $1 AND source_kind = 'physical'
            AND source_group = budget.key
          ORDER BY changed_at DESC, source_id DESC
          LIMIT budget.value::integer + 1
        ) source
      ), correction_rows AS (
        SELECT source_id, source_payload, changed_at, source_kind,
          source_group, entry_type
        FROM derived.dashboard_source_records
        WHERE organization_id = $1 AND source_kind = 'correction'
        ORDER BY changed_at DESC, source_id DESC
        LIMIT 5001
      )
      SELECT * FROM data_entries
      UNION ALL SELECT * FROM physical_rows
      UNION ALL SELECT * FROM correction_rows
    `,
    [organizationId, dataEntrySourceBudgets, physicalSourceBudgets]
  )

  const byKind = <Kind extends GroupedSourceRow["source_kind"]>(kind: Kind) =>
    result.rows
      .filter((row) => row.source_kind === kind)
      .sort((left, right) => {
        const time = timestamp(left.changed_at).localeCompare(
          timestamp(right.changed_at)
        )
        return time || left.source_id.localeCompare(right.source_id)
      })
  const boundedDataEntries = applySourceBudgets(
    byKind("data_entry"),
    (row) => row.entry_type ?? "",
    dataEntrySourceBudgets
  )
  const boundedPhysicalRows = applySourceBudgets(
    byKind("physical"),
    (row) => row.source_group,
    physicalSourceBudgets
  )
  const dataEntryRows = boundedDataEntries.rows
  const physicalRows = boundedPhysicalRows.rows
  const correctionRows = byKind("correction")
  const sourceCoverage: SourceCoverage = {
    corrections: {
      limit: 5000,
      truncated: correctionRows.length > 5000,
      truncatedGroups: correctionRows.length > 5000 ? ["corrections"] : [],
    },
    dataEntries: {
      limit: Object.values(dataEntrySourceBudgets).reduce(
        (total, limit) => total + limit,
        0
      ),
      truncated: boundedDataEntries.truncatedGroups.length > 0,
      truncatedGroups: boundedDataEntries.truncatedGroups,
    },
    physicalRows: {
      limit: Object.values(physicalSourceBudgets).reduce(
        (total, limit) => total + limit,
        0
      ),
      truncated: boundedPhysicalRows.truncatedGroups.length > 0,
      truncatedGroups: boundedPhysicalRows.truncatedGroups,
    },
  }
  correctionRows.splice(0, Math.max(0, correctionRows.length - 5000))

  const grouped = new Map<string, JsonRecord[]>()
  for (const row of physicalRows) {
    const rows = grouped.get(row.source_group) ?? []
    rows.push(sourceRecord(row))
    grouped.set(row.source_group, rows)
  }

  const group = (name: string) => grouped.get(name) ?? []
  return {
    allDataEntries: dataEntryRows
      .map((row) =>
        dataEntryRecord({
          ...row,
          inferred_entry_type: row.entry_type ?? "",
        })
      )
      .filter(
        (row) =>
          typeof row.entryType === "string" &&
          snapshotEntryTypes.has(row.entryType)
      ),
    attendanceRecords: group("attendanceRecords"),
    corrections: correctionRows.map(sourceRecord),
    dispatchApprovals: group("dispatchApprovals"),
    machineConstraints: group("machineConstraints"),
    planOverrides: group("planOverrides"),
    plannerPriorities: group("plannerPriorities"),
    productionEntries: group("productionEntries"),
    routeChanges: group("routeChanges"),
    routeSelections: group("routeSelections"),
    setupCompletions: group("setupCompletions"),
    sourceCoverage,
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

  const previousModel = await client.query<{ payload: unknown }>(
    `
      SELECT payload
      FROM derived.dashboard_read_models
      WHERE organization_id = $1
      ORDER BY version DESC
      LIMIT 1
    `,
    [context.organizationId]
  )
  const previousPayload = jsonRecord(previousModel.rows[0]?.payload)
  const previousFloorSnapshots = jsonRecord(
    previousPayload.productionFloorSnapshots
  )

  function previousMachinePlanRows(floorCode: ProductionFloorCode) {
    const floorPayload =
      floorCode === defaultProductionFloorCode
        ? jsonRecord(previousFloorSnapshots[floorCode] ?? previousPayload)
        : jsonRecord(previousFloorSnapshots[floorCode])
    return jsonRows(
      jsonRecord(floorPayload.productionControl).machinePlanDetailRows
    ).map((row) => ({
      jcNo: row.jcNo,
      machine: row.machine,
      optionNumber: row.optionNumber,
      partCode: row.partCode,
      routeMachine: row.routeMachine,
      setupNo: row.setupNo,
    }))
  }

  function buildFloorPayload(floorCode: ProductionFloorCode) {
    const floorDataEntries = floorRows(dataEntries, floorCode)
    const floorCorrections = floorRows(source.corrections, floorCode)
    const floorUpdatedAt = latestCreatedAt(
      floorRows(source.productionEntries, floorCode),
      floorRows(source.attendanceRecords, floorCode),
      floorRows(source.trainingRecords, floorCode),
      floorRows(source.routeSelections, floorCode),
      floorRows(source.plannerPriorities, floorCode),
      floorRows(source.machineConstraints, floorCode),
      floorRows(source.planOverrides, floorCode),
      floorRows(source.routeChanges, floorCode),
      floorRows(source.dispatchApprovals, floorCode),
      floorRows(source.setupCompletions, floorCode),
      floorDataEntries,
      floorCorrections
    )
    const snapshot = buildLegacyDashboardSnapshot({
      attendanceRecords: floorRows(
        corrected(source.attendanceRecords, "attendanceRecords"),
        floorCode
      ) as never,
      dataEntries: floorDataEntries as never,
      dispatchApprovals: floorRows(
        corrected(source.dispatchApprovals, "dispatchApprovals"),
        floorCode
      ),
      filters: {},
      machineConstraints: floorRows(
        corrected(source.machineConstraints, "machineConstraints"),
        floorCode
      ),
      planOverrides: floorRows(
        corrected(source.planOverrides, "planOverrides"),
        floorCode
      ),
      plannerPriorities: floorRows(
        corrected(source.plannerPriorities, "plannerPriorities"),
        floorCode
      ),
      previousMachinePlanDetailRows: previousMachinePlanRows(floorCode),
      productionEntries: floorRows(
        corrected(source.productionEntries, "productionEntries"),
        floorCode
      ) as never,
      routeChanges: floorRows(
        corrected(source.routeChanges, "routeChanges"),
        floorCode
      ),
      routeSelections: floorRows(
        corrected(source.routeSelections, "routeSelections"),
        floorCode
      ),
      setupCompletions: floorRows(
        corrected(source.setupCompletions, "setupCompletions"),
        floorCode
      ),
      trainingRecords: floorRows(
        corrected(source.trainingRecords, "trainingRecords"),
        floorCode
      ) as never,
      updatedAt: floorUpdatedAt,
      workbookName: "PostgreSQL",
    })
    const liveCounts = countRowsByEntryType(floorDataEntries)
    return {
      ...snapshot,
      cacheStatus: "ready",
      productionFloorCode: floorCode,
      sourceCoverage: source.sourceCoverage,
      dataEntry: {
        ...snapshot.dataEntry,
        corrections: floorCorrections,
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
    } as JsonRecord
  }

  const productionFloorSnapshots = Object.fromEntries(
    productionFloors.map((floor) => [floor.code, buildFloorPayload(floor.code)])
  )
  const defaultSnapshot = productionFloorSnapshots[
    defaultProductionFloorCode
  ] as JsonRecord
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

  return {
    payload: {
      ...defaultSnapshot,
      productionFloorSnapshots,
      productionFloors,
    } as JsonRecord,
    sourceWatermark: {
      changedAt: updatedAt || null,
      sourceCoverage: source.sourceCoverage,
    },
  }
}
