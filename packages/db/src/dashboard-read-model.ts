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
import type {
  CoverageFacts,
  GroupedSourceCoverage,
  SourceCoverage,
  SourceCoverageByFloor,
} from "./dashboard-coverage"

type JsonRecord = Record<string, unknown>
type DashboardQueryClient = Pick<PoolClient, "query">

type SourceRow = {
  changed_at: Date | string
  production_floor_code?: ProductionFloorCode
  source_id: string
  source_payload: JsonRecord
}

type DataEntrySourceRow = SourceRow & {
  inferred_entry_type: string
}

type GroupedSourceRow = SourceRow & {
  available: number
  entry_type: string | null
  production_floor_code: ProductionFloorCode
  source_kind: "correction" | "data_entry" | "physical"
  source_group: string
}

type PreviousMachinePlanRow = {
  machine_plan_row: JsonRecord
  production_floor_code: ProductionFloorCode
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
  sourceCoverageByFloor: SourceCoverageByFloor
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

const machinePlanContinuityFields = [
  "jcNo",
  "machine",
  "optionNumber",
  "partCode",
  "routeMachine",
  "setupNo",
] as const

const dataEntrySourceBudgets: Record<string, number> = {
  cycle: 500,
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
  route: 500,
  setup_checklist_master: 2000,
  setup_checklist_session: 5000,
  shop_floor_status: 5000,
  tooling: 500,
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

function floorSourceBudgets(budgets: Record<string, number>) {
  return productionFloors.flatMap((floor) =>
    Object.entries(budgets).map(([category, limit]) => ({
      category,
      floor_code: floor.code,
      row_limit: limit,
    }))
  )
}

function timestamp(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value
}

function sourceRecord(
  row: SourceRow
): JsonRecord & { _id: unknown; createdAt: string } {
  return {
    ...row.source_payload,
    ...(row.production_floor_code
      ? { productionFloorCode: row.production_floor_code }
      : {}),
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
      payload: {
        ...jsonRecord(source.payload),
        ...(source.productionFloorCode
          ? { productionFloorCode: source.productionFloorCode }
          : {}),
      },
    }
  }
  return {
    _id: source._id,
    createdAt: source.createdAt,
    entryType: row.inferred_entry_type,
    key:
      typeof source.key === "string" && source.key ? source.key : row.source_id,
    payload: source,
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

function emptyCoverageFacts(limit: number): CoverageFacts {
  return { available: 0, limit, returned: 0, truncated: false }
}

function emptyGroupedCoverage(
  budgets: Record<string, number>
): GroupedSourceCoverage {
  return {
    ...emptyCoverageFacts(
      Object.values(budgets).reduce((total, limit) => total + limit, 0)
    ),
    groups: Object.fromEntries(
      Object.entries(budgets).map(([group, limit]) => [
        group,
        emptyCoverageFacts(limit),
      ])
    ),
    truncatedGroups: [],
  }
}

function emptySourceCoverage(): SourceCoverage {
  return {
    corrections: {
      ...emptyCoverageFacts(5000),
      truncatedGroups: [],
    },
    dataEntries: emptyGroupedCoverage(dataEntrySourceBudgets),
    physicalRows: emptyGroupedCoverage(physicalSourceBudgets),
  }
}

function sourceCoverageByFloor(
  rows: GroupedSourceRow[]
): SourceCoverageByFloor {
  const coverage = Object.fromEntries(
    productionFloors.map((floor) => [floor.code, emptySourceCoverage()])
  ) as SourceCoverageByFloor

  for (const row of rows) {
    const floorCoverage = coverage[row.production_floor_code]
    const facts =
      row.source_kind === "correction"
        ? floorCoverage.corrections
        : row.source_kind === "data_entry"
          ? floorCoverage.dataEntries.groups[row.entry_type ?? ""]
          : floorCoverage.physicalRows.groups[row.source_group]
    if (!facts) continue
    facts.available = Number(row.available)
    facts.returned += 1
  }

  for (const floorCoverage of Object.values(coverage)) {
    floorCoverage.corrections.truncated =
      floorCoverage.corrections.available > floorCoverage.corrections.returned
    floorCoverage.corrections.truncatedGroups = floorCoverage.corrections
      .truncated
      ? ["corrections"]
      : []

    for (const groupedCoverage of [
      floorCoverage.dataEntries,
      floorCoverage.physicalRows,
    ]) {
      groupedCoverage.returned = 0
      groupedCoverage.available = 0
      groupedCoverage.truncatedGroups = []
      for (const [group, facts] of Object.entries(groupedCoverage.groups)) {
        facts.truncated = facts.available > facts.returned
        groupedCoverage.returned += facts.returned
        groupedCoverage.available += facts.available
        if (facts.truncated) groupedCoverage.truncatedGroups.push(group)
      }
      groupedCoverage.truncated = groupedCoverage.truncatedGroups.length > 0
    }
  }

  return coverage
}

function floorRows(rows: JsonRecord[], floorCode: ProductionFloorCode) {
  return rows.filter((row) => productionFloorCodeForRecord(row) === floorCode)
}

const companyWideQualityEntryTypes = new Set([
  "rejection_type_master",
  "rejection_reason_master",
  "rejection_remark_master",
])

export function dashboardDataEntriesForFloor(
  rows: JsonRecord[],
  floorCode: ProductionFloorCode
) {
  return rows.filter(
    (row) =>
      (typeof row.entryType === "string" &&
        companyWideQualityEntryTypes.has(row.entryType)) ||
      productionFloorCodeForRecord(row) === floorCode
  )
}

function jsonRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

export async function readCanonicalDashboardSource(
  client: DashboardQueryClient,
  organizationId: string
): Promise<CanonicalDashboardSource> {
  const result = await client.query<GroupedSourceRow>(
    `
      WITH data_entries AS (
        SELECT source.source_id, source.source_payload, source.changed_at,
          source.source_kind, source.source_group, source.entry_type,
          budget.floor_code AS production_floor_code, source.available
        FROM jsonb_to_recordset($2::jsonb)
          budget(category text, floor_code text, row_limit integer)
        CROSS JOIN LATERAL (
          SELECT source_id, source_payload, changed_at, source_kind,
            source_group, entry_type, (count(*) OVER ())::integer AS available
          FROM derived.dashboard_source_records
          WHERE organization_id = $1 AND source_kind = 'data_entry'
            AND entry_type = budget.category
            AND production_floor_code = budget.floor_code
          ORDER BY changed_at DESC, source_id DESC
          LIMIT budget.row_limit
        ) source
      ), physical_rows AS (
        SELECT source.source_id, source.source_payload, source.changed_at,
          source.source_kind, source.source_group, source.entry_type,
          budget.floor_code AS production_floor_code, source.available
        FROM jsonb_to_recordset($3::jsonb)
          budget(category text, floor_code text, row_limit integer)
        CROSS JOIN LATERAL (
          SELECT source_id, source_payload, changed_at, source_kind,
            source_group, entry_type, (count(*) OVER ())::integer AS available
          FROM derived.dashboard_source_records
          WHERE organization_id = $1 AND source_kind = 'physical'
            AND source_group = budget.category
            AND production_floor_code = budget.floor_code
          ORDER BY changed_at DESC, source_id DESC
          LIMIT budget.row_limit
        ) source
      ), correction_rows AS (
        SELECT source.source_id, source.source_payload, source.changed_at,
          source.source_kind, source.source_group, source.entry_type,
          floor.code AS production_floor_code, source.available
        FROM jsonb_array_elements_text($4::jsonb) floor(code)
        CROSS JOIN LATERAL (
          SELECT source_id, source_payload, changed_at, source_kind,
            source_group, entry_type, (count(*) OVER ())::integer AS available
          FROM derived.dashboard_source_records
          WHERE organization_id = $1 AND source_kind = 'correction'
            AND production_floor_code = floor.code
          ORDER BY changed_at DESC, source_id DESC
          LIMIT 5000
        ) source
      )
      SELECT * FROM data_entries
      UNION ALL SELECT * FROM physical_rows
      UNION ALL SELECT * FROM correction_rows
    `,
    [
      organizationId,
      JSON.stringify(floorSourceBudgets(dataEntrySourceBudgets)),
      JSON.stringify(floorSourceBudgets(physicalSourceBudgets)),
      JSON.stringify(productionFloors.map((floor) => floor.code)),
    ]
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
  const dataEntryRows = byKind("data_entry")
  const physicalRows = byKind("physical")
  const correctionRows = byKind("correction")
  const coverageByFloor = sourceCoverageByFloor(result.rows)

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
    sourceCoverage: coverageByFloor[defaultProductionFloorCode],
    sourceCoverageByFloor: coverageByFloor,
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

  const previousModel = await client.query<PreviousMachinePlanRow>(
    `
      WITH previous_model AS (
        SELECT payload
        FROM derived.dashboard_read_models
        WHERE organization_id = $1
        ORDER BY version DESC
        LIMIT 1
      ), floor_payloads AS (
        SELECT floor.code AS production_floor_code,
          floor.ordinality AS floor_order,
          CASE
            WHEN floor.code = $4 THEN COALESCE(
              NULLIF(
                previous_model.payload #>
                  ARRAY['productionFloorSnapshots', floor.code],
                'null'::jsonb
              ),
              previous_model.payload
            )
            ELSE COALESCE(
              NULLIF(
                previous_model.payload #>
                  ARRAY['productionFloorSnapshots', floor.code],
                'null'::jsonb
              ),
              '{}'::jsonb
            )
          END AS floor_payload
        FROM previous_model
        CROSS JOIN jsonb_array_elements_text($2::jsonb)
          WITH ORDINALITY floor(code, ordinality)
      )
      SELECT floor_payloads.production_floor_code,
        (
          SELECT COALESCE(
            jsonb_object_agg(field.key, field.value),
            '{}'::jsonb
          )
          FROM jsonb_each(
            CASE
              WHEN jsonb_typeof(plan.row) = 'object' THEN plan.row
              ELSE '{}'::jsonb
            END
          ) field
          WHERE field.key = ANY($3::text[])
        ) AS machine_plan_row
      FROM floor_payloads
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(
            floor_payloads.floor_payload #>
              '{productionControl,machinePlanDetailRows}'
          ) = 'array'
          THEN floor_payloads.floor_payload #>
            '{productionControl,machinePlanDetailRows}'
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY plan(row, ordinality)
      ORDER BY floor_payloads.floor_order, plan.ordinality
    `,
    [
      context.organizationId,
      JSON.stringify(productionFloors.map((floor) => floor.code)),
      machinePlanContinuityFields,
      defaultProductionFloorCode,
    ]
  )
  const previousMachinePlanRowsByFloor = new Map<
    ProductionFloorCode,
    JsonRecord[]
  >()
  for (const previousRow of previousModel.rows) {
    const rows =
      previousMachinePlanRowsByFloor.get(previousRow.production_floor_code) ??
      []
    const row = jsonRecord(previousRow.machine_plan_row)
    rows.push({
      jcNo: row.jcNo,
      machine: row.machine,
      optionNumber: row.optionNumber,
      partCode: row.partCode,
      routeMachine: row.routeMachine,
      setupNo: row.setupNo,
    })
    previousMachinePlanRowsByFloor.set(previousRow.production_floor_code, rows)
  }

  function previousMachinePlanRows(floorCode: ProductionFloorCode) {
    return previousMachinePlanRowsByFloor.get(floorCode) ?? []
  }

  function buildFloorPayload(floorCode: ProductionFloorCode) {
    const floorDataEntries = dashboardDataEntriesForFloor(dataEntries, floorCode)
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
      sourceCoverage: source.sourceCoverageByFloor[floorCode],
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
      sourceCoverageByFloor: source.sourceCoverageByFloor,
    },
  }
}
