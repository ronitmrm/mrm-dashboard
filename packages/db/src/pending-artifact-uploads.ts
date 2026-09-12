import { Pool, type PoolClient } from "pg"

export type PendingArtifactUploadStatus =
  | "abandoned"
  | "finalized"
  | "ready"
  | "rejected"
  | "uploaded"
  | "uploading"

export type PendingArtifactUploadRecord = {
  cleanupCompletedAt: Date | null
  cleanupError: string | null
  completedByteSize: number | null
  completedSha256: string | null
  confirmedOffset: number
  createdAt: Date
  expectedByteSize: number
  expiresAt: Date
  finalArtifactId: string | null
  finalPurpose: string | null
  finalTargetId: string | null
  finalTargetSchema: string | null
  finalTargetTable: string | null
  id: string
  intent: unknown
  mediaType: string
  organizationId: string
  originalFileName: string
  ownerUserId: string
  provider: "google-cloud-storage"
  providerKey: string
  resumableSession: string | null
  status: PendingArtifactUploadStatus
  temporaryGeneration: string | null
  updatedAt: Date
}

export class PendingArtifactUploadNotFoundError extends Error {
  constructor() {
    super("Pending upload was not found.")
    this.name = "PendingArtifactUploadNotFoundError"
  }
}

type PendingArtifactUploadRow = {
  cleanup_completed_at: Date | null
  cleanup_error: string | null
  completed_byte_size: string | null
  completed_sha256: string | null
  confirmed_offset: string
  created_at: Date
  expected_byte_size: string
  expires_at: Date
  final_artifact_id: string | null
  final_purpose: string | null
  final_target_id: string | null
  final_target_schema: string | null
  final_target_table: string | null
  id: string
  intent: unknown
  media_type: string
  organization_id: string
  original_file_name: string
  owner_user_id: string
  provider: "google-cloud-storage"
  provider_key: string
  resumable_session: string | null
  status: PendingArtifactUploadStatus
  temporary_generation: string | null
  updated_at: Date
}

const pendingUploadColumns = `
  id, organization_id, owner_user_id, intent, expected_byte_size::text,
  original_file_name, media_type, provider, provider_key, resumable_session,
  confirmed_offset::text, status, expires_at, completed_byte_size::text,
  completed_sha256, temporary_generation, final_target_schema,
  final_target_table, final_target_id, final_purpose, final_artifact_id,
  cleanup_error, cleanup_completed_at, created_at, updated_at
`

function record(row: PendingArtifactUploadRow): PendingArtifactUploadRecord {
  return {
    cleanupCompletedAt: row.cleanup_completed_at,
    cleanupError: row.cleanup_error,
    completedByteSize:
      row.completed_byte_size === null ? null : Number(row.completed_byte_size),
    completedSha256: row.completed_sha256,
    confirmedOffset: Number(row.confirmed_offset),
    createdAt: row.created_at,
    expectedByteSize: Number(row.expected_byte_size),
    expiresAt: row.expires_at,
    finalArtifactId: row.final_artifact_id,
    finalPurpose: row.final_purpose,
    finalTargetId: row.final_target_id,
    finalTargetSchema: row.final_target_schema,
    finalTargetTable: row.final_target_table,
    id: row.id,
    intent: row.intent,
    mediaType: row.media_type,
    organizationId: row.organization_id,
    originalFileName: row.original_file_name,
    ownerUserId: row.owner_user_id,
    provider: row.provider,
    providerKey: row.provider_key,
    resumableSession: row.resumable_session,
    status: row.status,
    temporaryGeneration: row.temporary_generation,
    updatedAt: row.updated_at,
  }
}

type MutablePendingArtifactUpload = Pick<
  PendingArtifactUploadRecord,
  | "cleanupCompletedAt"
  | "cleanupError"
  | "completedByteSize"
  | "completedSha256"
  | "confirmedOffset"
  | "finalArtifactId"
  | "finalPurpose"
  | "finalTargetId"
  | "finalTargetSchema"
  | "finalTargetTable"
  | "resumableSession"
  | "status"
  | "temporaryGeneration"
>

