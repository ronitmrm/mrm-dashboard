import { readToolingAllocations, readToolingOccupancy } from "./tooling-availability"
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

type SelectedSourceRow = SourceRow & {
  entry_type: string | null
  production_floor_code: ProductionFloorCode
  source_kind: "correction" | "data_entry" | "physical"
  source_group: string
}

type GroupedSourceRow = SelectedSourceRow & {
  available: number
}

type PreviousPlanningRow = {
  previous_row: JsonRecord
  production_floor_code: ProductionFloorCode
}

type FinishBaselineRow = {
  id: string
  job_card_number: string
  part_code: string
  planned_finish_on: string | null
  work_order_source_payload: JsonRecord | null
}

export type CanonicalDashboardSource = {
  allDataEntries: ReturnType<typeof dataEntryRecord>[]
  attendanceRecords: JsonRecord[]
  corrections: JsonRecord[]
  dispatchApprovals: JsonRecord[]
  machineConstraints: JsonRecord[]
  planOverrides: JsonRecord[]
  plannerPriorities: JsonRecord[]
  productionEntries: JsonRecord[]
  rawMaterialRejections: JsonRecord[]
  routeChanges: JsonRecord[]
  routeSelections: JsonRecord[]
  setupCompletions: JsonRecord[]
  sourceCoverage: SourceCoverage
  sourceCoverageByFloor: SourceCoverageByFloor
  trainingRecords: JsonRecord[]
}

export type CorrectionCandidateSource = Pick<
  CanonicalDashboardSource,
  | "allDataEntries"
  | "corrections"
  | "routeSelections"
  | "plannerPriorities"
  | "machineConstraints"
  | "planOverrides"
  | "routeChanges"
  | "dispatchApprovals"
  | "setupCompletions"
>

const legacyEntryTypes = [
  "setup_name_master",
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
  "parameter_master",
  "measuring_instrument_master",
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
  setup_name_master: 1000,
  cycle: 5000,
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
  parameter_master: 2000,
  measuring_instrument_master: 2000,
  rejection_reason_master: 500,
  rejection_remark_master: 500,
  rejection_type_master: 500,
  rm_inward: 2000,
  route: 5000,
  setup_checklist_master: 2000,
  setup_checklist_session: 5000,
  shop_floor_status: 5000,
  tooling: 5000,
  work_order: 5000,
}

const physicalSourceBudgets = {
  attendanceRecords: 5000,
  dispatchApprovals: 2000,
  machineConstraints: 2000,
  planOverrides: 2000,
  plannerPriorities: 2000,
  productionEntries: 10000,
  rawMaterialRejections: 2000,
  routeChanges: 2000,
  routeSelections: 2500,
  setupCompletions: 5000,
  trainingRecords: 2500,
} satisfies Record<string, number>

const correctionPhysicalSourceBudgets = {
  dispatchApprovals: physicalSourceBudgets.dispatchApprovals,
  machineConstraints: physicalSourceBudgets.machineConstraints,
  planOverrides: physicalSourceBudgets.planOverrides,
  plannerPriorities: physicalSourceBudgets.plannerPriorities,
  routeChanges: physicalSourceBudgets.routeChanges,
  routeSelections: physicalSourceBudgets.routeSelections,
  setupCompletions: physicalSourceBudgets.setupCompletions,
} satisfies Record<string, number>

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

const companyWideMasterEntryTypes = new Set([
  "parameter_master",
  "measuring_instrument_master",
  "maintenance_checklist_master",
  "maintenance_master",
  "rejection_type_master",
  "rejection_reason_master",
  "rejection_remark_master",
])

export function dashboardDataEntriesForFloor<Row extends JsonRecord>(
  rows: Row[],
  floorCode: ProductionFloorCode
): Row[] {
  return rows.filter(
    (row) =>
      (typeof row.entryType === "string" &&
        companyWideMasterEntryTypes.has(row.entryType)) ||
      productionFloorCodeForRecord(row) === floorCode
  )
}

function jsonRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function finishBaselineKey(value: JsonRecord) {
  return [value.jcNo, value.partCode]
    .map((part) => String(part ?? "").trim().toLowerCase())
    .join("|")
}

