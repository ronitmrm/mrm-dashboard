import { randomUUID } from "node:crypto"

import type { Pool, PoolClient } from "pg"

import {
  activeCorrectionTargetKeys,
  dataEntryCorrectionTargetsWithWorkflowCascade,
  type CorrectionTargetRow,
  type DataEntryCorrectionRow,
} from "./dashboard-corrections"
import { readCanonicalDashboardSource } from "./dashboard-read-model"
import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

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
    targetId: String(row._id),
    targetKey,
    targetLabel,
    targetTable: table,
  }
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

    async latest(organizationId: string, filters: JsonRecord = {}) {
      const result = await pool.query<{
        created_at: Date
        payload: JsonRecord
        source_watermark: JsonRecord
        version: string
      }>(
        `
          SELECT version::text AS version, payload, source_watermark, created_at
          FROM derived.dashboard_read_models
          WHERE organization_id = $1
          ORDER BY version DESC
          LIMIT 1
        `,
        [organizationId]
      )
      const row = result.rows[0]
      if (!row) return null
      return {
        ...row.payload,
        filters,
        readModelVersion: Number(row.version),
        snapshotCacheUpdatedAt: row.created_at.toISOString(),
        sourceWatermark: row.source_watermark,
      }
    },

    async requestRefresh(organizationId: string) {
      return transaction(pool, async (client) => {
        const result = await client.query<{ id: string; status: string }>(
          `
            INSERT INTO derived.refresh_jobs (
              organization_id, queue_key, idempotency_key, status, run_after
            )
            VALUES ($1, 'dashboard', $2, 'pending', now())
            ON CONFLICT (organization_id, queue_key)
              WHERE status IN ('pending', 'running')
            DO UPDATE SET run_after = LEAST(derived.refresh_jobs.run_after, now()),
              updated_at = now(), last_error = NULL
            RETURNING id, status
          `,
          [organizationId, randomUUID()]
        )
        const job = result.rows[0]!
        await client.query(
          `
            INSERT INTO derived.outbox_events (
              organization_id, topic, aggregate_type, aggregate_id,
              payload, idempotency_key
            )
            VALUES ($1, 'dashboard.refresh.requested', 'refresh_job',
              $2, $3, $4)
          `,
          [
            organizationId,
            job.id,
            { organizationId, queueKey: "dashboard", refreshJobId: job.id },
            randomUUID(),
          ]
        )
        return { jobId: job.id, queued: true, skipped: false }
      })
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
      correctedBy: string
      organizationId: string
      reason: string
      targetId: string
      targetKey?: string
      targetLabel?: string
      targetTable: string
    }) {
      const targetTable = text(input.targetTable)
      const targetId = text(input.targetId)
      const reason = text(input.reason)
      const correctedBy = text(input.correctedBy)
      if (!targetTable) throw new Error("Correction target table is required.")
      if (!targetId) throw new Error("Correction target id is required.")
      if (!reason) throw new Error("Correction reason is required.")
      if (!correctedBy) throw new Error("Corrected by is required.")

      const createdAt = new Date().toISOString()
      const sourceId = `correction-${randomUUID()}`
      await pool.query(
        `
          INSERT INTO audit.legacy_convex_corrections (
            organization_id, source_id, target_source_table, target_source_id,
            correction_type, reason, legacy_actor, original_timestamp,
            resolved, source_payload
          ) VALUES ($1, $2, $3, $4, 'reverse', $5, $6, $7, true, $8)
        `,
        [
          input.organizationId,
          sourceId,
          targetTable,
          targetId,
          reason,
          correctedBy,
          createdAt,
          {
            action: "reverse",
            correctedBy,
            createdAt,
            reason,
            targetId,
            targetKey: text(input.targetKey),
            targetLabel: text(input.targetLabel),
            targetTable,
          },
        ]
      )
      return { reversed: true }
    },

    async correctionCandidates(organizationId: string, limit = 200) {
      const client = await pool.connect()
      try {
        const source = await readCanonicalDashboardSource(
          client,
          organizationId
        )
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
          .slice(0, Math.min(Math.max(Math.floor(limit), 1), 200))
      } finally {
        client.release()
      }
    },
  }
}
