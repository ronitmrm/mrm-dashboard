import { createHash, randomUUID } from "node:crypto"
import path from "node:path"

import { Pool, type PoolClient } from "pg"

export type ArtifactStorageProvider = {
  delete(input: { key: string }): Promise<void>
  upload(input: {
    bytes: Buffer
    customId: string
    mediaType: string
    name: string
  }): Promise<{ key: string; url: string }>
}

export type ArtifactTarget = {
  id: string
  schema: string
  table: string
}

export type StoreArtifactInput = {
  actorUserId: string | null
  authorizeTarget?: (
    client: PoolClient,
    context: { isRetry: boolean }
  ) => Promise<void>
  bytes: Buffer
  fileName: string
  idempotencyKey: string
  mediaType: string
  organizationId: string
  origin: "generated" | "uploaded"
  purpose: string
  supersedesPurposes?: readonly string[]
  target: ArtifactTarget
}

export type DeleteArtifactInput = {
  actorUserId: string | null
  artifactId: string
  confirmation: string
  organizationId: string
  reason: string
}

type ArtifactRow = {
  byte_size: string
  file_name: string
  id: string
  is_current: boolean
  lifecycle_state: "current" | "deleted" | "superseded"
  media_type: string | null
  object_lifecycle_state: "available" | "deleted" | "deletion_failed"
  origin: "generated" | "legacy" | "uploaded"
  provider_key: string
  public_url: string
  sha256: string
  version: number
}

function safeFileName(fileName: string) {
  if (
    !fileName ||
    path.basename(fileName) !== fileName ||
    fileName === "." ||
    fileName === ".."
  ) {
    throw new Error("Artifact file name must be a safe base name.")
  }
  return fileName
}

function artifactResult(row: ArtifactRow) {
  return {
    byteSize: Number(row.byte_size),
    fileName: row.file_name,
    id: row.id,
    isCurrent: row.is_current,
    lifecycleState: row.lifecycle_state,
    mediaType: row.media_type,
    origin: row.origin,
    providerKey: row.provider_key,
    publicUrl: row.public_url,
    sha256: row.sha256,
    version: row.version,
  }
}

const artifactColumns = `
  file.id, file.file_name, file.media_type, file.origin,
  file.lifecycle_state, file.byte_size::text, object.sha256,
  object.provider_key, object.public_url,
  object.lifecycle_state AS object_lifecycle_state,
  link.version, link.is_current
`

async function existingArtifact(
  client: PoolClient,
  input: Pick<StoreArtifactInput, "idempotencyKey" | "organizationId">
) {
  const result = await client.query<ArtifactRow>(
    `
      SELECT ${artifactColumns}
      FROM core.files file
      JOIN core.file_objects object ON object.id = file.physical_object_id
      JOIN core.file_links link ON link.file_id = file.id
      WHERE file.organization_id = $1
        AND file.source_system = 'artifact-service'
        AND file.source_table = 'artifacts'
        AND file.source_id = $2
      LIMIT 1
    `,
    [input.organizationId, `${input.organizationId}:${input.idempotencyKey}`]
  )
  return result.rows[0]
}

function targetLockKey(input: StoreArtifactInput) {
  return [
    input.organizationId,
    input.target.schema,
    input.target.table,
    input.target.id,
  ].join(":")
}