function dashboardDateIso(value: unknown) {
  const text = String(value ?? "").trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const match = text.match(/^(\d{1,2})-([A-Za-z]+)-(\d{2})$/)
  if (!match) return ""
  const month = new Map([
    ["jan", 1], ["january", 1], ["feb", 2], ["february", 2],
    ["mar", 3], ["march", 3], ["apr", 4], ["april", 4], ["may", 5],
    ["jun", 6], ["june", 6], ["jul", 7], ["july", 7], ["aug", 8],
    ["august", 8], ["sep", 9], ["sept", 9], ["september", 9],
    ["oct", 10], ["october", 10], ["nov", 11], ["november", 11],
    ["dec", 12], ["december", 12],
  ]).get(match[2]!.toLowerCase())
  if (!month) return ""
  return `20${match[3]!}-${String(month).padStart(2, "0")}-${String(Number(match[1]!)).padStart(2, "0")}`
}

function mapSelectedSourceRows(rows: SelectedSourceRow[]) {
  const byKind = <Kind extends SelectedSourceRow["source_kind"]>(kind: Kind) =>
    rows
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
  const physicalGroups = new Map<string, JsonRecord[]>()
  for (const row of physicalRows) {
    const group = physicalGroups.get(row.source_group) ?? []
    group.push(sourceRecord(row))
    physicalGroups.set(row.source_group, group)
  }

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
    corrections: correctionRows.map(sourceRecord),
    physicalGroups,
  }
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
          budget.floor_code AS production_floor_code, counts.available
        FROM jsonb_to_recordset($2::jsonb)
          budget(category text, floor_code text, row_limit integer)
        CROSS JOIN LATERAL (
          SELECT count(*)::integer AS available
          FROM derived.dashboard_source_records
          WHERE organization_id = $1 AND source_kind = 'data_entry'
            AND entry_type = budget.category
            AND production_floor_code = budget.floor_code
        ) counts
        CROSS JOIN LATERAL (
          SELECT source_id, source_payload, changed_at, source_kind,
            source_group, entry_type
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
          budget.floor_code AS production_floor_code, counts.available
        FROM jsonb_to_recordset($3::jsonb)
          budget(category text, floor_code text, row_limit integer)
        CROSS JOIN LATERAL (
          SELECT count(*)::integer AS available
          FROM derived.dashboard_source_records
          WHERE organization_id = $1 AND source_kind = 'physical'
            AND source_group = budget.category
            AND production_floor_code = budget.floor_code
        ) counts
        CROSS JOIN LATERAL (
          SELECT source_id, source_payload, changed_at, source_kind,
            source_group, entry_type
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
          floor.code AS production_floor_code, counts.available
        FROM jsonb_array_elements_text($4::jsonb) floor(code)
        CROSS JOIN LATERAL (
          SELECT count(*)::integer AS available
          FROM derived.dashboard_source_records
          WHERE organization_id = $1 AND source_kind = 'correction'
            AND production_floor_code = floor.code
        ) counts
        CROSS JOIN LATERAL (
          SELECT source_id, source_payload, changed_at, source_kind,
            source_group, entry_type
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

  const selected = mapSelectedSourceRows(result.rows)
  const coverageByFloor = sourceCoverageByFloor(result.rows)
  const group = (name: string) => selected.physicalGroups.get(name) ?? []
  return {
    allDataEntries: selected.allDataEntries,
    attendanceRecords: group("attendanceRecords"),
    corrections: selected.corrections,
    dispatchApprovals: group("dispatchApprovals"),
    machineConstraints: group("machineConstraints"),
    planOverrides: group("planOverrides"),
    plannerPriorities: group("plannerPriorities"),
    productionEntries: group("productionEntries"),
    rawMaterialRejections: group("rawMaterialRejections"),
    routeChanges: group("routeChanges"),
    routeSelections: group("routeSelections"),
    setupCompletions: group("setupCompletions"),
    sourceCoverage: coverageByFloor[defaultProductionFloorCode],
    sourceCoverageByFloor: coverageByFloor,
    trainingRecords: group("trainingRecords"),
  }
}

export async function readCorrectionCandidateSource(
  client: DashboardQueryClient,
  organizationId: string
): Promise<CorrectionCandidateSource> {
  const result = await client.query<SelectedSourceRow>(
    `
      WITH data_entries AS (
        SELECT source.source_id, source.source_payload, source.changed_at,
          source.source_kind, source.source_group, source.entry_type,
          budget.floor_code AS production_floor_code
        FROM jsonb_to_recordset($2::jsonb)
          budget(category text, floor_code text, row_limit integer)
        CROSS JOIN LATERAL (
          SELECT source_id, source_payload, changed_at, source_kind,
            source_group, entry_type
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
          budget.floor_code AS production_floor_code
        FROM jsonb_to_recordset($3::jsonb)
          budget(category text, floor_code text, row_limit integer)
        CROSS JOIN LATERAL (
          SELECT source_id, source_payload, changed_at, source_kind,
            source_group, entry_type
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
          floor.code AS production_floor_code
        FROM jsonb_array_elements_text($4::jsonb) floor(code)
        CROSS JOIN LATERAL (
          SELECT source_id, source_payload, changed_at, source_kind,
            source_group, entry_type
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
      JSON.stringify(floorSourceBudgets(correctionPhysicalSourceBudgets)),
      JSON.stringify(productionFloors.map((floor) => floor.code)),
    ]
  )
  const selected = mapSelectedSourceRows(result.rows)
  const group = (name: string) => selected.physicalGroups.get(name) ?? []
  return {
    allDataEntries: selected.allDataEntries,
    corrections: selected.corrections,
    dispatchApprovals: group("dispatchApprovals"),
    machineConstraints: group("machineConstraints"),
    planOverrides: group("planOverrides"),
    plannerPriorities: group("plannerPriorities"),
    routeChanges: group("routeChanges"),
    routeSelections: group("routeSelections"),
    setupCompletions: group("setupCompletions"),
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
    source.allDataEntries,
    activeCorrectionTargetKeys(source.corrections as CorrectionTargetRow[]),
    source.corrections as CorrectionTargetRow[]
  )
  const dataEntries = withoutCorrectedRows(
    source.allDataEntries,
    "dataEntries",
    correctionTargets
  )
  const corrected = <Row extends JsonRecord & { _id: unknown }>(
    rows: JsonRecord[],
    table: string
  ) => withoutCorrectedRows(rows as Row[], table, correctionTargets)

  const previousModel = await client.query<PreviousPlanningRow>(
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
              WHEN jsonb_typeof(previous.row) = 'object' THEN previous.row
              ELSE '{}'::jsonb
            END
          ) field
          WHERE field.key = ANY($3::text[])
        ) AS previous_row
      FROM floor_payloads
      CROSS JOIN LATERAL (
        SELECT plan.row, plan.ordinality
        FROM jsonb_array_elements(
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
      ) previous
      ORDER BY floor_payloads.floor_order, previous.ordinality
    `,
    [
      context.organizationId,
      JSON.stringify(productionFloors.map((floor) => floor.code)),
      machinePlanContinuityFields,
      defaultProductionFloorCode,
    ]
  )
  const finishBaselineResult = await client.query<FinishBaselineRow>(
    `
      SELECT baseline.id::text AS id,
        work_order.job_card_number,
        item.uid AS part_code,
        baseline.planned_finish_on::text AS planned_finish_on,
        work_order.source_payload AS work_order_source_payload
      FROM manufacturing.job_card_finish_baselines baseline
      JOIN manufacturing.work_orders work_order
        ON work_order.id = baseline.work_order_id
      JOIN catalog.items item ON item.id = work_order.item_id
      WHERE baseline.organization_id = $1
      ORDER BY work_order.job_card_number
    `,
    [context.organizationId]
  )
  const finishBaselineRows = finishBaselineResult.rows.map((row) => ({
    baselineId: row.id,
    jcNo: row.job_card_number,
    partCode: row.part_code,
    plannedDispatchDateAtRmReceipt: row.planned_finish_on ?? "",
    productionFloorCode: productionFloorCodeForRecord({
      sourcePayload: row.work_order_source_payload,
    }),
  }))
  const previousMachinePlanRowsByFloor = new Map<
    ProductionFloorCode,
    JsonRecord[]
  >()
  for (const previousRow of previousModel.rows) {
    const rows =
      previousMachinePlanRowsByFloor.get(previousRow.production_floor_code) ??
      []
    rows.push(jsonRecord(previousRow.previous_row))
    previousMachinePlanRowsByFloor.set(previousRow.production_floor_code, rows)
  }

  function previousMachinePlanRows(floorCode: ProductionFloorCode) {
    return previousMachinePlanRowsByFloor.get(floorCode) ?? []
  }

  const toolingAllocations = await readToolingAllocations(client, context.organizationId)
  const toolingOccupancy = await readToolingOccupancy(client, context.organizationId)

  function buildFloorPayload(floorCode: ProductionFloorCode) {
    const floorDataEntries = dashboardDataEntriesForFloor(dataEntries, floorCode)
    const qualityReferenceRows = (entryType: string) => floorDataEntries
      .filter((row) => row.entryType === entryType)
      .map((row) => ({ ...jsonRecord(row.payload), _id: row._id, entryType }))
    const floorCorrections = floorRows(source.corrections, floorCode)
    const floorUpdatedAt = latestCreatedAt(
      floorRows(source.productionEntries, floorCode),
      floorRows(source.attendanceRecords, floorCode),
      floorRows(source.trainingRecords, floorCode),
      floorRows(source.routeSelections, floorCode),
      floorRows(source.plannerPriorities, floorCode),
      floorRows(source.machineConstraints, floorCode),
      floorRows(source.planOverrides, floorCode),
      floorRows(source.rawMaterialRejections, floorCode),
      floorRows(source.routeChanges, floorCode),
      floorRows(source.dispatchApprovals, floorCode),
      floorRows(source.setupCompletions, floorCode),
      floorDataEntries,
      floorCorrections
    )
    const snapshot = buildLegacyDashboardSnapshot({
      includeToolFixtureNumbers:
        floorCode === "conventional" || floorCode === "conventional-02",
      productionFloorCode: floorCode,
      attendanceRecords: floorRows(
        corrected(source.attendanceRecords, "attendanceRecords"),
        floorCode
      ) as never,
      dataEntries: [...floorDataEntries, ...[...toolingAllocations.values()].map(asset => ({
        entryType: "tooling_availability", createdAt: "",
        payload: { assetCode: asset.assetCode, totalQuantity: asset.totalQuantity,
          storeQuantity: asset.storeQuantity, allocatedQuantity: asset.floors.get(floorCode) ?? 0,
          occupiedQuantity: toolingOccupancy.find(row => row.assetCode === asset.assetCode && row.floorCode === floorCode)?.occupiedQuantity ?? 0 },
      }))],
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
      productionFinishBaselineRows: floorRows(finishBaselineRows, floorCode),
      productionEntries: floorRows(
        corrected(source.productionEntries, "productionEntries"),
        floorCode
      ) as never,
      rawMaterialRejections: floorRows(
        source.rawMaterialRejections,
        floorCode
      ),
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
      productionControl: {
        ...snapshot.productionControl,
        parameterMasterRows: qualityReferenceRows("parameter_master"),
        measuringInstrumentMasterRows: qualityReferenceRows("measuring_instrument_master"),
      },
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
  const pendingBaselines = new Map(
    finishBaselineRows
      .filter((row) => !row.plannedDispatchDateAtRmReceipt)
      .map((row) => [
        `${row.productionFloorCode}|${finishBaselineKey(row)}`,
        row,
      ])
  )
  const baselineCandidates: Array<{
    baselineId: string
    plannedFinishOn: string
    row: JsonRecord
  }> = []
  for (const floor of productionFloors) {
    const snapshot = jsonRecord(productionFloorSnapshots[floor.code])
    const productionControl = jsonRecord(snapshot.productionControl)
    const dashboardRows = Array.isArray(productionControl.productionDashboardRows)
      ? productionControl.productionDashboardRows.map(jsonRecord)
      : []
    for (const row of dashboardRows) {
      const baseline = pendingBaselines.get(
        `${floor.code}|${finishBaselineKey(row)}`
      )
      if (!baseline) continue
      const plannedFinishOn = dashboardDateIso(
        row.currentProbableDispatchDate
      )
      if (!plannedFinishOn) continue
      baselineCandidates.push({
        baselineId: baseline.baselineId,
        plannedFinishOn,
        row,
      })
    }
  }
  if (baselineCandidates.length) {
    const finalized = await client.query<{ id: string }>(
      `
        UPDATE manufacturing.job_card_finish_baselines baseline
        SET planned_finish_on = candidate.planned_finish_on,
          captured_at = now()
        FROM unnest($2::uuid[], $3::date[])
          AS candidate(id, planned_finish_on)
        WHERE baseline.organization_id = $1
          AND baseline.id = candidate.id
          AND baseline.planned_finish_on IS NULL
        RETURNING baseline.id::text AS id
      `,
      [
        context.organizationId,
        baselineCandidates.map((candidate) => candidate.baselineId),
        baselineCandidates.map((candidate) => candidate.plannedFinishOn),
      ]
    )
    const finalizedIds = new Set(finalized.rows.map((row) => row.id))
    for (const candidate of baselineCandidates) {
      if (!finalizedIds.has(candidate.baselineId)) continue
      candidate.row.plannedDispatchDateAtRmReceipt =
        candidate.row.currentProbableDispatchDate
    }
  }
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
    source.rawMaterialRejections,
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
