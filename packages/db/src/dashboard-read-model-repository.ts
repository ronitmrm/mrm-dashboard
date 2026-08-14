import { randomUUID } from "node:crypto"

import type { Pool, PoolClient } from "pg"

import {
  activeCorrectionTargetKeys,
  dataEntryCorrectionTargetsWithWorkflowCascade,
  type CorrectionTargetRow,
  type DataEntryCorrectionRow,
} from "./dashboard-corrections"
import { normalizeSourceCoverage } from "./dashboard-coverage"
import { queueDashboardRefresh } from "./dashboard-refresh-queue"
import { readCanonicalDashboardSource } from "./dashboard-read-model"
import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"
import {
  defaultProductionFloorCode,
  type ProductionFloorCode,
} from "./production-floors"

type RepositoryOptions = RepositoryPoolOptions
type JsonRecord = Record<string, unknown>

function text(value: unknown) {
  return String(value ?? "").trim()
}

function payloadRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
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

function activeCorrectionCandidates(
  source: Awaited<ReturnType<typeof readCanonicalDashboardSource>>
) {
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

async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await operation(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export function createDashboardReadModelRepository(options: RepositoryOptions) {
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
      knownVersion?: number
    ) {
      const result = await pool.query<{
        attempts: number | null
        completed_at: Date | null
        job_status: string | null
        last_error: string | null
        model_created_at: Date | null
        model_payload: JsonRecord | null
        model_source_watermark: JsonRecord | null
        model_version: string | null
        requested_at: Date | null
        started_at: Date | null
      }>(
        `
          SELECT model.version::text AS model_version,
            model.payload AS model_payload,
            model.source_watermark AS model_source_watermark,
            model.created_at AS model_created_at,
            job.status AS job_status, job.attempts,
            job.created_at AS requested_at, job.started_at,
            job.completed_at, job.last_error
          FROM (SELECT $1::uuid AS organization_id) requested
          LEFT JOIN LATERAL (
            SELECT version,
              CASE
                WHEN $3::bigint IS NOT NULL AND version = $3::bigint
                  THEN NULL
                ELSE COALESCE(
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
                )
              END AS payload,
              CASE
                WHEN $3::bigint IS NOT NULL AND version = $3::bigint
                  THEN NULL
                ELSE jsonb_build_object(
                  'changedAt', source_watermark -> 'changedAt',
                  'sourceCoverage', COALESCE(
                    payload #> ARRAY[
                      'productionFloorSnapshots',
                      $2::text,
                      'sourceCoverage'
                    ],
                    CASE
                      WHEN $2 = 'conventional'
                        THEN payload -> 'sourceCoverage'
                      ELSE NULL
                    END,
                    '{}'::jsonb
                  )
                )
              END AS source_watermark,
              created_at
            FROM derived.dashboard_read_models
            WHERE organization_id = requested.organization_id
            ORDER BY version DESC
            LIMIT 1
          ) model ON true
          LEFT JOIN LATERAL (
            SELECT status, attempts, created_at, started_at,
              completed_at, last_error
            FROM derived.refresh_jobs
            WHERE organization_id = requested.organization_id
              AND queue_key = 'dashboard'
            ORDER BY updated_at DESC, created_at DESC
            LIMIT 1
          ) job ON true
        `,
        [organizationId, productionFloorCode, knownVersion ?? null]
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
                ...row.model_payload,
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
          WHERE organization_id = $1 AND queue_key = 'dashboard'
          ORDER BY updated_at DESC, created_at DESC
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
        const source = await readCanonicalDashboardSource(
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
        const source = await readCanonicalDashboardSource(
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