export function createArtifactService(input: {
  connectionString: string
  provider?: ArtifactStorageProvider
}) {
  const pool = new Pool({ connectionString: input.connectionString })

  async function storeSet(storeInputs: readonly StoreArtifactInput[]) {
    const provider = input.provider
    if (!provider) {
      throw new Error("Artifact storage provider is required for writes.")
    }
    if (storeInputs.length === 0) {
      throw new Error("Artifact set must contain at least one file.")
    }
    const [first] = storeInputs
    if (
      !first ||
      storeInputs.some(
        (candidate) =>
          candidate.organizationId !== first.organizationId ||
          candidate.target.id !== first.target.id ||
          candidate.target.schema !== first.target.schema ||
          candidate.target.table !== first.target.table
      )
    ) {
      throw new Error("Artifact set members must share one target.")
    }
    if (
      new Set(storeInputs.map((candidate) => candidate.idempotencyKey)).size !==
        storeInputs.length ||
      new Set(storeInputs.map((candidate) => candidate.purpose)).size !==
        storeInputs.length
    ) {
      throw new Error(
        "Artifact set members need unique purposes and retry keys."
      )
    }

    const prepared = storeInputs.map((storeInput) => {
      const fileName = safeFileName(storeInput.fileName)
      if (storeInput.bytes.byteLength === 0) {
        throw new Error("Artifact bytes are required.")
      }
      const sha256 = createHash("sha256").update(storeInput.bytes).digest("hex")
      return {
        fileName,
        fingerprint: `${sha256}:${storeInput.bytes.byteLength}`,
        sha256,
        storeInput,
      }
    })
    const client = await pool.connect()
    const uploadedKeys: string[] = []
    try {
      await client.query("BEGIN")
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        targetLockKey(first),
      ])
      const results = []
      for (const item of prepared) {
        const { fileName, fingerprint, sha256, storeInput } = item
        const retry = await existingArtifact(client, storeInput)
        if (retry) {
          await storeInput.authorizeTarget?.(client, { isRetry: true })
          results.push(artifactResult(retry))
          continue
        }
        await storeInput.authorizeTarget?.(client, { isRetry: false })
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
          [storeInput.organizationId, fingerprint]
        )
        let physical = await client.query<{
          id: string
          provider_key: string
          public_url: string
        }>(
          `
            SELECT id, provider_key, public_url
            FROM core.file_objects
            WHERE organization_id = $1 AND sha256 = $2 AND byte_size = $3
              AND lifecycle_state <> 'deleted'
          `,
          [storeInput.organizationId, sha256, storeInput.bytes.byteLength]
        )
        if (!physical.rows[0]) {
          const uploaded = await provider.upload({
            bytes: storeInput.bytes,
            customId: `${storeInput.organizationId}:${fingerprint}`,
            mediaType: storeInput.mediaType,
            name: fileName,
          })
          uploadedKeys.push(uploaded.key)
          physical = await client.query<{
            id: string
            provider_key: string
            public_url: string
          }>(
            `
              INSERT INTO core.file_objects (
                organization_id, sha256, byte_size, provider, provider_key, public_url
              )
              VALUES ($1, $2, $3, 'uploadthing', $4, $5)
              ON CONFLICT (organization_id, sha256, byte_size) DO UPDATE
              SET provider = EXCLUDED.provider,
                provider_key = EXCLUDED.provider_key,
                public_url = EXCLUDED.public_url,
                lifecycle_state = 'available',
                deletion_error = NULL,
                updated_at = now()
              WHERE core.file_objects.lifecycle_state = 'deleted'
              RETURNING id, provider_key, public_url
            `,
            [
              storeInput.organizationId,
              sha256,
              storeInput.bytes.byteLength,
              uploaded.key,
              uploaded.url,
            ]
          )
        }
        const replacedPurposes = [
          ...new Set([
            storeInput.purpose,
            ...(storeInput.supersedesPurposes ?? []),
          ]),
        ]
        const versionResult = await client.query<{ version: number }>(
          `
            SELECT coalesce(max(version), 0)::integer + 1 AS version
            FROM core.file_links
            WHERE organization_id = $1 AND target_schema = $2
              AND target_table = $3 AND target_id = $4 AND purpose = ANY($5::text[])
          `,
          [
            storeInput.organizationId,
            storeInput.target.schema,
            storeInput.target.table,
            storeInput.target.id,
            replacedPurposes,
          ]
        )
        await client.query(
          `
            UPDATE core.file_links
            SET is_current = false, deactivated_at = now(), updated_at = now(),
              row_version = row_version + 1
            WHERE organization_id = $1 AND target_schema = $2
              AND target_table = $3 AND target_id = $4
              AND purpose = ANY($5::text[]) AND is_current
          `,
          [
            storeInput.organizationId,
            storeInput.target.schema,
            storeInput.target.table,
            storeInput.target.id,
            replacedPurposes,
          ]
        )
        await client.query(
          `
            UPDATE core.files file
            SET lifecycle_state = 'superseded', updated_at = now()
            FROM core.file_links link
            WHERE link.file_id = file.id AND link.organization_id = $1
              AND link.target_schema = $2 AND link.target_table = $3
              AND link.target_id = $4 AND link.purpose = ANY($5::text[])
              AND NOT link.is_current AND file.lifecycle_state = 'current'
          `,
          [
            storeInput.organizationId,
            storeInput.target.schema,
            storeInput.target.table,
            storeInput.target.id,
            replacedPurposes,
          ]
        )
        const file = await client.query<{ id: string }>(
          `
            INSERT INTO core.files (
              organization_id, file_name, media_type, byte_size, sha256,
              storage_key, source_system, source_table, source_id,
              source_payload, physical_object_id, origin, created_by_user_id, updated_by_user_id
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, 'artifact-service', 'artifacts', $7,
              $8, $9, $10, $11, $11
            )
            RETURNING id
          `,
          [
            storeInput.organizationId,
            fileName,
            storeInput.mediaType,
            storeInput.bytes.byteLength,
            sha256,
            physical.rows[0]!.provider_key,
            `${storeInput.organizationId}:${storeInput.idempotencyKey}`,
            {
              idempotencyKey: storeInput.idempotencyKey,
              purpose: storeInput.purpose,
              target: storeInput.target,
            },
            physical.rows[0]!.id,
            storeInput.origin,
            storeInput.actorUserId,
          ]
        )
        await client.query(
          `
            INSERT INTO core.file_links (
              organization_id, file_id, target_schema, target_table,
              target_id, purpose, version, is_current, created_by_user_id, updated_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $8)
          `,
          [
            storeInput.organizationId,
            file.rows[0]!.id,
            storeInput.target.schema,
            storeInput.target.table,
            storeInput.target.id,
            storeInput.purpose,
            versionResult.rows[0]!.version,
            storeInput.actorUserId,
          ]
        )
        results.push(
          artifactResult((await existingArtifact(client, storeInput))!)
        )
      }
      await client.query("COMMIT")
      uploadedKeys.length = 0
      return results
    } catch (error) {
      await client.query("ROLLBACK")
      await Promise.all(
        uploadedKeys.map((key) =>
          provider.delete({ key }).catch(() => undefined)
        )
      )
      throw error
    } finally {
      client.release()
    }
  }

  return {
    async close() {
      await pool.end()
    },

    async listByOrganization(query: { organizationId: string }) {
      const result = await pool.query<ArtifactRow>(
        `
          SELECT ${artifactColumns}
          FROM core.files file
          JOIN core.file_objects object ON object.id = file.physical_object_id
          JOIN core.file_links link ON link.file_id = file.id
          WHERE file.organization_id = $1
            AND file.source_system = 'artifact-service'
          ORDER BY file.created_at DESC, file.id DESC
        `,
        [query.organizationId]
      )
      return result.rows.map(artifactResult)
    },

    async getCurrent(query: {
      organizationId: string
      purpose: string
      target: ArtifactTarget
    }) {
      const result = await pool.query<ArtifactRow>(
        `
          SELECT ${artifactColumns}
          FROM core.file_links link
          JOIN core.files file ON file.id = link.file_id
          JOIN core.file_objects object ON object.id = file.physical_object_id
          WHERE link.organization_id = $1
            AND link.target_schema = $2 AND link.target_table = $3
            AND link.target_id = $4 AND link.purpose = $5
            AND link.is_current
          LIMIT 1
        `,
        [
          query.organizationId,
          query.target.schema,
          query.target.table,
          query.target.id,
          query.purpose,
        ]
      )
      const row = result.rows[0]
      if (!row) {
        const tombstone = await pool.query(
          `
            SELECT 1
            FROM core.file_links link
            JOIN core.files file ON file.id = link.file_id
            WHERE link.organization_id = $1
              AND link.target_schema = $2 AND link.target_table = $3
              AND link.target_id = $4 AND link.purpose = $5
              AND file.lifecycle_state = 'deleted'
            LIMIT 1
          `,
          [
            query.organizationId,
            query.target.schema,
            query.target.table,
            query.target.id,
            query.purpose,
          ]
        )
        if (tombstone.rows[0]) {
          throw new Error("Artifact is deleted or unavailable.")
        }
        throw new Error("Artifact was not found.")
      }
      if (
        row.lifecycle_state === "deleted" ||
        row.object_lifecycle_state === "deleted"
      ) {
        throw new Error("Artifact is deleted or unavailable.")
      }
      return artifactResult(row)
    },

    async listHistory(query: {
      organizationId: string
      purpose: string
      target: ArtifactTarget
    }) {
      const result = await pool.query<ArtifactRow>(
        `
          SELECT ${artifactColumns}
          FROM core.file_links link
          JOIN core.files file ON file.id = link.file_id
          JOIN core.file_objects object ON object.id = file.physical_object_id
          WHERE link.organization_id = $1
            AND link.target_schema = $2 AND link.target_table = $3
            AND link.target_id = $4 AND link.purpose = $5
          ORDER BY link.version DESC, link.id DESC
        `,
        [
          query.organizationId,
          query.target.schema,
          query.target.table,
          query.target.id,
          query.purpose,
        ]
      )
      return result.rows.map(artifactResult)
    },

    async store(storeInput: StoreArtifactInput) {
      return (await storeSet([storeInput]))[0]!
    },

    storeSet,

    async delete(deleteInput: DeleteArtifactInput) {
      const provider = input.provider
      if (!provider) {
        throw new Error("Artifact storage provider is required for deletion.")
      }
      const reason = deleteInput.reason.trim()
      if (!reason) throw new Error("Artifact deletion reason is required.")
      if (reason.length > 1000) {
        throw new Error("Artifact deletion reason must be 1000 characters or less.")
      }

      const client = await pool.connect()
      let objectId: string | undefined
      let providerDeletionFailed = false
      try {
        await client.query("BEGIN")
        const fingerprint = await client.query<{
          byte_size: string
          sha256: string
        }>(
          `
            SELECT object.byte_size::text, object.sha256
            FROM core.files file
            JOIN core.file_objects object ON object.id = file.physical_object_id
            WHERE file.organization_id = $1 AND file.id = $2
              AND file.source_system = 'artifact-service'
          `,
          [deleteInput.organizationId, deleteInput.artifactId]
        )
        const fingerprintRow = fingerprint.rows[0]
        if (!fingerprintRow) throw new Error("Artifact was not found.")
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
          [
            deleteInput.organizationId,
            `${fingerprintRow.sha256}:${fingerprintRow.byte_size}`,
          ]
        )
        const artifact = await client.query<{
          file_name: string
          lifecycle_state: "current" | "deleted" | "superseded"
          object_lifecycle_state: "available" | "deleted" | "deletion_failed"
          origin: "generated" | "legacy" | "uploaded"
          physical_object_id: string
          provider_key: string
          sha256: string
          source_id: string
          source_system: string
          source_table: string
        }>(
          `
            SELECT file.file_name, file.lifecycle_state, file.origin,
              file.sha256, file.source_system, file.source_table, file.source_id,
              file.physical_object_id, object.provider_key,
              object.lifecycle_state AS object_lifecycle_state
            FROM core.files file
            JOIN core.file_objects object ON object.id = file.physical_object_id
            WHERE file.organization_id = $1 AND file.id = $2
              AND file.source_system = 'artifact-service'
            FOR UPDATE OF file, object
          `,
          [deleteInput.organizationId, deleteInput.artifactId]
        )
        const row = artifact.rows[0]
        if (!row) throw new Error("Artifact was not found.")
        const releasedDrawing = await client.query<{ exists: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM catalog.drawing_revisions revision
             WHERE revision.file_id = $1
               AND revision.status IN ('Released', 'Superseded')
           ) AS exists`,
          [deleteInput.artifactId]
        )
        if (releasedDrawing.rows[0]?.exists) {
          throw new Error("Released drawing revision evidence cannot be deleted.")
        }
        if (deleteInput.confirmation !== row.file_name) {
          throw new Error(
            "Artifact deletion confirmation must match the filename."
          )
        }
        objectId = row.physical_object_id
        if (row.lifecycle_state === "deleted") {
          await client.query("COMMIT")
          return {
            artifactId: deleteInput.artifactId,
            physicalObjectDeleted: row.object_lifecycle_state === "deleted",
          }
        }

        const references = await client.query<{ count: string }>(
          `
            SELECT count(*)::text AS count
            FROM core.files
            WHERE organization_id = $1 AND physical_object_id = $2
              AND source_system = 'artifact-service'
              AND lifecycle_state <> 'deleted' AND id <> $3
          `,
          [
            deleteInput.organizationId,
            row.physical_object_id,
            deleteInput.artifactId,
          ]
        )
        const finalLiveReference = references.rows[0]?.count === "0"
        if (finalLiveReference && row.object_lifecycle_state !== "deleted") {
          try {
            await provider.delete({ key: row.provider_key })
          } catch (error) {
            providerDeletionFailed = true
            throw error
          }
          await client.query(
            `
              UPDATE core.file_objects
              SET lifecycle_state = 'deleted', deletion_error = NULL,
                updated_at = now()
              WHERE id = $1
            `,
            [row.physical_object_id]
          )
        }

        await client.query(
          `
            UPDATE core.files
            SET lifecycle_state = 'deleted', deleted_at = now(),
              deleted_by_user_id = $3, deletion_reason = $4,
              updated_by_user_id = $3, updated_at = now()
            WHERE organization_id = $1 AND id = $2
          `,
          [
            deleteInput.organizationId,
            deleteInput.artifactId,
            deleteInput.actorUserId,
            reason,
          ]
        )
        await client.query(
          `
            UPDATE core.file_links
            SET is_current = false, deactivated_at = coalesce(deactivated_at, now()),
              updated_by_user_id = $3, updated_at = now(),
              row_version = row_version + 1
            WHERE organization_id = $1 AND file_id = $2
          `,
          [
            deleteInput.organizationId,
            deleteInput.artifactId,
            deleteInput.actorUserId,
          ]
        )
        await client.query(
          `
            INSERT INTO audit.events (
              organization_id, event_type, target_schema, target_table,
              target_id, actor_user_id, reason, before_state, after_state,
              metadata, source_system, source_table, source_id
            ) VALUES (
              $1, 'artifact.deleted', 'core', 'files', $2, $3, $4,
              $5, $6, $7, 'mrm-dashboard', 'artifact_deletions', $8
            )
          `,
          [
            deleteInput.organizationId,
            deleteInput.artifactId,
            deleteInput.actorUserId,
            reason,
            { lifecycleState: row.lifecycle_state },
            { lifecycleState: "deleted" },
            {
              fileName: row.file_name,
              origin: row.origin,
              physicalObjectDeleted: finalLiveReference,
              providerKey: row.provider_key,
              sha256: row.sha256,
              sourceId: row.source_id,
              sourceSystem: row.source_system,
              sourceTable: row.source_table,
            },
            randomUUID(),
          ]
        )
        await client.query("COMMIT")
        return {
          artifactId: deleteInput.artifactId,
          physicalObjectDeleted: finalLiveReference,
        }
      } catch (error) {
        await client.query("ROLLBACK")
        if (objectId && providerDeletionFailed) {
          const message =
            error instanceof Error ? error.message : "Artifact deletion failed."
          await pool.query(
            `
              UPDATE core.file_objects
              SET lifecycle_state = 'deletion_failed', deletion_error = $2,
                updated_at = now()
              WHERE id = $1 AND lifecycle_state <> 'deleted'
            `,
            [objectId, message.slice(0, 1000)]
          )
        }
        throw error
      } finally {
        client.release()
      }
    },
  }
}
