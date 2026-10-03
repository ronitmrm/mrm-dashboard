import { randomUUID } from "node:crypto"


import {
  activeCorrectionTargetKeys,
  dataEntryCorrectionTargetsWithWorkflowCascade,
  type CorrectionTargetRow,
  type DataEntryCorrectionRow,
} from "./dashboard-corrections"
import { normalizeSourceCoverage } from "./dashboard-coverage"
import { queueDashboardRefresh } from "./dashboard-refresh-queue"
import {
  readCorrectionCandidateSource,
  type CorrectionCandidateSource,
} from "./dashboard-read-model"
import {
  repositoryPool,
  withTransaction as transaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"
import {
  defaultProductionFloorCode,
  type ProductionFloorCode,
} from "./production-floors"

type JsonRecord = Record<string, unknown>

function text(value: unknown) {
  return String(value ?? "").trim()
}

function payloadRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

type LiveSetupStage = {
  machine: string
  stage: string
  active: boolean
  payload: JsonRecord
  completedAt: string | null
}

function setupKey(row: JsonRecord, machine: string) {
  return [
    row.jcNo ?? row.jobCardNumber,
    row.partCode,
    row.optionNumber,
    row.setupNo,
    machine,
  ].map((value) => text(value).toLowerCase()).join("|")
}

function withLiveSetupStages(
  dashboard: JsonRecord,
  states: LiveSetupStage[] | null
) {
  if (!states?.length) return dashboard
  const control = payloadRecord(dashboard.productionControl)
  if (!Array.isArray(control.machinePlanDetailRows)) return dashboard
  const byKey = new Map(states.map((state) => [
    setupKey(state.payload, state.machine), state,
  ]))
  const rows = control.machinePlanDetailRows.map((value) => {
    const row = payloadRecord(value)
    const state = byKey.get(setupKey(row, text(row.machine)))
    if (!state) return value
    const runningStatus = state.stage === "item_complete"
      ? "Complete"
      : state.stage === "operator_started"
        ? "Running"
        : state.stage === "setting" || state.stage === "quality_approval"
          ? "Setup complete"
          : row.runningStatus
    return {
      ...row,
      shopFloorStage: state.stage,
      shopFloorStageLabel: text(state.payload.stageLabel) || state.stage,
      shopFloorDoneBy: text(state.payload.doneBy),
      shopFloorWorker: text(state.payload.worker),
      shopFloorRemark: text(state.payload.remark),
      shopFloorUpdatedAt: text(state.completedAt ?? state.payload.completedAt),
      runningStatus,
      ...(state.active && state.stage !== "item_complete"
        ? { shopFloorTaskReady: true, shopFloorTaskBlocker: "" }
        : {}),
    }
  })
  return {
    ...dashboard,
    productionControl: { ...control, machinePlanDetailRows: rows },
  }
}

function correctionKeyFor(table: string, row: JsonRecord, payload: JsonRecord) {
  const values =
    table === "dataEntries"
      ? [
          payload.jcNo,
          payload.partCode || payload.partNo,
          payload.optionNumber,
          payload.setupNo,
          payload.machine || payload.machineNo,
        ]
      : [row.jcNo, row.target, row.machineNo, row.toMachine, row.newOption]
  return values.map(text).filter(Boolean).join(" | ")
}

function correctionCandidate(table: string, row: JsonRecord) {
  const payload = payloadRecord(row.payload)
  const entryType = typeof row.entryType === "string" ? row.entryType : table
  const targetKey =
    typeof row.key === "string" && row.key
      ? row.key
      : correctionKeyFor(table, row, payload)
  const targetLabel =
    table === "dataEntries"
      ? entryType === "shop_floor_status"
        ? `${text(payload.stageLabel) || text(payload.stage) || "Workflow task"} - ${text(payload.machine)} - ${text(payload.partCode)} - setup ${text(payload.setupNo)}`
        : `${entryType || "Data entry"} - ${targetKey || text(row.key)}`
      : `${table} - ${targetKey || text(row._id)}`
  return {
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    details: table === "dataEntries" ? payload : row,
    entryType,
    productionFloorCode: text(
      row.productionFloorCode || payload.productionFloorCode
    ),
    targetId: String(row._id),
    targetKey,
    targetLabel,
    targetTable: table,
  }
}

function activeCorrectionCandidates(source: CorrectionCandidateSource) {
  const corrections = source.corrections as CorrectionTargetRow[]
  const directTargets = activeCorrectionTargetKeys(corrections)
  const dataEntryTargets = dataEntryCorrectionTargetsWithWorkflowCascade(
    source.allDataEntries as DataEntryCorrectionRow[],
    directTargets,
    corrections
  )
  const groups: Array<[string, JsonRecord[]]> = [
    ["routeSelections", source.routeSelections],
    ["plannerPriorities", source.plannerPriorities],
    ["machineConstraints", source.machineConstraints],
    ["planOverrides", source.planOverrides],
    ["routeChanges", source.routeChanges],
    ["dispatchApprovals", source.dispatchApprovals],
    ["setupCompletions", source.setupCompletions],
    ["dataEntries", source.allDataEntries],
  ]
  return groups
    .flatMap(([table, rows]) =>
      rows
        .filter((row) => {
          const targets =
            table === "dataEntries" ? dataEntryTargets : directTargets
          return !targets.has(`${table}:${String(row._id)}`)
        })
        .map((row) => correctionCandidate(table, row))
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function createDashboardReadModelRepository(options: RepositoryPoolOptions) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    async organizationIdForCode(code: string) {
      const result = await pool.query<{ id: string }>(
        `SELECT id FROM core.organizations WHERE lower(code) = lower($1)`,
        [code]
      )
      if (!result.rows[0])
        throw new Error(`Organization ${code} was not found.`)
      return result.rows[0].id
    },

    async rawMaterialInwardTemplateRows(
      organizationId: string,
      productionFloorCode: ProductionFloorCode
    ) {
      const result = await pool.query<{
        jcNo: string
        partCode: string
        rmPoNo: string | null
      }>(
        `
          WITH receipt_totals AS (
            SELECT lower(receipt.job_card_number) AS job_card_key,
              sum(receipt.quantity_kg) AS received_kg
            FROM manufacturing.raw_material_receipts receipt
            WHERE receipt.organization_id = $1
            GROUP BY lower(receipt.job_card_number)
          ), rejection_totals AS (
            SELECT rejection.work_order_id,
              sum(rejection.rejected_kg) AS rejected_kg
            FROM manufacturing.raw_material_rejection_events rejection
            WHERE rejection.organization_id = $1
            GROUP BY rejection.work_order_id
          )
          SELECT work_order.job_card_number AS "jcNo",
            item.uid AS "partCode",
            COALESCE(
              NULLIF(btrim(work_order.source_payload->>'rmPoNo'), ''),
              NULLIF(btrim(work_order.source_payload->>'RM PO NO.'), ''),
              NULLIF(btrim(work_order.source_payload->>'RM PO NO'), '')
            ) AS "rmPoNo"
          FROM manufacturing.work_orders work_order
          JOIN catalog.items item ON item.id = work_order.item_id
          LEFT JOIN receipt_totals receipt
            ON receipt.job_card_key = lower(work_order.job_card_number)
          LEFT JOIN rejection_totals rejection
            ON rejection.work_order_id = work_order.id
          CROSS JOIN LATERAL (
            SELECT COALESCE(
              NULLIF(btrim(work_order.source_payload->>'orderKg'), ''),
              NULLIF(btrim(work_order.source_payload->>'ORD. KG.'), ''),
              NULLIF(btrim(work_order.source_payload->>'ORD. KG'), ''),
              '0'
            ) AS ordered_kg_text
          ) source
          CROSS JOIN LATERAL (
            SELECT CASE
              WHEN source.ordered_kg_text ~ '^[0-9]+([.][0-9]+)?$'
                THEN source.ordered_kg_text::numeric
              ELSE 0
            END AS ordered_kg
          ) requested
          WHERE work_order.organization_id = $1
            AND lower(btrim(work_order.status)) <> 'cancelled'
            AND derived.dashboard_production_floor_code(
              work_order.source_payload
            ) = $2
            AND (
              COALESCE(receipt.received_kg, 0) = 0
              OR (
                COALESCE(rejection.rejected_kg, 0) > 0
                AND (
                  requested.ordered_kg <= 0
                  OR COALESCE(receipt.received_kg, 0)
                    - rejection.rejected_kg < requested.ordered_kg
                )
              )
            )
          ORDER BY work_order.created_at, work_order.job_card_number
        `,
        [organizationId, productionFloorCode]
      )
      return result.rows
    },

    async latest(
      organizationId: string,
      filters: JsonRecord = {},
      productionFloorCode: ProductionFloorCode = defaultProductionFloorCode
    ) {
      const result = await pool.query<{
        created_at: Date
        payload: JsonRecord
        source_watermark: JsonRecord
        version: string
      }>(
        `
          SELECT version::text AS version,
            COALESCE(
              jsonb_extract_path(
                payload,
                'productionFloorSnapshots',
                $2::text
              ),
              CASE
                WHEN $2 = 'conventional'
                  THEN payload - 'productionFloorSnapshots'
                ELSE '{}'::jsonb
              END
            ) AS payload,
            jsonb_build_object(
              'changedAt', source_watermark -> 'changedAt',
              'sourceCoverage', COALESCE(
                payload #> ARRAY[
                  'productionFloorSnapshots',
                  $2::text,
                  'sourceCoverage'
                ],
                CASE
                  WHEN $2 = 'conventional' THEN payload -> 'sourceCoverage'
                  ELSE NULL
                END,
                '{}'::jsonb
              )
            ) AS source_watermark,
            created_at
          FROM derived.dashboard_read_models AS dashboard_model
          WHERE dashboard_model.organization_id = $1
          ORDER BY dashboard_model.version DESC
          LIMIT 1
        `,
        [organizationId, productionFloorCode]
      )
      const row = result.rows[0]
      if (!row) return null
      const sourceCoverage = normalizeSourceCoverage(row.payload.sourceCoverage)
      return {
        ...row.payload,
        filters,
        productionFloorCode,
        readModelVersion: Number(row.version),
        snapshotCacheUpdatedAt: row.created_at.toISOString(),
        sourceCoverage,
        sourceWatermark: {
          ...row.source_watermark,
          sourceCoverage,
        },
      }
    },

    async state(
      organizationId: string,
      filters: JsonRecord = {},
      productionFloorCode: ProductionFloorCode = defaultProductionFloorCode,
      knownVersion?: number,
      knownLiveVersion?: string
    ) {
      const result = await pool.query<{
        attempts: number | null
        completed_at: Date | null
        job_status: string | null
        last_error: string | null
        live_setup_stages: LiveSetupStage[] | null
        live_version: string | null
        model_created_at: Date | null
        model_payload: JsonRecord | null
        model_source_watermark: JsonRecord | null
        model_version: string | null
        requested_at: Date | null
        started_at: Date | null
      }>(
        `
          SELECT model.version::text AS model_version,
            CASE
              WHEN $3::bigint IS NOT NULL AND model.version = $3::bigint
                AND (live.version IS NULL OR live.version = $4::text)
                THEN NULL
              ELSE COALESCE(
                model.payload #> ARRAY['productionFloorSnapshots', $2::text],
                CASE WHEN $2 = 'conventional'
                  THEN model.payload - 'productionFloorSnapshots'
                  ELSE '{}'::jsonb END
              )
            END AS model_payload,
            CASE
              WHEN $3::bigint IS NOT NULL AND model.version = $3::bigint
                AND (live.version IS NULL OR live.version = $4::text)
                THEN NULL
              ELSE jsonb_build_object(
                'changedAt', model.source_watermark -> 'changedAt',
                'sourceCoverage', COALESCE(
                  model.payload #> ARRAY[
                    'productionFloorSnapshots', $2::text, 'sourceCoverage'
                  ],
                  CASE WHEN $2 = 'conventional'
                    THEN model.payload -> 'sourceCoverage'
                    ELSE NULL END,
                  '{}'::jsonb
                )
              )
            END AS model_source_watermark,
            model.created_at AS model_created_at,
            live.stages AS live_setup_stages,
            live.version AS live_version,
            job.status AS job_status, job.attempts,
            job.created_at AS requested_at, job.started_at,
            job.completed_at, job.last_error
          FROM (SELECT $1::uuid AS organization_id) requested
          LEFT JOIN LATERAL (
            SELECT version, payload, source_watermark, created_at
            FROM derived.dashboard_read_models
            WHERE organization_id = requested.organization_id
            ORDER BY version DESC
            LIMIT 1
          ) model ON true
          LEFT JOIN LATERAL (
            SELECT max(state.updated_at)::text AS version,
              jsonb_agg(jsonb_build_object(
                'machine', machine.machine_number,
                'stage', state.stage,
                'active', state.active,
                'payload', state.source_payload,
                'completedAt', state.completed_at
              )) AS stages
            FROM manufacturing.shop_floor_setup_state state
            JOIN catalog.machines machine ON machine.id = state.machine_id
            JOIN manufacturing.production_floors floor
              ON floor.id = machine.production_floor_id
            WHERE state.organization_id = requested.organization_id
              AND floor.code = $2
              AND state.updated_at > model.created_at
              AND state.source_payload IS NOT NULL
          ) live ON true
          LEFT JOIN LATERAL (
            SELECT status, attempts, created_at, started_at,
              completed_at, last_error
            FROM derived.refresh_jobs
            WHERE organization_id = requested.organization_id
              AND (queue_key = 'dashboard' OR queue_key LIKE 'dashboard:%')
            ORDER BY (status IN ('pending', 'running')) DESC,
              updated_at DESC, created_at DESC
            LIMIT 1
          ) job ON true
        `,
        [organizationId, productionFloorCode, knownVersion ?? null,
          knownLiveVersion ?? null]
      )
      const row = result.rows[0]!
      const version = row.model_version ? Number(row.model_version) : null
      const coverage = row.model_payload
        ? normalizeSourceCoverage(row.model_payload.sourceCoverage)
        : null
      return {
        coverage,
        dashboard:
          row.model_version && row.model_payload && row.model_created_at
            ? {
                ...withLiveSetupStages(row.model_payload, row.live_setup_stages),
                filters,
                productionFloorCode,
                readModelVersion: version,
                snapshotCacheUpdatedAt: row.model_created_at.toISOString(),
                sourceCoverage: coverage,
                sourceWatermark: {
                  ...(row.model_source_watermark ?? {}),
                  sourceCoverage: coverage,
                },
              }
            : null,
        notModified:
          knownVersion !== undefined &&
          row.model_version === String(knownVersion) &&
          row.model_payload === null,
        liveVersion: row.live_version,
        productionFloorCode,
        status: row.job_status
          ? {
              attempts: row.attempts ?? 0,
              completedAtMs: row.completed_at?.getTime(),
              isRefreshing:
                row.job_status === "pending" || row.job_status === "running",
              lastError: row.last_error ?? undefined,
              requestedAtMs: row.requested_at?.getTime(),
              startedAtMs: row.started_at?.getTime(),
              status: row.job_status,
            }
          : {
              attempts: 0,
              completedAtMs: undefined,
              isRefreshing: false,
              lastError: undefined,
              requestedAtMs: undefined,
              startedAtMs: undefined,
              status: "idle",
            },
        version,
      }
    },

    async requestRefresh(organizationId: string) {
      return transaction(pool, (client) =>
        queueDashboardRefresh(client, organizationId)
      )
    },

    async status(organizationId: string) {
      const result = await pool.query<{
        attempts: number
        completed_at: Date | null
        last_error: string | null
        requested_at: Date
        started_at: Date | null
        status: string
      }>(
        `
          SELECT status, attempts, created_at AS requested_at, started_at,
            completed_at, last_error
          FROM derived.refresh_jobs
          WHERE organization_id = $1
            AND (queue_key = 'dashboard' OR queue_key LIKE 'dashboard:%')
          ORDER BY (status IN ('pending', 'running')) DESC,
            updated_at DESC, created_at DESC
          LIMIT 1
        `,
        [organizationId]
      )
      const row = result.rows[0]
      if (!row) {
        return {
          attempts: 0,
          completedAtMs: undefined,
          isRefreshing: false,
          lastError: undefined,
          requestedAtMs: undefined,
          startedAtMs: undefined,
          status: "idle",
        }
      }
      return {
        attempts: row.attempts,
        completedAtMs: row.completed_at?.getTime(),
        isRefreshing: row.status === "pending" || row.status === "running",
        lastError: row.last_error ?? undefined,
        requestedAtMs: row.requested_at.getTime(),
        startedAtMs: row.started_at?.getTime(),
        status: row.status,
      }
    },

    async reverseEntry(input: {
      actorUserId: string
      correctionKind: string
      organizationId: string
      reason: string
      recordId: string
    }) {
      const correctionKind = text(input.correctionKind)
      const recordId = text(input.recordId)
      const reason = text(input.reason)
      const actorUserId = text(input.actorUserId)
      if (!correctionKind) throw new Error("Correction kind is required.")
      if (!recordId) throw new Error("Correction record id is required.")
      if (!reason) throw new Error("Correction reason is required.")
      if (!actorUserId) throw new Error("Correction actor is required.")

      return transaction(pool, async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [`${input.organizationId}:${correctionKind}:${recordId}`]
        )
        const source = await readCorrectionCandidateSource(
          client,
          input.organizationId
        )
        const candidate = activeCorrectionCandidates(source).find(
          (row) =>
            row.targetTable === correctionKind && row.targetId === recordId
        )
        if (!candidate) {
          throw new Error("Active correction target was not found.")
        }

        const createdAt = new Date().toISOString()
        const sourceId = `correction-${randomUUID()}`
        await client.query(
          `INSERT INTO audit.legacy_convex_corrections (
             organization_id, source_id, target_source_table, target_source_id,
             correction_type, reason, legacy_actor, original_timestamp,
             resolved, source_payload
           ) VALUES ($1, $2, $3, $4, 'reverse', $5, $6, $7, true, $8)`,
          [
            input.organizationId,
            sourceId,
            candidate.targetTable,
            candidate.targetId,
            reason,
            actorUserId,
            createdAt,
            {
              action: "reverse",
              actorUserId,
              createdAt,
              reason,
              target: {
                id: candidate.targetId,
                kind: candidate.targetTable,
              },
              targetId: candidate.targetId,
              targetTable: candidate.targetTable,
            },
          ]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return { reversed: true }
      })
    },

    async correctionCandidates(organizationId: string, limit = 200) {
      const client = await pool.connect()
      try {
        const source = await readCorrectionCandidateSource(
          client,
          organizationId
        )
        return activeCorrectionCandidates(source).slice(
          0,
          Math.min(Math.max(Math.floor(limit), 1), 200)
        )
      } finally {
        client.release()
      }
    },
  }
}