async function updateRecord(
  client: PoolClient,
  upload: PendingArtifactUploadRecord,
  changes: Partial<MutablePendingArtifactUpload>
) {
  const next = { ...upload, ...changes }
  const result = await client.query<PendingArtifactUploadRow>(
    `
      UPDATE core.pending_artifact_uploads
      SET confirmed_offset = $2, status = $3, resumable_session = $4,
        completed_byte_size = $5, completed_sha256 = $6,
        temporary_generation = $7, final_target_schema = $8,
        final_target_table = $9, final_target_id = $10, final_purpose = $11,
        final_artifact_id = $12, cleanup_error = $13,
        cleanup_completed_at = $14, updated_at = now()
      WHERE id = $1
      RETURNING ${pendingUploadColumns}
    `,
    [
      upload.id,
      next.confirmedOffset,
      next.status,
      next.resumableSession,
      next.completedByteSize,
      next.completedSha256,
      next.temporaryGeneration,
      next.finalTargetSchema,
      next.finalTargetTable,
      next.finalTargetId,
      next.finalPurpose,
      next.finalArtifactId,
      next.cleanupError,
      next.cleanupCompletedAt,
    ]
  )
  return record(result.rows[0]!)
}

export function createPendingArtifactUploadRepository(input: {
  connectionString?: string
  pool?: Pool
}) {
  if (!input.pool && !input.connectionString) {
    throw new Error("Pending upload repository requires PostgreSQL.")
  }
  const ownsPool = !input.pool
  const pool =
    input.pool ?? new Pool({ connectionString: input.connectionString })

  return {
    async close() {
      if (ownsPool) await pool.end()
    },

    async create(input: {
      expectedByteSize: number
      expiresAt: Date
      id: string
      intent: unknown
      mediaType: string
      organizationId: string
      originalFileName: string
      ownerUserId: string
      providerKey: string
      resumableSession: string
    }) {
      const result = await pool.query<PendingArtifactUploadRow>(
        `
          INSERT INTO core.pending_artifact_uploads (
            id, organization_id, owner_user_id, intent, expected_byte_size,
            original_file_name, media_type, provider_key, resumable_session,
            expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING ${pendingUploadColumns}
        `,
        [
          input.id,
          input.organizationId,
          input.ownerUserId,
          input.intent,
          input.expectedByteSize,
          input.originalFileName,
          input.mediaType,
          input.providerKey,
          input.resumableSession,
          input.expiresAt,
        ]
      )
      return record(result.rows[0]!)
    },

    async get(uploadId: string) {
      const result = await pool.query<PendingArtifactUploadRow>(
        `SELECT ${pendingUploadColumns}
         FROM core.pending_artifact_uploads
         WHERE id = $1`,
        [uploadId]
      )
      return result.rows[0] ? record(result.rows[0]) : null
    },

    async listCleanupCandidateIds(input: { before: Date; limit: number }) {
      const result = await pool.query<{ id: string }>(
        `
          SELECT id
          FROM core.pending_artifact_uploads
          WHERE cleanup_completed_at IS NULL
            AND (
              status = 'finalized'
              OR status IN ('abandoned', 'rejected')
              OR expires_at <= $1
            )
          ORDER BY expires_at, id
          LIMIT $2
        `,
        [input.before, input.limit]
      )
      return result.rows.map(({ id }) => id)
    },

    async withLockedUpload<T>(
      uploadId: string,
      operation: (
        upload: PendingArtifactUploadRecord,
        save: (
          changes: Partial<MutablePendingArtifactUpload>
        ) => Promise<PendingArtifactUploadRecord>,
        client: PoolClient
      ) => Promise<T>
    ) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        const result = await client.query<PendingArtifactUploadRow>(
          `
            SELECT ${pendingUploadColumns}
            FROM core.pending_artifact_uploads
            WHERE id = $1
            FOR UPDATE
          `,
          [uploadId]
        )
        let upload = result.rows[0] ? record(result.rows[0]) : null
        if (!upload) throw new PendingArtifactUploadNotFoundError()
        const value = await operation(
          upload,
          async (changes) => {
            upload = await updateRecord(client, upload!, changes)
            return upload
          },
          client
        )
        await client.query("COMMIT")
        return value
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    },
  }
}
