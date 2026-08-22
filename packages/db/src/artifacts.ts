import { createHash } from "node:crypto"
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
  bytes: Buffer
  fileName: string
  idempotencyKey: string
  mediaType: string
  organizationId: string
  origin: "generated" | "uploaded"
  purpose: string
  target: ArtifactTarget
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
    input.purpose,
  ].join(":")
}

export function createArtifactService(input: {
  connectionString: string
  provider: ArtifactStorageProvider
}) {
  const pool = new Pool({ connectionString: input.connectionString })

  return {
    async close() {
      await pool.end()
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
      if (!row) throw new Error("Artifact was not found.")
      if (
        row.lifecycle_state === "deleted" ||
        row.object_lifecycle_state !== "available"
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
      const fileName = safeFileName(storeInput.fileName)
      if (storeInput.bytes.byteLength === 0)
        throw new Error("Artifact bytes are required.")
      const sha256 = createHash("sha256").update(storeInput.bytes).digest("hex")
      const fingerprint = `${sha256}:${storeInput.bytes.byteLength}`
      const client = await pool.connect()
      let uploadedKey: string | undefined
      try {
        await client.query("BEGIN")
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          targetLockKey(storeInput),
        ])
        const retry = await existingArtifact(client, storeInput)
        if (retry) {
          await client.query("COMMIT")
          return artifactResult(retry)
        }

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
              AND lifecycle_state = 'available'
          `,
          [storeInput.organizationId, sha256, storeInput.bytes.byteLength]
        )
        if (!physical.rows[0]) {
          const uploaded = await input.provider.upload({
            bytes: storeInput.bytes,
            customId: `${storeInput.organizationId}:${fingerprint}`,
            mediaType: storeInput.mediaType,
            name: fileName,
          })
          uploadedKey = uploaded.key
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

        const versionResult = await client.query<{ version: number }>(
          `
            SELECT coalesce(max(version), 0)::integer + 1 AS version
            FROM core.file_links
            WHERE organization_id = $1 AND target_schema = $2
              AND target_table = $3 AND target_id = $4 AND purpose = $5
          `,
          [
            storeInput.organizationId,
            storeInput.target.schema,
            storeInput.target.table,
            storeInput.target.id,
            storeInput.purpose,
          ]
        )
        const version = versionResult.rows[0]!.version
        await client.query(
          `
            UPDATE core.file_links
            SET is_current = false, deactivated_at = now(), updated_at = now(),
              row_version = row_version + 1
            WHERE organization_id = $1 AND target_schema = $2
              AND target_table = $3 AND target_id = $4 AND purpose = $5 AND is_current
          `,
          [
            storeInput.organizationId,
            storeInput.target.schema,
            storeInput.target.table,
            storeInput.target.id,
            storeInput.purpose,
          ]
        )
        await client.query(
          `
            UPDATE core.files file
            SET lifecycle_state = 'superseded', updated_at = now()
            FROM core.file_links link
            WHERE link.file_id = file.id AND link.organization_id = $1
              AND link.target_schema = $2 AND link.target_table = $3
              AND link.target_id = $4 AND link.purpose = $5
              AND NOT link.is_current AND file.lifecycle_state = 'current'
          `,
          [
            storeInput.organizationId,
            storeInput.target.schema,
            storeInput.target.table,
            storeInput.target.id,
            storeInput.purpose,
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
            version,
            storeInput.actorUserId,
          ]
        )
        const stored = await existingArtifact(client, storeInput)
        await client.query("COMMIT")
        uploadedKey = undefined
        return artifactResult(stored!)
      } catch (error) {
        await client.query("ROLLBACK")
        if (uploadedKey)
          await input.provider
            .delete({ key: uploadedKey })
            .catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    },
  }
}
