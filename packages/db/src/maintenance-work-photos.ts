import type { PoolClient } from "pg"

import type { ArtifactStorageProviderIdentifier } from "./artifacts"
import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

export type MaintenanceWorkPhotoTarget =
  | { kind: "machine"; taskKey: string }
  | { kind: "asset-planned"; scheduleId: string; dueOn: string }
  | { kind: "asset-breakdown"; breakdownId: string }

export type ResolvedMaintenanceWorkPhotoTarget = {
  id: string
  schema: "maintenance" | "store"
  table: "tasks" | "asset_maintenance_tasks" | "asset_breakdowns"
}

export async function authorizeMaintenanceWorkPhotoTarget(
  client: PoolClient,
  organizationId: string,
  target: ResolvedMaintenanceWorkPhotoTarget
) {
  const table = `${target.schema}.${target.table}`
  if (!new Set([
    "maintenance.tasks",
    "store.asset_maintenance_tasks",
    "store.asset_breakdowns",
  ]).has(table)) throw new Error("Maintenance photo target is invalid.")
  const result = await client.query(
    `SELECT id FROM ${table} WHERE id = $1 AND organization_id = $2 FOR KEY SHARE`,
    [target.id, organizationId]
  )
  if (!result.rows[0]) throw new Error("Maintenance photo target was not found.")
}

export function createMaintenanceWorkPhotoRepository(options: RepositoryPoolOptions) {
  const { close, pool } = repositoryPool(options)
  return {
    close,

    async organizationIdForCode(code: string) {
      const result = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
        [code]
      )
      if (!result.rows[0]) throw new Error("Organization was not found.")
      return result.rows[0].id
    },

    async resolveTarget(organizationId: string, target: MaintenanceWorkPhotoTarget): Promise<ResolvedMaintenanceWorkPhotoTarget | null> {
      if (target.kind === "machine") {
        const result = await pool.query<{ id: string }>(
          `SELECT id FROM maintenance.tasks WHERE organization_id = $1
            AND lower(task_key) = lower($2) AND lower(task_type) IN ('planned', 'breakdown')`,
          [organizationId, target.taskKey]
        )
        return result.rows[0] ? { id: result.rows[0].id, schema: "maintenance", table: "tasks" } : null
      }
      if (target.kind === "asset-planned") {
        const result = await pool.query<{ id: string }>(
          `SELECT id FROM store.asset_maintenance_tasks WHERE organization_id = $1
            AND schedule_id = $2 AND due_on = $3::date`,
          [organizationId, target.scheduleId, target.dueOn]
        )
        return result.rows[0] ? { id: result.rows[0].id, schema: "store", table: "asset_maintenance_tasks" } : null
      }
      const result = await pool.query<{ id: string }>(
        `SELECT id FROM store.asset_breakdowns WHERE organization_id = $1 AND id = $2`,
        [organizationId, target.breakdownId]
      )
      return result.rows[0] ? { id: result.rows[0].id, schema: "store", table: "asset_breakdowns" } : null
    },

    async listPhotos(organizationId: string, target: ResolvedMaintenanceWorkPhotoTarget) {
      const result = await pool.query<{ fileName: string; id: string; purpose: string }>(
        `SELECT file.id, file.file_name AS "fileName", link.purpose
         FROM core.file_links link
         JOIN core.files file ON file.id = link.file_id
         JOIN core.file_objects object ON object.id = file.physical_object_id
         WHERE link.organization_id = $1 AND link.target_schema = $2
           AND link.target_table = $3 AND link.target_id = $4
           AND link.purpose LIKE 'work-photo:%' AND link.is_current
           AND file.lifecycle_state = 'current' AND object.lifecycle_state = 'available'
         ORDER BY link.created_at, link.id`,
        [organizationId, target.schema, target.table, target.id]
      )
      return result.rows
    },

    async getPhoto(organizationId: string, target: ResolvedMaintenanceWorkPhotoTarget, photoId: string) {
      const result = await pool.query<{
        available: boolean
        byte_size: string | null
        file_name: string
        media_type: string | null
        physical_object_id: string | null
        provider: ArtifactStorageProviderIdentifier | null
        provider_key: string | null
        sha256: string | null
        storage_key: string | null
      }>(
        `SELECT file.file_name, file.media_type, file.storage_key,
           file.physical_object_id, object.provider, object.provider_key,
           coalesce(object.byte_size, file.byte_size)::text AS byte_size,
           coalesce(object.sha256, file.sha256) AS sha256,
           (file.lifecycle_state <> 'deleted' AND (
             file.physical_object_id IS NULL OR object.lifecycle_state = 'available'
           )) AS available
         FROM core.file_links link
         JOIN core.files file ON file.id = link.file_id
         LEFT JOIN core.file_objects object ON object.id = file.physical_object_id
         WHERE link.organization_id = $1 AND link.target_schema = $2
           AND link.target_table = $3 AND link.target_id = $4
           AND link.file_id = $5 AND link.purpose LIKE 'work-photo:%'
           AND link.is_current LIMIT 1`,
        [organizationId, target.schema, target.table, target.id, photoId]
      )
      const row = result.rows[0]
      return row ? {
        available: row.available,
        byteSize: row.byte_size === null ? null : Number(row.byte_size),
        fileName: row.file_name,
        mediaType: row.media_type,
        physicalObjectId: row.physical_object_id,
        provider: row.provider,
        providerKey: row.provider_key,
        sha256: row.sha256,
        storageKey: row.storage_key,
      } : null
    },
  }
}
